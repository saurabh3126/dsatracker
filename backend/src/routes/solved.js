const express = require('express');
const mongoose = require('mongoose');

const { requireAuth } = require('../middleware/requireAuth');
const SolvedQuestion = require('../models/SolvedQuestion');
const { normalizeDifficulty } = require('../utils/revision');
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

function normalizeLeetCodeSlug(input) {
  let s = String(input || '').trim();
  if (!s) return '';

  const m = s.match(/leetcode\.com\/problems\/([^/?#]+)/i) || s.match(/\/problems\/([^/?#]+)/i);
  if (m && m[1]) s = m[1];

  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return s;
}

async function findExistingByKey({ userId, source, ref }) {
  const questionKey = `${String(source).trim().toLowerCase()}:${String(ref).trim().toLowerCase()}`;
  return SolvedQuestion.findOne({ userId, questionKey }).lean();
}

function parseOptionalDate(input) {
  if (input == null || input === '') return null;
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

// GET /api/solved
router.get('/', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const items = await SolvedQuestion.find({ userId })
    .sort({ solvedAt: -1, difficultyRank: -1, updatedAt: -1 })
    .lean();

  return res.json({ items, total: items.length });
});

// GET /api/solved/leetcode?limit=20
// Shows recent accepted submissions directly from LeetCode.
router.get('/leetcode', requireMongo, requireAuth, async (req, res) => {
  const username = String(req.user?.leetcodeUsername || '').trim();
  if (!username) {
    return res.status(400).json({ error: 'leetcodeUsername missing on your profile' });
  }

  const perPage = Math.min(50, Math.max(1, Number(req.query.perPage || 20)));
  const page = Math.min(50, Math.max(1, Number(req.query.page || 1)));
  const MAX_FETCH = 500;
  const fetchLimit = Math.min(MAX_FETCH, page * perPage);

  const recent = await fetchRecentAcceptedSubmissions({ username, limit: fetchLimit });

  const offset = (page - 1) * perPage;
  const pageSlice = recent.slice(offset, offset + perPage);

  const items = pageSlice
    .map((s) => {
      const slug = s?.titleSlug ? String(s.titleSlug) : '';
      if (!slug) return null;
      return {
        id: s?.id ? String(s.id) : null,
        title: s?.title || slug,
        slug,
        link: `https://leetcode.com/problems/${slug}/`,
        solvedAt: s?.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null,
      };
    })
    .filter(Boolean);

  // We don't know the true total count from this endpoint, but if we received exactly the amount
  // we asked for, there *may* be more beyond our current fetchLimit.
  const totalKnown = Array.isArray(recent) ? recent.length : 0;
  const maybeHasMore = totalKnown === fetchLimit && fetchLimit < MAX_FETCH;
  const hasMore = offset + perPage < totalKnown || maybeHasMore;

  return res.json({ username, page, perPage, totalKnown, hasMore, items });
});

// POST /api/solved/leetcode/sync?limit=500
// Fetches recent accepted submissions from LeetCode and stores them in MongoDB.
router.post('/leetcode/sync', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);

  const username = String(req.user?.leetcodeUsername || '').trim();
  if (!username) {
    return res.status(400).json({ error: 'leetcodeUsername missing on your profile' });
  }

  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 500)));
  const recent = await fetchRecentAcceptedSubmissions({ username, limit });
  const now = new Date();

  const ops = (Array.isArray(recent) ? recent : [])
    .map((s) => {
      const slug = s?.titleSlug ? String(s.titleSlug).trim() : '';
      if (!slug) return null;

      const solvedAt = s?.timestamp ? new Date(Number(s.timestamp) * 1000) : null;
      if (!solvedAt || !Number.isFinite(solvedAt.getTime())) return null;

      const source = 'leetcode';
      const ref = slug;
      const questionKey = `${source}:${String(ref).toLowerCase()}`;

      return {
        updateOne: {
          filter: { userId, questionKey },
          update: {
            $setOnInsert: {
              userId,
              questionKey,
              source,
              ref,
              title: s?.title || slug,
              difficulty: null,
              difficultyRank: 0,
              link: `https://leetcode.com/problems/${slug}/`,
              createdAt: now,
            },
            $min: { solvedAt },
            $set: { updatedAt: now },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean);

  if (!ops.length) {
    return res.json({ username, fetched: 0, upserted: 0 });
  }

  const result = await SolvedQuestion.bulkWrite(ops, { ordered: false });
  const upserted = Number(result?.upsertedCount || 0);
  return res.json({ username, fetched: ops.length, upserted });
});

// POST /api/solved/from-leetcode
// Body: { slug } where slug can be a slug or full URL
router.post('/from-leetcode', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const slug = normalizeLeetCodeSlug(req.body?.slug);
  if (!slug) return res.status(400).json({ error: 'slug is required (e.g. two-sum or a full LeetCode URL)' });

  const requestedSolvedAt = parseOptionalDate(req.body?.solvedAt);
  if (req.body?.solvedAt != null && !requestedSolvedAt) {
    return res.status(400).json({ error: 'solvedAt must be a valid date (ISO string recommended)' });
  }

  const details = await fetchQuestionDetails({ titleSlug: slug });
  if (!details) return res.status(404).json({ error: 'Question not found on LeetCode' });

  const source = 'leetcode';
  const ref = slug;

  const existing = await findExistingByKey({ userId, source, ref });
  if (existing) return res.json({ item: existing, duplicate: true });

  const difficulty = normalizeDifficulty(details.difficulty) || null;

  try {
    const item = await SolvedQuestion.create({
      userId,
      source,
      ref,
      title: details.title,
      difficulty,
      link: `https://leetcode.com/problems/${slug}/`,
      solvedAt: requestedSolvedAt || new Date(),
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

// PATCH /api/solved/:id/notes
// Body: { notes }
router.patch('/:id/notes', requireMongo, requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const id = String(req.params.id || '').trim();
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

  const notesRaw = String(req.body?.notes ?? '');
  const notes = notesRaw.trim().slice(0, 1000);

  const item = await SolvedQuestion.findOneAndUpdate(
    { _id: id, userId },
    { $set: { notes, updatedAt: new Date() } },
    { new: true }
  ).lean();

  if (!item) return res.status(404).json({ error: 'Solved question not found' });
  return res.json({ item });
});

module.exports = router;
