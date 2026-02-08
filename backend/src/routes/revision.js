const express = require('express');
const mongoose = require('mongoose');

const { requireAuth } = require('../middleware/requireAuth');
const RevisionItem = require('../models/RevisionItem');
const MonthlyRevisionArchive = require('../models/MonthlyRevisionArchive');
const { normalizeDifficulty } = require('../utils/revision');
const {
  startOfDay,
  startOfUtcDay,
  computeBucketDueAt,
  endOfDay,
  endOfUtcDay,
  getUpcomingSunday,
  getNextSunday,
  getEndOfMonth,
} = require('../utils/revisionBuckets');
const { fetchQuestionDetails, fetchRecentAcceptedSubmissions } = require('../services/leetcodeClient');

const router = express.Router();

function requireMongo(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'MongoDB not connected',
      hint: 'Set MONGO_URI in your .env and restart the server',
    });
  }
  next();
}

function getUserId(req) {
  const id = req.user && (req.user._id || req.user.id);
  return new mongoose.Types.ObjectId(id);
}

function isValidBucket(bucket) {
  return bucket === 'today' || bucket === 'week' || bucket === 'month';
}

function defaultBucketForDifficulty(difficulty) {
  const d = normalizeDifficulty(difficulty);
  if (d === 'Medium' || d === 'Hard') return 'week';
  return 'today';
}

