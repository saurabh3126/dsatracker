const express = require('express');
const fs = require('fs-extra');
const path = require('path');

const { fetchProblemsetQuestions, suggestProblems, fetchQuestionContent } = require('../services/leetcodeClient');

const router = express.Router();

// Curated topic -> LeetCode tag slug mapping.
// Keep this small and stable; frontend can render these in a sidebar.
const LEETCODE_TOPICS = [
  { key: 'arrays', name: 'Arrays', tagSlugs: ['array'] },
  { key: 'strings', name: 'Strings', tagSlugs: ['string'] },
  { key: 'hash-table', name: 'Hash Table', tagSlugs: ['hash-table'] },
  { key: 'two-pointers', name: 'Two Pointers', tagSlugs: ['two-pointers'] },
  { key: 'sliding-window', name: 'Sliding Window', tagSlugs: ['sliding-window'] },
  { key: 'stack', name: 'Stack', tagSlugs: ['stack'] },
  { key: 'queue', name: 'Queue', tagSlugs: ['queue'] },
  { key: 'linked-list', name: 'Linked List', tagSlugs: ['linked-list'] },
  { key: 'binary-search', name: 'Binary Search', tagSlugs: ['binary-search'] },
  { key: 'heap', name: 'Heap / Priority Queue', tagSlugs: ['heap-priority-queue'] },
  { key: 'greedy', name: 'Greedy', tagSlugs: ['greedy'] },
  { key: 'backtracking', name: 'Backtracking', tagSlugs: ['backtracking'] },
  { key: 'trees', name: 'Trees', tagSlugs: ['tree'] },
  { key: 'binary-tree', name: 'Binary Tree', tagSlugs: ['binary-tree'] },
  { key: 'bst', name: 'Binary Search Tree', tagSlugs: ['binary-search-tree'] },
  { key: 'graph', name: 'Graph', tagSlugs: ['graph'] },
  { key: 'dfs', name: 'DFS', tagSlugs: ['depth-first-search'] },
  { key: 'bfs', name: 'BFS', tagSlugs: ['breadth-first-search'] },
  { key: 'dynamic-programming', name: 'Dynamic Programming', tagSlugs: ['dynamic-programming'] },
  { key: 'bit-manipulation', name: 'Bit Manipulation', tagSlugs: ['bit-manipulation'] },
  { key: 'math', name: 'Math', tagSlugs: ['math'] },
];

function normalizeDifficulty(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (v === 'easy') return 'Easy';
  if (v === 'medium') return 'Medium';
  if (v === 'hard') return 'Hard';
  return '';
}

function canonicalTopics() {
  return LEETCODE_TOPICS.map(({ key, name }) => ({ key, name }));
}

function sanitizeLeetCodeHtml(html) {
  const input = String(html || '');
  if (!input) return '';

  // Very small sanitizer: strip scripts/styles/iframes and inline JS handlers.
  // LeetCode content is trusted-ish, but we still avoid obvious XSS vectors.
  let out = input;
  out = out.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  out = out.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '');
  out = out.replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '');
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"');
  out = out.replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
  return out;
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractConstraintsFromContentHtml(contentHtml) {
  const html = String(contentHtml || '');
  if (!html) return [];

  // Common LeetCode pattern: <strong>Constraints:</strong> ... <ul><li>..</li></ul>
  const m = html.match(/Constraints\s*:\s*<\/strong>\s*<\/p>\s*<ul>([\s\S]*?)<\/ul>/i);
  if (!m) return [];
  const ulInner = m[1] || '';

  const liMatches = Array.from(ulInner.matchAll(/<li>([\s\S]*?)<\/li>/gi));
  const rows = liMatches
    .map((x) => stripHtmlToText(x[1]))
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Deduplicate while preserving order
  const seen = new Set();
  return rows.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

router.get('/topics', (req, res) => {
  res.json({ topics: canonicalTopics() });
});

router.get('/leetcode/topics', (req, res) => {
  res.json({ topics: canonicalTopics() });
});

// GET /api/catalog/leetcode/questions?topic=arrays&difficulty=Easy&search=two%20sum&limit=50&skip=0
router.get('/leetcode/questions', async (req, res) => {
  const topicKey = String(req.query.topic || '').trim();
  const difficulty = normalizeDifficulty(req.query.difficulty);
  const search = String(req.query.search || '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const skip = Math.max(0, Number(req.query.skip || 0));

  const topic = LEETCODE_TOPICS.find((t) => t.key === topicKey);
  if (!topic) {
    return res.status(400).json({
      error: 'Invalid topic',
      validTopics: LEETCODE_TOPICS.map((t) => t.key),
    });
  }

  try {
    const data = await fetchProblemsetQuestions({
      limit,
      skip,
      difficulty: difficulty || undefined,
      tagSlugs: topic.tagSlugs,
      search,
    });

    // Short-lived caching is safe for public catalog pages and improves perceived speed.
    res.set('Cache-Control', 'public, max-age=30');

    return res.json({
      topic: { key: topic.key, name: topic.name },
      difficulty: difficulty || null,
      search: search || null,
      ...data,
    });
  } catch (err) {
    console.error('catalog leetcode/questions error:', err);
    return res.status(502).json({ error: 'Failed to fetch LeetCode problem list' });
  }
});

// GET /api/catalog/leetcode/suggest?search=two%20sum&limit=10
// Used for autocomplete when adding revision items.
router.get('/leetcode/suggest', async (req, res) => {
  const search = String(req.query.search || '').trim();
  const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));

  if (!search) {
    return res.json({ search: '', total: 0, items: [] });
  }

  try {
    const data = await suggestProblems({ search, limit });

    res.set('Cache-Control', 'public, max-age=30');
    return res.json({ search, total: data.total, items: data.items });
  } catch (err) {
    console.error('catalog leetcode/suggest error:', err);
    return res.status(502).json({ error: err?.message || 'Failed to fetch LeetCode suggestions' });
  }
});

