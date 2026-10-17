const express = require('express');
const mongoose = require('mongoose');

const LeetCodeQuestion = require('../models/LeetCodeQuestion');
const { requireAuth } = require('../middleware/requireAuth');
const {
  fetchRecentAcceptedSubmissions,
  fetchQuestionDetails,
  checkIfPotdSolved,
  fetchPOTD,
  clearCache,
} = require('../services/leetcodeClient');
const {
  calculateNextRevisionDate,
  difficultyRank,
  normalizeDifficulty,
} = require('../utils/revision');
const { computeBucketDueAt, startOfIstDay, endOfIstDay } = require('../utils/revisionBuckets');
const RevisionItem = require('../models/RevisionItem');

const router = express.Router();


function asyncJsonRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err?.message || 'Request failed';
      // If LeetCode blocks/rate-limits, report as a bad gateway.
      const status = /LeetCode/i.test(message) ? 502 : 500;
      return res.status(status).json({ error: message });
    }
  };
}

function requireMongo(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'MongoDB not connected',
      hint: 'Set MONGO_URI in your .env and restart the server',
    });
  }
  next();
}

function getUserIdOrNull(req) {
  const id = req.user && (req.user._id || req.user.id);
  return id ? new mongoose.Types.ObjectId(id) : null;
}

// Helper to update revision bucket when a question is solved.
// Supports "New Submission -> Added to Weekly Revision" logic.
// If an item already exists in WEEK or MONTH, just update lastCompletedAt.
// NEVER mark Week/Month items as completed (weekCompletedAt/monthCompletedAt).
async function upsertSolvedRevisionItem({ userId, slug, title, difficulty, link, solvedDate }) {
  if (!userId || !slug) return;

  const now = new Date();
  const startToday = startOfIstDay(now).getTime();
  const endToday = endOfIstDay(now).getTime();
  const solvedMs = solvedDate.getTime();
  const isSolvedToday = solvedMs >= startToday && solvedMs <= endToday;

  const existingItems = await RevisionItem.find({ userId, ref: slug }).lean();

  const todayItem = existingItems.find((i) => i.bucket === 'today');
  const weekItem = existingItems.find((i) => i.bucket === 'week');
  const monthItem = existingItems.find((i) => i.bucket === 'month');

  // 1. Handle Today Item Completion
  if (todayItem && isSolvedToday) {
    if (weekItem) {
      // Merge into existing Week item
      await RevisionItem.updateOne(
        { _id: weekItem._id },
        { $set: { lastCompletedAt: solvedDate, updatedAt: new Date() } }
      );
      await RevisionItem.deleteOne({ _id: todayItem._id });
    } else if (monthItem) {
      // Merge into existing Month item
      await RevisionItem.updateOne(
        { _id: monthItem._id },
        { $set: { lastCompletedAt: solvedDate, updatedAt: new Date() } }
      );
      await RevisionItem.deleteOne({ _id: todayItem._id });
    } else {
      // Move Today item to Week bucket (pending state)
      await RevisionItem.updateOne(
        { _id: todayItem._id },
        {
          $set: {
            bucket: 'week',
            bucketDueAt: computeBucketDueAt('week', solvedDate),
            lastCompletedAt: solvedDate,
            weekCompletedAt: null, // Ensure pending
            monthCompletedAt: null,
            updatedAt: new Date(),
          },
        }
      );
    }
    return;
  }

  // 2. If item exists in Week or Month (or Today but not solved today), just update lastCompletedAt.
  // Prioritize updating the "highest" bucket if duplicates exist (unlikely but safe).
  const targetItem = weekItem || monthItem || todayItem;

  if (targetItem) {
    if (!targetItem.lastCompletedAt || new Date(targetItem.lastCompletedAt) < solvedDate) {
      await RevisionItem.updateOne(
        { _id: targetItem._id },
        { $set: { lastCompletedAt: solvedDate, updatedAt: new Date() } }
      );
    }
    return;
  }

  // 3. New Item -> Create in Week bucket (pending)
  await RevisionItem.create({
    userId,
    questionKey: `leetcode:${String(slug).toLowerCase()}`,
    source: 'leetcode',
    ref: slug,
    title: title || slug,
    difficulty: normalizeDifficulty(difficulty),
    link: link || `https://leetcode.com/problems/${slug}/`,
    bucket: 'week',
    bucketDueAt: computeBucketDueAt('week', solvedDate),
    lastCompletedAt: solvedDate,
    weekCompletedAt: null, // Pending
    monthCompletedAt: null,
  });
}