function normalizeLeetCodeSlug(input) {
  let s = String(input || '').trim();
  if (!s) return '';

  // Accept full URLs like:
  // https://leetcode.com/problems/two-sum/
  // leetcode.com/problems/two-sum?x=y
  const m = s.match(/leetcode\.com\/problems\/([^/?#]+)/i) || s.match(/\/problems\/([^/?#]+)/i);
  if (m && m[1]) s = m[1];

  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return s;
}

async function findExistingByKey({ userId, source, ref }) {
  const questionKey = `${String(source).trim().toLowerCase()}:${String(ref).trim().toLowerCase()}`;
  return RevisionItem.findOne({ userId, questionKey }).lean();
}

async function upsertStarRevisionItems({ userId, slug, title, difficulty, link }) {
  const now = new Date();
  const ref = slug;

  const weekSource = 'leetcode_star_week';
  const monthSource = 'leetcode_star_month';

  const weekExisting = await findExistingByKey({ userId, source: weekSource, ref });
  const monthExisting = await findExistingByKey({ userId, source: monthSource, ref });

  const created = { week: false, month: false };
  const items = { week: weekExisting || null, month: monthExisting || null };

  if (!weekExisting) {
    const weekItem = await RevisionItem.create({
      userId,
      source: weekSource,
      ref,
      title,
      difficulty,
      link,
      bucket: 'week',
      bucketDueAt: computeBucketDueAt('week', now),
    });
    created.week = true;
    items.week = weekItem.toObject ? weekItem.toObject() : weekItem;
  }

  if (!monthExisting) {
    const monthItem = await RevisionItem.create({
      userId,
      source: monthSource,
      ref,
      title,
      difficulty,
      link,
      bucket: 'month',
      bucketDueAt: computeBucketDueAt('month', now),
    });
    created.month = true;
    items.month = monthItem.toObject ? monthItem.toObject() : monthItem;
  }

  return { created, items };
}

function toISTMonthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

async function archiveMonthlyCompletions({ userId, items }) {
  const opsByMonth = new Map();

  for (const it of items) {
    const completedAt = it?.monthCompletedAt;
    const monthKey = toISTMonthKey(completedAt);
    if (!monthKey) continue;

    const source = String(it.source || '').trim().toLowerCase();
    const ref = String(it.ref || '').trim();
    if (!source || !ref) continue;

    const itemKey = `${source}:${String(ref).toLowerCase()}`;
    const archivedItem = {
      itemKey,
      source,
      ref,
      title: it.title || ref,
      difficulty: normalizeDifficulty(it.difficulty) || null,
      link: it.link || '',
      completedAt: new Date(completedAt),
    };

    if (!opsByMonth.has(monthKey)) opsByMonth.set(monthKey, []);
    opsByMonth.get(monthKey).push(archivedItem);
  }

  if (!opsByMonth.size) return;

  const bulkOps = [];
  for (const [monthKey, monthItems] of opsByMonth.entries()) {
    // Add-to-set prevents duplicates per question per month.
    bulkOps.push({
      updateOne: {
        filter: { userId, monthKey },
        update: {
          $setOnInsert: { userId, monthKey, createdAt: new Date() },
          $addToSet: { items: { $each: monthItems } },
          $set: { updatedAt: new Date() },
        },
        upsert: true,
      },
    });
  }

  await MonthlyRevisionArchive.bulkWrite(bulkOps, { ordered: false });
}

function latestAcceptedMsBySlugFromSubmissions(submissions) {
  const latestAcceptedMsBySlug = new Map();
  for (const s of submissions || []) {
    const slug = String(s?.titleSlug || '').trim();
    const ts = Number(s?.timestamp);
    if (!slug || !Number.isFinite(ts)) continue;
    const ms = ts * 1000;
    const prev = latestAcceptedMsBySlug.get(slug);
    if (!prev || ms > prev) latestAcceptedMsBySlug.set(slug, ms);
  }
  return latestAcceptedMsBySlug;
}

async function autoCompleteTodayItemsFromLeetCode({ userId, latestAcceptedMsBySlug }) {
  if (!latestAcceptedMsBySlug || !latestAcceptedMsBySlug.size) {
    return { updated: 0, reason: 'no_submissions' };
  }

  const todayItems = await RevisionItem.find({
    userId,
    bucket: 'today',
    source: 'leetcode',
    ref: { $ne: null },
  }).lean();

  if (!todayItems.length) return { updated: 0, reason: 'no_items' };

  const now = new Date();
  // Task-day boundary: 5:30 AM IST == midnight UTC.
  const todayStart = startOfUtcDay(now).getTime();
  const todayEnd = endOfUtcDay(now).getTime();

  const ops = [];
  for (const item of todayItems) {
    const slug = String(item?.ref || '').trim();
    const acceptedMs = latestAcceptedMsBySlug.get(slug);
    if (!acceptedMs) continue;

    // Only count it as done if the accepted submission happened today.
    if (acceptedMs < todayStart || acceptedMs > todayEnd) continue;

    // If it was already completed during this due day, skip.
    const lastCompletedAtMs = item?.lastCompletedAt ? new Date(item.lastCompletedAt).getTime() : NaN;
    if (Number.isFinite(lastCompletedAtMs) && lastCompletedAtMs >= todayStart) continue;

    const completedAt = new Date(acceptedMs);
    ops.push({
      updateOne: {
        filter: { _id: item._id, userId },
        update: {
          $set: {
            lastCompletedAt: completedAt,
            // After completing Today's task, move it into the Weekly rotation.
            bucket: 'week',
            bucketDueAt: weeklyDueAtAfterComplete(completedAt),
            weekCompletedAt: null,
            monthCompletedAt: null,
            updatedAt: new Date(),
          },
        },
      },
    });
  }

  if (!ops.length) return { updated: 0, reason: 'no_matches' };
  const result = await RevisionItem.bulkWrite(ops, { ordered: false });
  return { updated: result?.modifiedCount || 0, reason: 'ok' };
}

async function rolloverOverdueTodayToNextDay({ userId }) {
  // At the task-day boundary (5:30 AM IST == midnight UTC), any remaining
  // Today bucket items that were not completed should carry over to the next day.
  // We detect "overdue" Today items by comparing their dueAt to the start of
  // the current UTC day.
  const now = new Date();
  const startUtcMs = startOfUtcDay(now).getTime();

  const overdueToday = await RevisionItem.find({
    userId,
    bucket: 'today',
    bucketDueAt: { $lt: new Date(startUtcMs) },
  })
    .select({ _id: 1 })
    .lean();

  if (!overdueToday.length) return { moved: 0 };

  const ids = overdueToday.map((x) => x._id);
  const result = await RevisionItem.updateMany(
    { userId, _id: { $in: ids } },
    {
      $set: {
        bucket: 'today',
        // Carry forward: make it due by the end of the current UTC day.
        bucketDueAt: computeBucketDueAt('today', now),
        updatedAt: new Date(),
      },
    },
  );

  return { moved: result?.modifiedCount || 0 };
}

async function rolloverOverdueMonthToNextMonth({ userId }) {
  // Month bucket items are due at end-of-month. If the month has rolled over and
  // the user didn't complete them, keep them in the Month bucket and extend the
  // due date to the end of the current month.
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const query = {
    userId,
    bucket: 'month',
    monthCompletedAt: null,
    $or: [{ bucketDueAt: { $lt: startOfThisMonth } }, { bucketDueAt: null }],
  };

  const result = await RevisionItem.updateMany(query, {
    $set: {
      bucket: 'month',
      bucketDueAt: computeBucketDueAt('month', now),
      updatedAt: new Date(),
    },
  });

  return { moved: result?.modifiedCount || 0 };
}

async function rolloverOverdueWeekToNextWeek({ userId }) {
  // Weekly reset boundary is Sunday 5:30 AM IST == Sunday 00:00 UTC.
  // If a Weekly item is overdue (its dueAt is before the start of the current UTC day),
  // keep it in Week but extend it to the next upcoming Sunday.
  const now = new Date();
  const startUtcMs = startOfUtcDay(now).getTime();

  const result = await RevisionItem.updateMany(
    {
      userId,
      bucket: 'week',
      bucketDueAt: { $lt: new Date(startUtcMs) },
    },
    {
      $set: {
        bucket: 'week',
        bucketDueAt: computeBucketDueAt('week', now),
        updatedAt: new Date(),
      },
    },
  );

  return { moved: result?.modifiedCount || 0 };
}

// GET /api/revision/summary
router.get('/summary', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);

  // Cleanup: once a month is over, remove items that were marked done in a previous month.
  // This keeps the Month bucket focused on the current month.
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const toCleanup = await RevisionItem.find({
    userId,
    bucket: 'month',
    monthCompletedAt: { $ne: null, $lt: startOfThisMonth },
  }).lean();

  // Before removing last-month completed items from the active Month bucket,
  // archive them month-wise so they never disappear.
  if (toCleanup.length) {
    await archiveMonthlyCompletions({ userId, items: toCleanup });
    await RevisionItem.deleteMany({
      userId,
      bucket: 'month',
      monthCompletedAt: { $ne: null, $lt: startOfThisMonth },
    });
  }

  // Pull recent accepted submissions once; use for both:
  // - Auto-marking Today bucket items done
  // - Returning "last submitted on LeetCode" timestamps per item
  let latestAcceptedMsBySlug = new Map();
  try {
    const username = req.user?.leetcodeUsername;
    if (username) {
      const submissions = await fetchRecentAcceptedSubmissions({ username, limit: 120 });
      latestAcceptedMsBySlug = latestAcceptedMsBySlugFromSubmissions(submissions);
    }
  } catch (e) {
    latestAcceptedMsBySlug = new Map();
  }

  // Auto-mark Today bucket LeetCode items done if accepted within the due day.
  try {
    await autoCompleteTodayItemsFromLeetCode({ userId, latestAcceptedMsBySlug });
  } catch (e) {
    // Non-fatal: summary still works if LeetCode is unavailable.
  }

  // At/after the reset boundary: carry leftover Today items to the next day.
  try {
    await rolloverOverdueTodayToNextDay({ userId });
  } catch (e) {
    // Non-fatal.
  }

  // Weekly boundary rollover: carry overdue weekly items forward.
  try {
    await rolloverOverdueWeekToNextWeek({ userId });
  } catch (e) {
    // Non-fatal.
  }

  // Month boundary rollover: carry unfinished monthly items forward.
  try {
    await rolloverOverdueMonthToNextMonth({ userId });
  } catch (e) {
    // Non-fatal.
  }

  const items = await RevisionItem.find({ userId })
    // monthCompletedAt= null items first => completed monthly items naturally go to bottom.
    .sort({ bucket: 1, monthCompletedAt: 1, weekCompletedAt: 1, difficultyRank: -1, bucketDueAt: 1, updatedAt: -1 })
    .lean();

  // Attach latest accepted timestamp (if any) for LeetCode-sourced items.
  if (latestAcceptedMsBySlug && latestAcceptedMsBySlug.size) {
    for (const item of items) {
      if (String(item?.source || '').toLowerCase() !== 'leetcode') continue;
      const slug = String(item?.ref || '').trim();
      const ms = latestAcceptedMsBySlug.get(slug);
      if (!ms) continue;
      item.leetcodeLastAcceptedAt = new Date(ms);
    }
  }

  const today = [];
  const week = [];
  const month = [];
  for (const item of items) {
    if (item.bucket === 'today') today.push(item);
    else if (item.bucket === 'week') week.push(item);
    else month.push(item);
  }

  res.json({ today, week, month, count: items.length });
});

// GET /api/revision/monthly-archive
router.get('/monthly-archive', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const docs = await MonthlyRevisionArchive.find({ userId }).sort({ monthKey: -1, updatedAt: -1 }).lean();
  return res.json({ months: docs });
});

