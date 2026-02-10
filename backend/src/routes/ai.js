const express = require('express');

const { requireAuth } = require('../middleware/requireAuth');
const { fetchQuestionContent } = require('../services/leetcodeClient');

const router = express.Router();

function getAiProvider() {
  return 'gemini';
}

function looksLikeGeminiApiKey(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  // Google AI Studio keys are commonly long and often start with "AIza".
  return (s.startsWith('AIza') && s.length >= 20) || s.length >= 30;
}

function normalizeGeminiModelName(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

function getGeminiConfig() {
  const baseUrl = String(process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').trim();
  const defaultModel = normalizeGeminiModelName(String(process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim());

  const rawKey = String(process.env.GEMINI_API_KEY || '').trim();

  // Never let a key-like value be treated as a model name.
  const safeModel = looksLikeGeminiApiKey(defaultModel) ? 'gemini-1.5-flash' : defaultModel;

  return { apiKey: rawKey, baseUrl, model: safeModel, keySource: 'GEMINI_API_KEY' };
}

async function listGeminiModels({ apiKey, baseUrl, timeoutMs }) {
  const base = String(baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const endpoint = `${base}/models?key=${encodeURIComponent(apiKey)}`;

  const ms = Math.max(2000, Number(timeoutMs || 15000));
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(endpoint, { method: 'GET', signal: controller.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok) return [];

    const models = Array.isArray(json?.models) ? json.models : [];
    return models
      .map((m) => {
        const name = String(m?.name || '').trim();
        const normalized = normalizeGeminiModelName(name);
        const supportedGenerationMethods = Array.isArray(m?.supportedGenerationMethods)
          ? m.supportedGenerationMethods.map((x) => String(x || '').trim())
          : [];
        return {
          name: normalized,
          supportedGenerationMethods,
        };
      })
      .filter((m) => m.name);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

function pickFallbackGeminiModel(models) {
  const items = Array.isArray(models) ? models : [];
  const candidates = items.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'));
  if (!candidates.length) return '';

  // Prefer flash models for speed/cost, then any gemini model.
  const flash = candidates.find((m) => /gemini/i.test(m.name) && /flash/i.test(m.name));
  if (flash) return flash.name;

  const anyGemini = candidates.find((m) => /gemini/i.test(m.name));
  if (anyGemini) return anyGemini.name;

  return candidates[0].name;
}

function getAiConfig() {
  const provider = getAiProvider();
  const cfg = getGeminiConfig();
  return { provider, ...cfg };
}

function getMissingKeyMessage() {
  return 'AI quiz is not configured. Set GEMINI_API_KEY in the repo-root .env and restart the server.';
}

function getInvalidKeyMessage() {
  return 'Invalid GEMINI_API_KEY. Update the key in the repo-root .env and restart the server.';
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
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractConstraintsFromContentHtml(contentHtml) {
  const html = String(contentHtml || '');
  if (!html) return [];

  const m = html.match(/Constraints\s*:\s*<\/strong>\s*<\/p>\s*<ul>([\s\S]*?)<\/ul>/i);
  if (!m) return [];
  const ulInner = m[1] || '';

  const liMatches = Array.from(ulInner.matchAll(/<li>([\s\S]*?)<\/li>/gi));
  const rows = liMatches
    .map((x) => stripHtmlToText(x[1]))
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const seen = new Set();
  return rows.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

function normalizeSlug(value) {
  const slug = String(value || '').trim();
  if (!slug) return '';
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return '';
  return slug;
}

router.get('/status', requireAuth, (req, res) => {
  const cfg = getAiConfig();
  const apiKey = cfg.apiKey;

  const configured = Boolean(apiKey);
  const looksValid = configured ? looksLikeGeminiApiKey(apiKey) : false;

  return res.json({
    provider: cfg.provider,
    configured,
    looksValid,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    keySource: configured ? cfg.keySource : null,
  });
});

async function geminiChatJson({ messages, model, timeoutMs }) {
  const cfg = getGeminiConfig();
  const apiKey = cfg.apiKey;
  if (!apiKey) {
    const err = new Error(getMissingKeyMessage());
    err.statusCode = 400;
    throw err;
  }

  const selectedModel = normalizeGeminiModelName(String(model || cfg.model || 'gemini-1.5-flash').trim());
  const base = String(cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const endpointFor = (modelName) =>
    `${base}/models/${encodeURIComponent(normalizeGeminiModelName(modelName))}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const ms = Math.max(2000, Number(timeoutMs || process.env.GEMINI_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || 20000));

  const systemText = messages
    .filter((m) => m?.role === 'system')
    .map((m) => String(m?.content || '').trim())
    .filter(Boolean)
    .join('\n\n');

  const userText = messages
    .filter((m) => m?.role === 'user')
    .map((m) => String(m?.content || '').trim())
    .filter(Boolean)
    .join('\n\n');

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  const buildBody = ({ includeSystemInstruction, includeResponseMimeType }) => {
    const generationConfig = {
      temperature: 0.3,
      ...(includeResponseMimeType ? { responseMimeType: 'application/json' } : {}),
    };

    return {
      ...(includeSystemInstruction && systemText
        ? { systemInstruction: { parts: [{ text: systemText }] } }
        : {}),
      contents: [{ role: 'user', parts: [{ text: userText || '' }] }],
      generationConfig,
    };
  };

  async function doRequest({ includeSystemInstruction, includeResponseMimeType }) {
    return fetch(endpointFor(selectedModel), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildBody({ includeSystemInstruction, includeResponseMimeType })),
      signal: controller.signal,
    });
  }

  let res;
  try {
    // Try with newer optional fields first.
    res = await doRequest({ includeSystemInstruction: true, includeResponseMimeType: true });
  } catch (e) {
    clearTimeout(t);
    if (e?.name === 'AbortError') throw new Error(`AI request timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(t);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const upstreamStatus = Number(res.status || 0);

    const upstreamMsg = String(json?.error?.message || '').trim();

    const modelNotFoundOrUnsupported =
      /models\//i.test(upstreamMsg) &&
      /(not found|is not supported|unsupported|not available)/i.test(upstreamMsg);

    // If the configured model isn't available for this key/API version, list models and retry with a supported one.
    if ((upstreamStatus === 404 || upstreamStatus === 400) && modelNotFoundOrUnsupported) {
      const models = await listGeminiModels({ apiKey, baseUrl: cfg.baseUrl, timeoutMs: 15000 });
      const fallback = pickFallbackGeminiModel(models);

      if (fallback && fallback !== selectedModel) {
        try {
          const retryRes = await fetch(endpointFor(fallback), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(buildBody({ includeSystemInstruction: true, includeResponseMimeType: true })),
          });
          const retryJson = await retryRes.json().catch(() => null);
          if (retryRes.ok) {
            const okText = retryJson?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!okText) {
              const err = new Error('AI response missing content');
              err.statusCode = 502;
              throw err;
            }

            let parsed;
            try {
              const cleaned = String(okText)
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();
              parsed = JSON.parse(cleaned);
            } catch {
              const cleaned = String(okText)
                .replace(/```json|```/gi, '')
                .trim();
              const start = cleaned.indexOf('{');
              const end = cleaned.lastIndexOf('}');
              if (start >= 0 && end > start) parsed = JSON.parse(cleaned.slice(start, end + 1));
              else throw new Error('AI returned invalid JSON');
            }

            return parsed;
          }
        } catch (e) {
          console.error('Gemini fallback model retry failed:', e?.message || e);
        }
      }

      const available = models
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name)
        .slice(0, 12);

      const msg =
        `Gemini model "${selectedModel}" is not available for your API key. ` +
        (available.length
          ? `Try setting GEMINI_MODEL to one of: ${available.join(', ')}`
          : 'Try setting a different GEMINI_MODEL or check your Gemini API access.');
      const err = new Error(msg);
      err.statusCode = 400;
      throw err;
    }

    // Retry once without optional fields if Gemini rejects them (API/version differences).
    if ((upstreamStatus === 400 || upstreamStatus === 404) && upstreamMsg) {
      const mentionsResponseMimeType = /responsemimetype|response_mime_type|unknown field/i.test(upstreamMsg);
      const mentionsSystemInstruction = /systeminstruction|system_instruction|unknown field/i.test(upstreamMsg);

      if (mentionsResponseMimeType || mentionsSystemInstruction) {
        try {
          const retryRes = await fetch(endpointFor(selectedModel), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(
              buildBody({
                includeSystemInstruction: !mentionsSystemInstruction,
                includeResponseMimeType: !mentionsResponseMimeType,
              })
            ),
          });
          const retryJson = await retryRes.json().catch(() => null);

          if (retryRes.ok) {
            // Continue with retryJson response parsing below.
            res = retryRes;
            // eslint-disable-next-line no-unused-vars
            const _ = 0;
            // Use retryJson as json value.
            // (We can't reassign const json; so handle via local var.)
            const okText = retryJson?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!okText) {
              const err = new Error('AI response missing content');
              err.statusCode = 502;
              throw err;
            }

            let parsed;
            try {
              const cleaned = String(okText)
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();
              parsed = JSON.parse(cleaned);
            } catch {
              // As a fallback, attempt to parse the first JSON object substring.
              const cleaned = String(okText)
                .replace(/```json|```/gi, '')
                .trim();
              const start = cleaned.indexOf('{');
              const end = cleaned.lastIndexOf('}');
              if (start >= 0 && end > start) {
                parsed = JSON.parse(cleaned.slice(start, end + 1));
              } else {
                const err = new Error('AI returned invalid JSON');
                err.statusCode = 502;
                throw err;
              }
            }

            return parsed;
          }

          // If retry still fails, fall through to normal error handling using retryJson.
          const retryStatus = Number(retryRes.status || 0);
          const retryMsg = String(retryJson?.error?.message || '').trim();
          console.error('Gemini error (after retry):', { status: retryStatus, message: retryMsg.slice(0, 500) });
        } catch (e) {
          // If retry attempt itself errors, we'll fall through to normal handling below.
          console.error('Gemini retry attempt failed:', e?.message || e);
        }
      }
    }

    if (upstreamStatus === 401 || upstreamStatus === 403) {
      const err = new Error(getInvalidKeyMessage());
      err.statusCode = 400;
      throw err;
    }

    if (upstreamStatus === 429) {
      const err = new Error('AI is rate limited right now. Please try again in a bit.');
      err.statusCode = 429;
      throw err;
    }

    // If Gemini returns a client error (bad model, bad request), surface it as 400 so the UI can show it.
    if (upstreamStatus >= 400 && upstreamStatus < 500) {
      const msg = upstreamMsg || 'Gemini request was rejected. Check GEMINI_MODEL and GEMINI_API_KEY.';
      console.error('Gemini client error:', { status: upstreamStatus, message: msg.slice(0, 500) });
      const err = new Error(msg);
      err.statusCode = 400;
      throw err;
    }

    const err = new Error('AI provider error. Please try again.');
    err.statusCode = 502;
    throw err;
  }

  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error('AI response missing content');
    err.statusCode = 502;
    throw err;
  }

  let parsed;
  try {
    const cleaned = String(text)
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: try to parse the first JSON object substring.
    const cleaned = String(text)
      .replace(/```json|```/gi, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        const err = new Error('AI returned invalid JSON');
        err.statusCode = 502;
        throw err;
      }
    } else {
      const err = new Error('AI returned invalid JSON');
      err.statusCode = 502;
      throw err;
    }
  }

  return parsed;
}

async function aiChatJson({ messages, model, timeoutMs }) {
  return geminiChatJson({ messages, model, timeoutMs });
}

router.post('/quiz', requireAuth, async (req, res) => {
  const slug = normalizeSlug(req.body?.slug);
  const titleHint = String(req.body?.title || '').trim();
  const approach = String(req.body?.approach || '').trim();

  if (!slug) return res.status(400).json({ error: 'Missing or invalid slug' });

  let leetcode;
  try {
    leetcode = await fetchQuestionContent({ titleSlug: slug });
  } catch (e) {
    // If LeetCode is blocked/rate limited, we still allow a quiz from title/slug.
    leetcode = null;
  }

  const title = String(leetcode?.title || titleHint || slug);
  const difficulty = String(leetcode?.difficulty || '').trim();
  const exampleTestcases = String(leetcode?.exampleTestcases || leetcode?.sampleTestCase || '').trim();
  const constraints = extractConstraintsFromContentHtml(String(leetcode?.content || ''));

  // Use only a short excerpt of the statement for context (avoid copying the whole statement).
  const statementText = stripHtmlToText(String(leetcode?.content || ''));
  const statementExcerpt = statementText ? statementText.slice(0, 800) : '';

  const prompt = {
    title,
    slug,
    difficulty: difficulty || null,
    constraints: constraints.slice(0, 12),
    exampleTestcases: exampleTestcases ? exampleTestcases.slice(0, 600) : '',
    statementExcerpt,
    userApproach: approach,
  };

  const messages = [
    {
      role: 'system',
      content:
        'You are a DSA tutor. Create multiple-choice quizzes for coding interview questions. Do NOT copy the problem statement verbatim; write original questions that test understanding. Return ONLY JSON.',
    },
    {
      role: 'user',
      content:
        'Generate 5 MCQ questions for the following problem context. Requirements:\n' +
        '- Exactly 5 questions\n' +
        '- Each has 4 options\n' +
        '- Exactly one correct option\n' +
        '- Include at least 1 time complexity question and at least 1 space complexity question\n' +
        '- Include at least 1 edge case / constraints question\n' +
        (approach ? '- CRITICAL: The user has proposed an approach (see userApproach). questions 1 and 2 MUST critique or validate their specific approach (is it optimal? does it handle edge cases? is the complexity correct? etc).\n' : '') +
        '- Keep each explanation under 40 words\n' +
        '\nReturn JSON with shape: {"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","category":"time|space|edge|algo|reasoning"}] }\n' +
        '\nContext:\n' +
        JSON.stringify(prompt, null, 2),
    },
  ];

  try {
    const out = await aiChatJson({ messages });
    const questions = Array.isArray(out?.questions) ? out.questions : [];

    const normalized = questions
      .map((q) => {
        const question = String(q?.question || '').trim();
        const options = Array.isArray(q?.options) ? q.options.map((x) => String(x || '').trim()) : [];
        const correctIndex = Number(q?.correctIndex);
        const explanation = String(q?.explanation || '').trim();
        const category = String(q?.category || '').trim();

        if (!question) return null;
        if (options.length !== 4) return null;
        if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;

        return {
          question,
          options,
          correctIndex,
          explanation: explanation.slice(0, 220),
          category,
        };
      })
      .filter(Boolean);

    if (normalized.length !== 5) {
      return res.status(502).json({ error: 'AI did not return exactly 5 valid MCQs. Please try again.' });
    }

    return res.json({
      title,
      slug,
      questions: normalized,
    });
  } catch (e) {
    const status = Number(e?.statusCode || 500);
    const msg = String(e?.message || 'Failed to generate quiz');
    return res.status(status).json({ error: msg });
  }
});

module.exports = router;
