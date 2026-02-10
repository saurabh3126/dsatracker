const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

const LEETCODE_PROBLEMS_ALL_URL = 'https://leetcode.com/api/problems/all/';

const LEETCODE_TIMEOUT_MS = Math.max(1000, Number(process.env.LEETCODE_TIMEOUT_MS || 12000));
const LEETCODE_CACHE_TTL_MS = Math.max(0, Number(process.env.LEETCODE_CACHE_TTL_MS || 10_000));
const LEETCODE_CACHE_MAX_ENTRIES = Math.max(50, Number(process.env.LEETCODE_CACHE_MAX_ENTRIES || 250));

const LEETCODE_ALL_PROBLEMS_TTL_MS = Math.max(60_000, Number(process.env.LEETCODE_ALL_PROBLEMS_TTL_MS || 6 * 60 * 60 * 1000));

// Simple in-memory cache for catalog-like, public GraphQL queries.
// Keyed by query+variables; expires via TTL.
const _cache = new Map();

let _allProblemsCache = null;
let _allProblemsExpiresAt = 0;

function clearCache() {
  _cache.clear();
}

function _difficultyLevelToLabel(level) {
  if (Number(level) === 1) return 'Easy';
  if (Number(level) === 2) return 'Medium';
  if (Number(level) === 3) return 'Hard';
  return null;
}

async function fetchAllProblemsIndex() {
  if (_allProblemsCache && _allProblemsExpiresAt > Date.now()) return _allProblemsCache;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), LEETCODE_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(LEETCODE_PROBLEMS_ALL_URL, {
      headers: {
        accept: 'application/json',
        'user-agent': process.env.LEETCODE_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
        referer: 'https://leetcode.com/',
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (err?.name === 'AbortError') {
      throw new Error(`LeetCode problems index timed out after ${LEETCODE_TIMEOUT_MS}ms`);
    }
    throw new Error(`LeetCode problems index failed: ${err?.message || String(err)}`);
  }

  clearTimeout(timeoutHandle);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LeetCode problems index HTTP ${response.status}: ${text}`);
  }

  const payload = await response.json();
  const pairs = Array.isArray(payload?.stat_status_pairs) ? payload.stat_status_pairs : [];

  const items = pairs
    .map((p) => {
      const stat = p?.stat || {};
      const id = stat?.frontend_question_id != null ? String(stat.frontend_question_id) : null;
      const slug = stat?.question__title_slug ? String(stat.question__title_slug) : '';
      const title = stat?.question__title ? String(stat.question__title) : '';
      const level = p?.difficulty?.level;

      if (!slug || !title) return null;

      return {
        id,
        slug,
        title,
        difficulty: _difficultyLevelToLabel(level),
        link: `https://leetcode.com/problems/${slug}/`,
      };
    })
    .filter(Boolean);

  // Sort by numeric id if present.
  items.sort((a, b) => {
    const ai = a.id ? Number(a.id) : Number.POSITIVE_INFINITY;
    const bi = b.id ? Number(b.id) : Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    return String(a.slug).localeCompare(String(b.slug));
  });

  _allProblemsCache = items;
  _allProblemsExpiresAt = Date.now() + LEETCODE_ALL_PROBLEMS_TTL_MS;
  return items;
}

function _normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

async function suggestProblems({ search, limit = 10 }) {
  const q = _normalizeSearchText(search);
  const n = /^\d{1,5}$/.test(q) ? q : null;
  const max = Math.min(20, Math.max(1, Number(limit || 10)));

  const items = await fetchAllProblemsIndex();

  if (!q) return { total: 0, items: [] };

  let matches;
  if (n) {
    // Exact number match first, then a small window after it.
    const start = items.findIndex((x) => x.id === n);
    if (start >= 0) matches = items.slice(start, start + max);
    else matches = [];
  } else {
    matches = items.filter((x) => {
      const title = _normalizeSearchText(x.title);
      const slug = _normalizeSearchText(x.slug);
      return title.includes(q) || slug.includes(q);
    });
  }

  return { total: matches.length, items: matches.slice(0, max) };
}

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
}

function _cacheSet(key, value, ttlMs) {
  if (!ttlMs) return;
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (_cache.size <= LEETCODE_CACHE_MAX_ENTRIES) return;
  // Delete oldest entries (Map preserves insertion order)
  const overflow = _cache.size - LEETCODE_CACHE_MAX_ENTRIES;
  let i = 0;
  for (const k of _cache.keys()) {
    _cache.delete(k);
    i += 1;
    if (i >= overflow) break;
  }
}