// POST /api/revision/items
// Generic add endpoint. If already exists, returns 200 + duplicate=true.
router.post('/items', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);

  const source = req.body?.source;
  const ref = req.body?.ref;
  const title = req.body?.title;
  const bucket = req.body?.bucket;

  if (!source || !ref || !title) {
    return res.status(400).json({ error: 'source, ref, and title are required' });
  }

  if (!isValidBucket(bucket)) {
    return res.status(400).json({ error: 'bucket must be one of: today, week, month' });
  }

  const existing = await findExistingByKey({ userId, source, ref });
  if (existing) {
    return res.json({ item: existing, duplicate: true });
  }

  const difficulty = req.body?.difficulty ? normalizeDifficulty(req.body.difficulty) : null;

  try {
    const item = await RevisionItem.create({
      userId,
      source,
      ref,
      title,
      difficulty,
      link: req.body?.link || '',
      topic: req.body?.topic || '',
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      bucket,
      bucketDueAt: computeBucketDueAt(bucket, new Date()),
    });

    return res.status(201).json({ item, duplicate: false });
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await findExistingByKey({ userId, source, ref });
      return res.json({ item: dup, duplicate: true });
    }
    throw err;
  }
});

// POST /api/revision/from-leetcode
// Body: { slug, bucket? }
router.post('/from-leetcode', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const slug = normalizeLeetCodeSlug(req.body?.slug);
  if (!slug) return res.status(400).json({ error: 'slug is required (e.g. two-sum or a full LeetCode URL)' });

  const details = await fetchQuestionDetails({ titleSlug: slug });
  if (!details) return res.status(404).json({ error: 'Question not found on LeetCode' });

  const difficulty = normalizeDifficulty(details.difficulty) || null;
  const bucket = req.body?.bucket ? String(req.body.bucket) : defaultBucketForDifficulty(difficulty);
  if (!isValidBucket(bucket)) {
    return res.status(400).json({ error: 'bucket must be one of: today, week, month' });
  }

  const source = 'leetcode';
  const ref = slug;

  const existing = await findExistingByKey({ userId, source, ref });
  if (existing) return res.json({ item: existing, duplicate: true });

  try {
    const item = await RevisionItem.create({
      userId,
      source,
      ref,
      title: details.title,
      difficulty,
      link: `https://leetcode.com/problems/${slug}/`,
      tags: Array.isArray(details.topicTags) ? details.topicTags.map((t) => t?.slug || t?.name).filter(Boolean) : [],
      bucket,
      bucketDueAt: computeBucketDueAt(bucket, new Date()),
    });

    return res.status(201).json({ item, duplicate: false });
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await findExistingByKey({ userId, source, ref });
      return res.json({ item: dup, duplicate: true });
    }
    throw err;
  }
});