// GET /api/catalog/leetcode/question/:slug
// Returns statement HTML + constraints + example testcases for modal.
router.get('/leetcode/question/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) return res.status(400).json({ error: 'Missing question slug' });

  try {
    const q = await fetchQuestionContent({ titleSlug: slug });
    if (!q) return res.status(404).json({ error: 'Question not found' });

    const contentHtml = sanitizeLeetCodeHtml(q?.content || '');
    const constraints = extractConstraintsFromContentHtml(contentHtml);
    const exampleTestcases = String(q?.exampleTestcases || q?.sampleTestCase || '').trim();

    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      title: String(q?.title || ''),
      slug: String(q?.titleSlug || slug),
      difficulty: String(q?.difficulty || ''),
      contentHtml,
      constraints,
      exampleTestcases,
    });
  } catch (err) {
    console.error('catalog leetcode/question error:', err);
    return res.status(502).json({ error: 'Failed to fetch LeetCode question details' });
  }
});

// NeetCode catalog is user-provided.
// Place a JSON file at repo root: questions/neetcode.json
// Format:
// {
//   "topics": [
//     {
//       "key": "arrays",
//       "name": "Arrays",
//       "questions": [
//         { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" }
//       ]
//     }
//   ]
// }
const NEETCODE_FILE = path.join(__dirname, '../../../questions/neetcode.json');

router.get('/neetcode/topics', async (req, res) => {
  const exists = await fs.pathExists(NEETCODE_FILE);
  if (!exists) {
    return res.json({ topics: canonicalTopics(), hint: 'Create questions/neetcode.json to configure NeetCode questions.' });
  }
  return res.json({ topics: canonicalTopics() });
});

router.get('/neetcode/questions', async (req, res) => {
  const topicKey = String(req.query.topic || '').trim();
  const difficulty = normalizeDifficulty(req.query.difficulty);
  const search = String(req.query.search || '').trim().toLowerCase();

  const exists = await fs.pathExists(NEETCODE_FILE);
  if (!exists) {
    return res.json({ topic: null, total: 0, items: [], hint: 'Create questions/neetcode.json to configure NeetCode topics.' });
  }

  const json = await fs.readJson(NEETCODE_FILE);
  const topics = Array.isArray(json?.topics) ? json.topics : [];
  const topic = topics.find((t) => String(t?.key || '') === topicKey);

  if (!topic) {
    // Topic exists in canonical list but isn't populated in the mapping file yet.
    return res.json({
      topic: { key: topicKey, name: canonicalTopics().find((t) => t.key === topicKey)?.name || topicKey },
      total: 0,
      items: [],
      hint: `No NeetCode questions mapped for topic '${topicKey}' yet. Add them in questions/neetcode.json.`,
    });
  }

  let items = Array.isArray(topic?.questions) ? topic.questions : [];
  items = items
    .map((q) => ({
      title: String(q?.title || ''),
      slug: String(q?.slug || ''),
      difficulty: normalizeDifficulty(q?.difficulty) || null,
    }))
    .filter((q) => q.title && q.slug);

  if (difficulty) {
    items = items.filter((q) => q.difficulty === difficulty);
  }

  if (search) {
    items = items.filter((q) => q.title.toLowerCase().includes(search) || q.slug.toLowerCase().includes(search));
  }

  res.json({
    topic: { key: String(topic.key), name: String(topic.name) },
    total: items.length,
    items,
  });
});

module.exports = router;