async function refreshUserQuestionsFromRecentAccepted({ userId, username, limit = 60 }) {
  if (!userId || !username) return { updated: 0, reason: 'missing_user_or_username' };

  const submissions = await fetchRecentAcceptedSubmissions({ username, limit });
  const slugSet = new Set();
  const solvedDateBySlug = new Map();

  for (const s of submissions || []) {
    const slug = String(s?.titleSlug || '').trim();
    const ts = Number(s?.timestamp);
    if (!slug || !Number.isFinite(ts)) continue;
    const solvedDate = new Date(ts * 1000);
    slugSet.add(slug);

    const prev = solvedDateBySlug.get(slug);
    if (!prev || solvedDate.getTime() > prev.getTime()) solvedDateBySlug.set(slug, solvedDate);
  }

  const slugs = Array.from(slugSet);
  if (!slugs.length) return { updated: 0, reason: 'no_slugs' };

  const existing = await LeetCodeQuestion.find({ userId, slug: { $in: slugs } }).lean();
  if (!existing.length) return { updated: 0, reason: 'no_existing_docs' };

  const bySlug = new Map(existing.map((q) => [q.slug, q]));
  const ops = [];

  for (const slug of slugs) {
    const doc = bySlug.get(slug);
    if (!doc) continue;

    const solvedDate = solvedDateBySlug.get(slug);
    if (!solvedDate) continue;

    const previousSolvedAtMs = doc?.solvedDate ? new Date(doc.solvedDate).getTime() : NaN;
    if (Number.isFinite(previousSolvedAtMs) && solvedDate.getTime() <= previousSolvedAtMs) continue;

    const effectiveDifficulty = doc.userSetDifficulty || doc.difficulty || 'Easy';
    const nextRevisionDate = calculateNextRevisionDate({
      solvedDate,
      userSetDifficulty: effectiveDifficulty,
    });

    // Also update Weekly Revision bucket if applicable
    await upsertSolvedRevisionItem({
      userId,
      slug,
      title: doc.title,
      difficulty: effectiveDifficulty,
      link: `https://leetcode.com/problems/${slug}/`,
      solvedDate,
    });

    ops.push({
      updateOne: {
        filter: { userId, slug },
        update: { $set: { solvedDate, nextRevisionDate } },
      },
    });
  }

  if (!ops.length) return { updated: 0, reason: 'no_updates_needed' };
  const result = await LeetCodeQuestion.bulkWrite(ops, { ordered: false });
  return { updated: result?.modifiedCount || 0, reason: 'ok' };
}

// POST /api/leetcode/sync?username=...&limit=20
// Fetch recent accepted submissions and upsert them into Mongo.
router.post('/sync', requireMongo, asyncJsonRoute(async (req, res) => {
  // Clear generic cache to ensure dashboard updates too.
  clearCache();

  const username = req.query.username || req.body.username || process.env.LEETCODE_USERNAME;
  const limit = Number(req.query.limit || req.body.limit || 20);

  if (!username) {
    return res.status(400).json({ error: 'username is required (query, body, or LEETCODE_USERNAME)' });
  }

  const userSetDifficultyBySlug = req.body?.userSetDifficultyBySlug || {};
  const submissions = await fetchRecentAcceptedSubmissions({ username, limit, skipCache: true });

  const ops = [];
  const enriched = [];
  const userId = null; // legacy/global mode

  for (const submission of submissions) {
    const slug = submission.titleSlug;
    const solvedDate = new Date(Number(submission.timestamp) * 1000);

    const details = await fetchQuestionDetails({ titleSlug: slug });
    if (!details) continue;

    const difficulty = normalizeDifficulty(details.difficulty) || details.difficulty;
    const userSetDifficultyRaw = userSetDifficultyBySlug[slug];
    const userSetDifficulty = userSetDifficultyRaw ? (normalizeDifficulty(userSetDifficultyRaw) || userSetDifficultyRaw) : null;

    const nextRevisionDate = calculateNextRevisionDate({
      solvedDate,
      userSetDifficulty: userSetDifficulty || difficulty,
    });

    const setDoc = {
      userId,
      title: details.title,
      slug,
      difficulty,
      solvedDate,
      nextRevisionDate,
      difficultyRank: difficultyRank(difficulty),
    };

    if (userSetDifficulty) setDoc.userSetDifficulty = userSetDifficulty;

    ops.push({
      updateOne: {
        filter: { userId: null, slug },
        update: {
          $set: setDoc,
          $setOnInsert: {
            userSetDifficulty: userSetDifficulty || null,
          },
        },
        upsert: true,
      },
    });

    enriched.push({
      title: details.title,
      slug,
      difficulty,
      userSetDifficulty,
      solvedDate,
      nextRevisionDate,
    });
  }

  if (ops.length) {
    await LeetCodeQuestion.bulkWrite(ops, { ordered: false });
  }

  return res.json({ synced: ops.length, username, items: enriched });
}));