// POST /api/revision/star-from-leetcode
// Body: { slug }  -> creates two entries: Upcoming Sunday + Month
router.post('/star-from-leetcode', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const slug = normalizeLeetCodeSlug(req.body?.slug);
  if (!slug) return res.status(400).json({ error: 'slug is required (e.g. two-sum or a full LeetCode URL)' });

  const details = await fetchQuestionDetails({ titleSlug: slug });
  if (!details) return res.status(404).json({ error: 'Question not found on LeetCode' });

  const difficulty = normalizeDifficulty(details.difficulty) || null;
  const title = details.title;
  const link = `https://leetcode.com/problems/${slug}/`;

  const result = await upsertStarRevisionItems({ userId, slug, title, difficulty, link });

  return res.status(201).json({
    createdWeek: Boolean(result.created.week),
    createdMonth: Boolean(result.created.month),
    duplicateWeek: !result.created.week,
    duplicateMonth: !result.created.month,
    items: result.items,
  });
});

// PATCH /api/revision/items/:id/move
router.patch('/items/:id/move', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const id = req.params.id;
  const bucket = req.body?.bucket;

  if (!isValidBucket(bucket)) {
    return res.status(400).json({ error: 'bucket must be one of: today, week, month' });
  }

  const item = await RevisionItem.findOne({ _id: id, userId });
  if (!item) return res.status(404).json({ error: 'Revision item not found' });

  const prevBucket = item.bucket;
  item.bucket = bucket;
  item.bucketDueAt = computeBucketDueAt(bucket, new Date());

  if (prevBucket !== bucket) {
    if (bucket === 'week') {
      item.weekCompletedAt = null;
    }
    if (bucket === 'month') {
      item.monthCompletedAt = null;
    }
  }

  await item.save();
  res.json({ item });
});

