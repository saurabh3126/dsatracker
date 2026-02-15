const express = require('express');
const mongoose = require('mongoose');

const { requireAuth } = require('../middleware/requireAuth');
const RevisionItem = require('../models/RevisionItem');
const MonthlyRevisionArchive = require('../models/MonthlyRevisionArchive');
const { normalizeDifficulty } = require('../utils/revision');
const {
  startOfIstDay,
  endOfIstDay,
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

async function findExistingByKey({ userId, source, ref, bucket }) {
  const questionKey = `${String(source).trim().toLowerCase()}:${String(ref).trim().toLowerCase()}`;
  const query = { userId, questionKey };
  if (bucket) query.bucket = bucket;
  return RevisionItem.findOne(query).lean();
}

async function upsertStarRevisionItems({ userId, slug, title, difficulty, link }) {
  const now = new Date();
  const ref = slug;

  const weekSource = 'leetcode_star_week';
  const monthSource = 'leetcode_star_month';

  const weekExisting = await findExistingByKey({ userId, source: weekSource, ref, bucket: 'week' });
  const monthExisting = await findExistingByKey({ userId, source: monthSource, ref, bucket: 'month' });

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
          $addToSet: { completed: { $each: monthItems } },
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
    const slug = String(s?.titleSlug || '').trim().toLowerCase();
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
  // Task-day boundary: 12:00 AM IST
  const todayStart = startOfIstDay(now).getTime();
  const todayEnd = endOfIstDay(now).getTime();

  // If the same question already exists in Week, don't try to move the Today item into Week
  // (it would violate the unique index). Instead, update the existing Week item's lastCompletedAt
  // and delete the Today item.
  const todayQuestionKeys = todayItems.map((it) => String(it?.questionKey || '').trim()).filter(Boolean);
  const weekByKey = new Map();
  if (todayQuestionKeys.length) {
    const weekItems = await RevisionItem.find({
      userId,
      bucket: 'week',
      questionKey: { $in: todayQuestionKeys },
    })
      .select({ _id: 1, questionKey: 1 })
      .lean();
    for (const w of weekItems) {
      const k = String(w?.questionKey || '').trim();
      if (k && w?._id && !weekByKey.has(k)) weekByKey.set(k, w._id);
    }
  }

  const ops = [];
  for (const item of todayItems) {
    const slug = String(item?.ref || '').trim().toLowerCase();
    const acceptedMs = latestAcceptedMsBySlug.get(slug);
    if (!acceptedMs) continue;

    // Only count it as done if the accepted submission happened today.
    if (acceptedMs < todayStart || acceptedMs > todayEnd) continue;

    // If it was already completed during this due day, skip.
    const lastCompletedAtMs = item?.lastCompletedAt ? new Date(item.lastCompletedAt).getTime() : NaN;
    if (Number.isFinite(lastCompletedAtMs) && lastCompletedAtMs >= todayStart) continue;

    const completedAt = new Date(acceptedMs);

    const qk = String(item?.questionKey || '').trim();
    const existingWeekId = qk ? weekByKey.get(qk) : null;
    if (existingWeekId) {
      ops.push({
        updateOne: {
          filter: { _id: existingWeekId, userId },
          update: { $set: { lastCompletedAt: completedAt, updatedAt: new Date() } },
        },
      });
      ops.push({
        deleteOne: {
          filter: { _id: item._id, userId },
        },
      });
      continue;
    }

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
  // At the task-day boundary (12:00 AM IST), any remaining
  // Today bucket items that were not completed should carry over to the next day.
  // We detect "overdue" Today items by comparing their dueAt to the start of
  // the current IST day.
  const now = new Date();
  const startDayMs = startOfIstDay(now).getTime();

  const overdueToday = await RevisionItem.find({
    userId,
    bucket: 'today',
    bucketDueAt: { $lt: new Date(startDayMs) },
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

async function moveOverdueWeekToTodayOnSunday({ userId }) {
  // If today is Sunday (after 5:30 AM IST), move all overdue weekly items into the Today bucket
  // so the user sees them as "due today" tasks.
  const now = new Date();
  
  // Weekly reset is effectively around Sunday transitions.
  // User requested this happens "by Sunday 5:30 AM IST".
  // 5:30 AM IST is 00:00 UTC. So we simpler check for Sunday in UTC.
  const utcDay = now.getUTCDay(); // 0 = Sunday
  if (utcDay !== 0) return { moved: 0 };

  const startDayMs = startOfIstDay(now).getTime();

  const result = await RevisionItem.updateMany(
    {
      userId,
      bucket: 'week',
      bucketDueAt: { $lt: new Date(startDayMs) },
    },
    {
      $set: {
        bucket: 'today',
        bucketDueAt: computeBucketDueAt('today', now),
        updatedAt: new Date(),
      },
    },
  );

  return { moved: result?.modifiedCount || 0 };
}

async function rolloverOverdueWeekToNextWeek({ userId }) {
  // Weekly reset boundary is Sunday 12:00 AM IST.
  // If a Weekly item is overdue (its dueAt is before the start of the current IST day),
  // keep it in Week but extend it to the next upcoming Sunday.
  const now = new Date();
  const startDayMs = startOfIstDay(now).getTime();

  const result = await RevisionItem.updateMany(
    {
      userId,
      bucket: 'week',
      bucketDueAt: { $lt: new Date(startDayMs) },
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

  // If client explicitly requests a refresh, we can try to bypass cache for recent submissions.
  // Note: We don't have a direct skipCache flag here yet we rely on short TTL or empty cache.
  // But if the client passed ?refresh=true, we could consider clearing cache or similar.
  // For now, let's rely on the short TTL (10s).

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

  // Additional safety cleanup: the Month bucket is an active queue of pending items.
  // If anything is marked completed (even within the current month), it should be archived
  // and removed so counts immediately reflect the remaining items.
  const completedMonthItems = await RevisionItem.find({
    userId,
    bucket: 'month',
    monthCompletedAt: { $ne: null },
  }).lean();

  if (completedMonthItems.length) {
    await archiveMonthlyCompletions({ userId, items: completedMonthItems });
    await RevisionItem.deleteMany({
      userId,
      bucket: 'month',
      monthCompletedAt: { $ne: null },
    });
  }

  // Pull recent accepted submissions once; use for both:
  // - Auto-marking Today bucket items done
  // - Returning "last submitted on LeetCode" timestamps per item
  let latestAcceptedMsBySlug = new Map();
  let recentAcceptedSubmissions = [];
  try {
    const username = req.user?.leetcodeUsername;
    if (username) {
      const submissions = await fetchRecentAcceptedSubmissions({ username, limit: 120 });
      recentAcceptedSubmissions = Array.isArray(submissions) ? submissions : [];
      latestAcceptedMsBySlug = latestAcceptedMsBySlugFromSubmissions(submissions);
    }
  } catch (e) {
    latestAcceptedMsBySlug = new Map();
    recentAcceptedSubmissions = [];
  }

  // Auto-complete Today items based on recent LeetCode submissions (IST based).
  try {
    if (latestAcceptedMsBySlug.size > 0) {
      await autoCompleteTodayItemsFromLeetCode({ userId, latestAcceptedMsBySlug });
    }
  } catch (e) {
    // Non-fatal
  }

  // Auto-add newly solved LeetCode questions into Weekly Revision.
  // This is intentionally conservative to avoid backfilling an entire history.
  // Criteria for due date:
  // - Mon-Thu task-days -> upcoming Sunday
  // - Fri 5:30 AM IST (Fri 00:00 UTC) through Sun 5:30 AM IST (Sun 00:00 UTC) -> next Sunday
  try {
    const LOOKBACK_DAYS = 7;
    const lookbackStartMs = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    const newestBySlug = new Map(); // slug -> { acceptedMs, title }
    for (const s of recentAcceptedSubmissions || []) {
      const slug = String(s?.titleSlug || '').trim();
      const ts = Number(s?.timestamp);
      if (!slug || !Number.isFinite(ts)) continue;

      const acceptedMs = ts * 1000;
      if (acceptedMs < lookbackStartMs) continue;

      const prev = newestBySlug.get(slug);
      if (!prev || acceptedMs > prev.acceptedMs) {
        newestBySlug.set(slug, {
          acceptedMs,
          title: String(s?.title || slug).trim() || slug,
        });
      }
    }

    const slugs = Array.from(newestBySlug.keys());
    if (slugs.length) {
      const questionKeys = slugs.map((slug) => `leetcode:${String(slug).toLowerCase()}`);

      // Don't add if the question already exists in ANY bucket.
      const existing = await RevisionItem.find({ userId, questionKey: { $in: questionKeys } })
        .select({ questionKey: 1 })
        .lean();
      const existingKeys = new Set((existing || []).map((x) => String(x?.questionKey || '').trim()).filter(Boolean));

      const ops = [];
      for (const slug of slugs) {
        const questionKey = `leetcode:${String(slug).toLowerCase()}`;
        if (existingKeys.has(questionKey)) continue;

        const info = newestBySlug.get(slug);
        if (!info?.acceptedMs) continue;
        const acceptedAt = new Date(info.acceptedMs);
        if (!Number.isFinite(acceptedAt.getTime())) continue;

        ops.push({
          updateOne: {
            filter: { userId, questionKey, bucket: 'week' },
            update: {
              $setOnInsert: {
                userId,
                questionKey,
                source: 'leetcode',
                ref: slug,
                title: info.title || slug,
                difficulty: null,
                link: `https://leetcode.com/problems/${slug}/`,
                bucket: 'week',
                bucketDueAt: computeBucketDueAt('week', acceptedAt),
                createdAt: new Date(),
              },
              $set: { updatedAt: new Date() },
            },
            upsert: true,
          },
        });
      }

      if (ops.length) {
        await RevisionItem.bulkWrite(ops, { ordered: false });
      }
    }
  } catch (e) {
    // Non-fatal: summary should still load even if LeetCode auto-add fails.
  }

  // Do NOT auto-complete or move Today items based on LeetCode submissions.
  // LeetCode submission timestamps are attached to the response only, and the UI
  // can show a "Completed" state in the Today tab without mutating buckets.

  // At/after the reset boundary: carry leftover Today items to the next day.
  try {
    await rolloverOverdueTodayToNextDay({ userId });
  } catch (e) {
    // Non-fatal.
  }

  // Weekly boundary rollover:
  // 1. If it's Sunday, move overdue week items to Today.
  try {
    await moveOverdueWeekToTodayOnSunday({ userId });
  } catch (e) {
    // Non-fatal.
  }

  // 2. Otherwise/Remaining: carry overdue weekly items forward to NEXT week.
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
      const slug = String(item?.ref || '').trim().toLowerCase();
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

  // Fetch current IST month's archived completions for the "Monthly Completed" partition.
  let monthlyCompleted = [];
  try {
    const currentMonthKey = toISTMonthKey(new Date());
    const arc = await MonthlyRevisionArchive.findOne({ userId, monthKey: currentMonthKey }).lean();
    monthlyCompleted = arc?.completed || [];
  } catch (e) {
    // Non-fatal
  }

  res.json({ today, week, month, monthlyCompleted, count: items.length });
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

  const existing = await findExistingByKey({ userId, source, ref, bucket });
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
      const dup = await findExistingByKey({ userId, source, ref, bucket });
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

  const existing = await findExistingByKey({ userId, source, ref, bucket });
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
      const dup = await findExistingByKey({ userId, source, ref, bucket });
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

  try {
    await item.save();
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate question in this bucket',
        hint: 'This question already exists in the target bucket. Choose a different bucket or remove the existing one.',
      });
    }
    throw err;
  }
  res.json({ item });
});

function weeklyDueAtAfterComplete(now) {
  // Rule (task-day boundary is 12:00 AM IST):
  // - If completed on Fri/Sat task-days (i.e. Fri/Sat IST), schedule next Sunday.
  // - Otherwise schedule the upcoming Sunday.
  const d = new Date(Number(now));
  // Shift to IST to check day
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(d.getTime() + istOffset);
  const istDay = istDate.getUTCDay(); // 0=Sun, 1=Mon, ... 5=Fri, 6=Sat
  const afterFridayCutoff = istDay === 5 || istDay === 6;
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
    // If an equivalent Week item already exists, don't create a duplicate.
    const questionKey = String(item.questionKey || '').trim();
    if (questionKey) {
      const weekDup = await RevisionItem.findOne({ userId, questionKey, bucket: 'week' }).select({ _id: 1 });
      if (weekDup) {
        await RevisionItem.updateOne({ _id: weekDup._id, userId }, { $set: { lastCompletedAt: now, updatedAt: new Date() } });
        await RevisionItem.deleteOne({ _id: id, userId });
        return res.json({ deleted: true, updatedExistingWeek: true });
      }
    }

    item.bucket = 'week';
    item.bucketDueAt = weeklyDueAtAfterComplete(now);
    item.weekCompletedAt = null;
    item.monthCompletedAt = null;
    await item.save();
    return res.json({ item });
  }

  if (scope === 'month') {
    // Month completion should immediately reduce the Month pending count.
    // Archive it under the current month and remove from the active queue.
    const forArchive = item.toObject ? item.toObject() : { ...item };
    forArchive.monthCompletedAt = now;
    await archiveMonthlyCompletions({ userId, items: [forArchive] });
    await RevisionItem.deleteOne({ _id: id, userId });
    return res.json({ deleted: true, archived: true });
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