// POST /api/leetcode/my/sync?limit=20
// Uses the logged-in user's saved LeetCode username.
router.post('/my/sync', requireMongo, requireAuth, asyncJsonRoute(async (req, res) => {
  // Clear generic cache so dashboards using different limits (e.g. 120) also get fresh data.
  clearCache();

  const username = req.user?.leetcodeUsername;
  const limit = Number(req.query.limit || req.body.limit || 20);

  if (!username) {
    return res.status(400).json({ error: 'User has no leetcodeUsername set' });
  }

  const userSetDifficultyBySlug = req.body?.userSetDifficultyBySlug || {};
  const submissions = await fetchRecentAcceptedSubmissions({ username, limit, skipCache: true });

  const userId = getUserIdOrNull(req);
  const ops = [];
  const enriched = [];

  for (const submission of submissions) {
    const slug = submission.titleSlug;
    const solvedDate = new Date(Number(submission.timestamp) * 1000);

    const details = await fetchQuestionDetails({ titleSlug: slug });
    if (!details) continue;

    const difficulty = normalizeDifficulty(details.difficulty) || details.difficulty;
    const userSetDifficultyRaw = userSetDifficultyBySlug[slug];
    const userSetDifficulty = userSetDifficultyRaw
      ? (normalizeDifficulty(userSetDifficultyRaw) || userSetDifficultyRaw)
      : null;

    const nextRevisionDate = calculateNextRevisionDate({
      solvedDate,
      userSetDifficulty: userSetDifficulty || difficulty,
    });

    await upsertSolvedRevisionItem({
      userId,
      slug,
      title: details.title,
      difficulty: userSetDifficulty || difficulty,
      link: `https://leetcode.com/problems/${slug}/`,
      solvedDate,
    });

    const setDoc = {
      userId,
      title: details.title,
      slug,
      difficulty,
      solvedDate,
      nextRevisionDate,
      difficultyRank: difficultyRank(difficulty),
    };

    if (userSetDifficulty) setDoc.userSetDifficulty = userSetDifficulty;

    ops.push({
      updateOne: {
        filter: { userId, slug },
        update: {
          $set: setDoc,
          $setOnInsert: {
            userSetDifficulty: userSetDifficulty || null,
          },
        },
        upsert: true,
      },
    });

    enriched.push({
      title: details.title,
      slug,
      difficulty,
      userSetDifficulty,
      solvedDate,
      nextRevisionDate,
    });
  }

  if (ops.length) {
    await LeetCodeQuestion.bulkWrite(ops, { ordered: false });
  }

  return res.json({ synced: ops.length, username, items: enriched });
}));

// GET /api/leetcode/due
// Returns questions where nextRevisionDate <= today, sorted hardest-first.
router.get('/due', requireMongo, asyncJsonRoute(async (req, res) => {
  const now = new Date();

  const due = await LeetCodeQuestion.find({
    userId: null,
    nextRevisionDate: { $ne: null, $lte: now },
  })
    .sort({ difficultyRank: -1, nextRevisionDate: 1 })
    .lean();

  return res.json({ count: due.length, items: due });
}));

// GET /api/leetcode/my/due
router.get('/my/due', requireMongo, requireAuth, asyncJsonRoute(async (req, res) => {
  const now = new Date();
  const userId = getUserIdOrNull(req);

  // Lightweight auto-refresh so questions the user just re-solved
  // drop out of the due list without requiring a manual Sync.
  try {
    await refreshUserQuestionsFromRecentAccepted({ userId, username: req.user?.leetcodeUsername, limit: 60 });
  } catch (e) {
    // Non-fatal; continue with existing stored due list.
  }

  const due = await LeetCodeQuestion.find({
    userId,
    nextRevisionDate: { $ne: null, $lte: now },
  })
    .sort({ difficultyRank: -1, nextRevisionDate: 1 })
    .lean();

  return res.json({ count: due.length, items: due });
}));

// GET /api/leetcode/questions?days=30
// Used for the "Monthly Review" filter.
router.get('/questions', requireMongo, asyncJsonRoute(async (req, res) => {
  const days = Number(req.query.days || 30);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const items = await LeetCodeQuestion.find({ userId: null, solvedDate: { $ne: null, $gte: from } })
    .sort({ solvedDate: -1 })
    .lean();

  return res.json({ count: items.length, from, items });
}));

// GET /api/leetcode/my/questions?days=30
router.get('/my/questions', requireMongo, requireAuth, asyncJsonRoute(async (req, res) => {
  const days = Number(req.query.days || 30);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const userId = getUserIdOrNull(req);

  const items = await LeetCodeQuestion.find({ userId, solvedDate: { $ne: null, $gte: from } })
    .sort({ solvedDate: -1 })
    .lean();

  return res.json({ count: items.length, from, items });
}));

// GET /api/leetcode/potd
router.get('/potd', asyncJsonRoute(async (req, res) => {
  const potd = await fetchPOTD();
  return res.json({ potd });
}));

// GET /api/leetcode/potd-status?username=...
router.get('/potd-status', asyncJsonRoute(async (req, res) => {
  const username = req.query.username || process.env.LEETCODE_USERNAME;
  const result = await checkIfPotdSolved({ username, limit: 50 });
  return res.json(result);
}));

// GET /api/leetcode/my/potd-status
router.get('/my/potd-status', requireAuth, asyncJsonRoute(async (req, res) => {
  const username = req.user?.leetcodeUsername;
  const result = await checkIfPotdSolved({ username, limit: 50 });
  return res.json(result);
}));

module.exports = router;