function weeklyDueAtAfterComplete(now) {
  // Rule (task-day boundary is 5:30 AM IST == midnight UTC):
  // - If completed on Fri/Sat task-days (i.e. Fri/Sat UTC), schedule next Sunday.
  // - Otherwise schedule the upcoming Sunday.
  const d = new Date(now);
  const utcDay = d.getUTCDay(); // 0=Sun, 1=Mon, ... 5=Fri, 6=Sat
  const afterFridayCutoff = utcDay === 5 || utcDay === 6;
  return afterFridayCutoff ? getNextSunday(d) : getUpcomingSunday(d);
}

// POST /api/revision/items/:id/complete
// Body: { scope: 'today'|'week'|'month', moveEasyToMonth?: boolean }
router.post('/items/:id/complete', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const id = req.params.id;
  const scope = String(req.body?.scope || '').trim();

  if (scope !== 'today' && scope !== 'week' && scope !== 'month') {
    return res.status(400).json({ error: 'scope must be one of: today, week, month' });
  }

  const item = await RevisionItem.findOne({ _id: id, userId });
  if (!item) return res.status(404).json({ error: 'Revision item not found' });

  const now = new Date();
  item.lastCompletedAt = now;

  if (scope === 'today') {
    // After completing Today's task, move it into the Weekly rotation.
    // If completed Mon-Thu -> due this Sunday, else due next Sunday.
    item.bucket = 'week';
    item.bucketDueAt = weeklyDueAtAfterComplete(now);
    item.weekCompletedAt = null;
    item.monthCompletedAt = null;
    await item.save();
    return res.json({ item });
  }

  if (scope === 'month') {
    item.bucket = 'month';
    item.monthCompletedAt = now;

    // Mark done for the current month; item will be cleaned up when the month changes.
    item.bucketDueAt = getEndOfMonth(now);

    await item.save();
    return res.json({ item });
  }

  // scope === 'week'
  if (String(item.source || '').toLowerCase() === 'leetcode_star_week') {
    // Starred-for-Sunday items are one-time: remove from week after completion.
    await RevisionItem.deleteOne({ _id: id, userId });
    return res.json({ deleted: true });
  }

  item.weekCompletedAt = now;

  const difficulty = normalizeDifficulty(item.difficulty);
  const isEasy = difficulty === 'Easy' || !difficulty;
  const isMediumOrHard = difficulty === 'Medium' || difficulty === 'Hard';

  if (isMediumOrHard) {
    item.bucket = 'month';
    item.bucketDueAt = getEndOfMonth(now);
    await item.save();
    return res.json({ item, movedToMonth: true });
  }

  // Easy: move is controlled by UI checkbox.
  const moveEasyToMonth = Boolean(req.body?.moveEasyToMonth);
  if (moveEasyToMonth) {
    item.bucket = 'month';
    item.bucketDueAt = getEndOfMonth(now);
    await item.save();
    return res.json({ item, movedToMonth: true });
  }

  // Keep in weekly rotation.
  item.bucket = 'week';
  item.bucketDueAt = weeklyDueAtAfterComplete(now);
  await item.save();

  return res.json({ item, movedToMonth: false });
});

module.exports = router;