function _makeCacheKey(query, variables) {
  // Ensure stable key for arrays
  const v = variables && typeof variables === 'object' ? { ...variables } : variables;
  if (v?.filters?.topicFilter?.topicSlugs && Array.isArray(v.filters.topicFilter.topicSlugs)) {
    v.filters = { ...v.filters, topicFilter: { ...v.filters.topicFilter, topicSlugs: [...v.filters.topicFilter.topicSlugs].sort() } };
  }
  if (typeof v?.searchKeyword === 'string') {
    v.searchKeyword = v.searchKeyword.trim();
  }
  return JSON.stringify({ query, variables: v });
}

function normalizeDifficultyEnumToLabel(value) {
  const v = String(value || '').toUpperCase();
  if (v === 'EASY') return 'Easy';
  if (v === 'MEDIUM') return 'Medium';
  if (v === 'HARD') return 'Hard';
  return value || null;
}

function normalizeAcceptanceRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Some LeetCode payloads may return 0..1 instead of 0..100.
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  // Clamp to sane range.
  if (pct < 0 || pct > 1000) return null;
  return pct;
}

async function leetcodeGraphQL(query, variables, { skipCache } = {}) {
  const cacheKey = _makeCacheKey(query, variables);
  if (!skipCache) {
    const cached = _cacheGet(cacheKey);
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), LEETCODE_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        // Some environments get blocked without a UA.
        'user-agent': process.env.LEETCODE_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
        referer: 'https://leetcode.com/',
        origin: 'https://leetcode.com',
        'accept-language': process.env.LEETCODE_ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (err?.name === 'AbortError') {
      throw new Error(`LeetCode request timed out after ${LEETCODE_TIMEOUT_MS}ms`);
    }
    throw new Error(`LeetCode request failed: ${err?.message || String(err)}`);
  }

  clearTimeout(timeoutHandle);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const hint =
      response.status === 403
        ? ' (blocked/forbidden; try again later or set LEETCODE_USER_AGENT)'
        : response.status === 429
          ? ' (rate limited; slow down or increase LEETCODE_CACHE_TTL_MS)'
          : '';
    throw new Error(`LeetCode GraphQL HTTP ${response.status}${hint}: ${text}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    const message = payload.errors.map((e) => e.message).join('; ');
    throw new Error(`LeetCode GraphQL error: ${message}`);
  }

  _cacheSet(cacheKey, payload.data, LEETCODE_CACHE_TTL_MS);
  return payload.data;
}

async function fetchRecentAcceptedSubmissions({ username, limit = 20, skipCache = false }) {
  if (!username) throw new Error('username is required');

  const query = `
    query recentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        id
        title
        titleSlug
        timestamp
      }
    }
  `;

  const data = await leetcodeGraphQL(query, { username, limit }, { skipCache });
  return data?.recentAcSubmissionList ?? [];
}

async function fetchQuestionDetails({ titleSlug }) {
  if (!titleSlug) throw new Error('titleSlug is required');

  const query = `
    query questionDetails($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        titleSlug
        difficulty
      }
    }
  `;

  const data = await leetcodeGraphQL(query, { titleSlug });
  return data?.question ?? null;
}

async function fetchQuestionContent({ titleSlug }) {
  if (!titleSlug) throw new Error('titleSlug is required');

  const query = `
    query questionContent($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        titleSlug
        difficulty
        content
        exampleTestcases
        sampleTestCase
        metaData
      }
    }
  `;

  const data = await leetcodeGraphQL(query, { titleSlug });
  return data?.question ?? null;
}

async function fetchPOTD({ skipCache } = {}) {
  const query = `
    query potd {
      activeDailyCodingChallengeQuestion {
        date
        link
        question {
          title
          titleSlug
          difficulty
        }
      }
    }
  `;

  const data = await leetcodeGraphQL(query, {}, { skipCache });
  return data?.activeDailyCodingChallengeQuestion ?? null;
}

async function checkIfPotdSolved({ username, limit = 50, skipCache = false }) {
  const potd = await fetchPOTD({ skipCache });
  const slug = potd?.question?.titleSlug;
  if (!slug) {
    return { potd, solved: false, reason: 'POTD slug missing' };
  }

  if (!username) {
    return { potd, solved: false, reason: 'username missing' };
  }

  function dateKeyInTimeZone(date, timeZone) {
    try {
      // YYYY-MM-DD (stable and easy to compare)
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    } catch {
      // Fallback: use UTC date if Intl tz data isn't available.
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // LeetCode's daily challenge date flips at 00:00 UTC (05:30 IST).
  // The `potd.date` field is already a YYYY-MM-DD string in LeetCode's day basis.
  const potdDateKey = typeof potd?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(potd.date)
    ? potd.date
    : dateKeyInTimeZone(new Date(), 'UTC');

  const recent = await fetchRecentAcceptedSubmissions({ username, limit, skipCache });

  // Only count POTD as solved if there is an AC submission for this slug on the POTD's UTC date.
  const solved = (recent || []).some((s) => {
    if (s?.titleSlug !== slug) return false;
    const ts = Number(s?.timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    const submittedAt = new Date(ts * 1000);
    return dateKeyInTimeZone(submittedAt, 'UTC') === potdDateKey;
  });

  // If not solved today, keep reason empty so UI doesn't show a confusing message.
  return { potd, solved, reason: solved ? 'submitted today' : '' };
}

async function fetchProblemsetQuestions({ limit = 50, skip = 0, difficulty, tagSlugs = [], search = '' }) {
  // LeetCode frequently changes field names; currently the stable field is `problemsetQuestionListV2`.
  // We *try* to include frontendQuestionId for "search by number" UX; if the field isn't available,
  // we retry without it.
  const queryWithFrontendId = `
    query problemset($categorySlug: String, $limit: Int!, $skip: Int!, $filters: QuestionFilterInput, $searchKeyword: String) {
      problemsetQuestionListV2(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters, searchKeyword: $searchKeyword) {
        totalLength
        hasMore
        questions {
          frontendQuestionId
          title
          titleSlug
          difficulty
          acRate
          topicTags {
            name
            slug
          }
        }
      }
    }
  `;

  const queryWithoutFrontendId = `
    query problemset($categorySlug: String, $limit: Int!, $skip: Int!, $filters: QuestionFilterInput, $searchKeyword: String) {
      problemsetQuestionListV2(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters, searchKeyword: $searchKeyword) {
        totalLength
        hasMore
        questions {
          title
          titleSlug
          difficulty
          acRate
          topicTags {
            name
            slug
          }
        }
      }
    }
  `;

  const filters = {
    filterCombineType: 'ALL',
  };

  if (Array.isArray(tagSlugs) && tagSlugs.length) {
    filters.topicFilter = {
      topicSlugs: tagSlugs,
      operator: 'IS',
    };
  }

  if (difficulty) {
    filters.difficultyFilter = {
      difficulties: [String(difficulty).toUpperCase()],
      operator: 'IS',
    };
  }

  let data;
  try {
    data = await leetcodeGraphQL(queryWithFrontendId, {
      categorySlug: '',
      limit,
      skip,
      filters,
      searchKeyword: search || null,
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (/cannot\s+query\s+field/i.test(msg) && /frontendquestionid/i.test(msg)) {
      data = await leetcodeGraphQL(queryWithoutFrontendId, {
        categorySlug: '',
        limit,
        skip,
        filters,
        searchKeyword: search || null,
      });
    } else {
      throw err;
    }
  }

  const list = data?.problemsetQuestionListV2;
  const total = Number(list?.totalLength || 0);
  const hasMore = Boolean(list?.hasMore);
  const questions = Array.isArray(list?.questions) ? list.questions : [];

  const items = questions
    .map((q) => ({
      id: q?.frontendQuestionId ? String(q.frontendQuestionId) : null,
      title: q?.title,
      slug: q?.titleSlug,
      difficulty: normalizeDifficultyEnumToLabel(q?.difficulty),
      acceptanceRate: normalizeAcceptanceRate(q?.acRate),
      tags: Array.isArray(q?.topicTags)
        ? q.topicTags
            .map((t) => ({ name: t?.name, slug: t?.slug }))
            .filter((t) => t.name && t.slug)
        : [],
      link: q?.titleSlug ? `https://leetcode.com/problems/${q.titleSlug}/` : null,
    }))
    .filter((x) => x.title && x.slug);

  return {
    total,
    limit,
    skip,
    hasMore,
    items,
  };
}

module.exports = {
  leetcodeGraphQL,
  fetchRecentAcceptedSubmissions,
  fetchQuestionDetails,
  fetchQuestionContent,
  fetchProblemsetQuestions,
  fetchAllProblemsIndex,
  suggestProblems,
  fetchPOTD,
  checkIfPotdSolved,
  clearCache,
};
