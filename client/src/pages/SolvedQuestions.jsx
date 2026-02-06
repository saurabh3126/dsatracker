import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

function toISTMonthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  // IST = UTC+05:30 (no DST). Shift then read UTC parts.
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function formatISTMonthLabel(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(d);
  }
}

export default function SolvedQuestions() {
  const { isLoggedIn } = useAuth();

  const PAGE_SIZE = 10;

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [items, setItems] = useState([]);
  const [totalStored, setTotalStored] = useState(0);
  const [monthlyRevisionItems, setMonthlyRevisionItems] = useState([]);

  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [pageByMonthKey, setPageByMonthKey] = useState({});

  const [reviseItem, setReviseItem] = useState(null);

  const [quizItem, setQuizItem] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [quizData, setQuizData] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [quizSelections, setQuizSelections] = useState({});

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const total = useMemo(() => {
    return items.length + monthlyRevisionItems.length;
  }, [items.length, monthlyRevisionItems.length]);

  const monthGroups = useMemo(() => {
    const groups = new Map();

    const combined = [...items, ...monthlyRevisionItems];
    for (const it of combined) {
      const solvedAt = it?.solvedAt;
      const key = toISTMonthKey(solvedAt);
      if (!key) continue;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: formatISTMonthLabel(solvedAt),
          items: [],
          sortTs: new Date(solvedAt).getTime(),
        });
      }

      const g = groups.get(key);
      g.items.push(it);
      const ts = new Date(solvedAt).getTime();
      if (Number.isFinite(ts) && ts > g.sortTs) g.sortTs = ts;
    }

    const arr = Array.from(groups.values());
    for (const g of arr) {
      g.items.sort((a, b) => {
        const ta = new Date(a?.solvedAt || 0).getTime();
        const tb = new Date(b?.solvedAt || 0).getTime();
        return (tb || 0) - (ta || 0);
      });
    }
    arr.sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0));
    return arr;
  }, [items, monthlyRevisionItems]);

  useEffect(() => {
    if (!monthGroups.length) {
      setSelectedMonthKey('');
      return;
    }

    if (!selectedMonthKey) {
      setSelectedMonthKey(monthGroups[0].key);
      return;
    }

    const stillExists = monthGroups.some((g) => g.key === selectedMonthKey);
    if (!stillExists) setSelectedMonthKey(monthGroups[0].key);
  }, [monthGroups, selectedMonthKey]);

  useEffect(() => {
    if (!selectedMonthKey) return;
    setPageByMonthKey((prev) => ({ ...prev, [selectedMonthKey]: 1 }));
  }, [selectedMonthKey]);

  const visibleGroups = useMemo(() => {
    if (!selectedMonthKey) return monthGroups;
    return monthGroups.filter((g) => g.key === selectedMonthKey);
  }, [monthGroups, selectedMonthKey]);

  async function loadStoredSolved() {
    const json = await apiGet('/api/solved');
    setItems(Array.isArray(json?.items) ? json.items : []);
    setTotalStored(Number(json?.total || 0));
  }

  async function loadMonthlyRevisionArchive() {
    const json = await apiGet('/api/revision/monthly-archive');
    const months = Array.isArray(json?.months) ? json.months : [];
    const flat = [];

    for (const m of months) {
      const its = Array.isArray(m?.items) ? m.items : [];
      for (const it of its) {
        flat.push({
          _id: `${m.monthKey}:${it.itemKey}:${it.completedAt}`,
          title: it.title,
          ref: it.ref,
          link: it.link,
          solvedAt: it.completedAt,
          kind: 'monthly-revision',
        });
      }
    }

    setMonthlyRevisionItems(flat);
  }

  async function syncLeetcodeToStored() {
    await apiPost('/api/solved/leetcode/sync?limit=500', {});
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setSyncing(false);
        setError('');
        setMessage('');

        if (!isLoggedIn) {
          setItems([]);
          setTotalStored(0);
          setMonthlyRevisionItems([]);
          return;
        }

        // Show whatever is already stored immediately, then sync and reload.
        try {
          await loadStoredSolved();
          await loadMonthlyRevisionArchive();
        } catch {
          // Ignore here; we'll surface errors below.
        }

        if (cancelled) return;
        setSyncing(true);
        try {
          await syncLeetcodeToStored();
          await loadStoredSolved();
          await loadMonthlyRevisionArchive();
        } finally {
          if (!cancelled) setSyncing(false);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load solved questions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  async function reviseSolved(item, bucket) {
    try {
      const res = await apiPost('/api/revision/from-leetcode', { slug: item.ref, bucket });
      if (res?.duplicate) setMessage('Already in revision buckets (no duplicates).');
      else setMessage('Added to revision.');
    } catch (e) {
      setError(e?.message || 'Failed to add to revision');
    }
  }

  async function generateQuizFor(item) {
    const slug = String(item?.ref || '').trim();
    if (!slug) {
      setQuizError('Missing question slug for this item.');
      return;
    }

    const providerFromStatus = (status) => String(status?.provider || 'openai').toLowerCase();
    const keyNameForProvider = (provider) => (provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY');

    try {
      const status = await apiGet('/api/ai/status');
      setAiStatus(status);
      const provider = providerFromStatus(status);
      const keyName = keyNameForProvider(provider);
      if (status?.configured === false) {
        setQuizError(`${keyName} is not set on the server. Add it to the repo-root .env and restart the server.`);
        return;
      }
      if (status?.looksValid === false) {
        setQuizError(`${keyName} looks invalid. Update the key in the repo-root .env and restart the server.`);
        return;
      }
    } catch {
      // If status check fails, still attempt quiz generation and show its error.
    }

    setQuizLoading(true);
    setQuizError('');
    setQuizData(null);
    setQuizSelections({});

    try {
      const json = await apiPost('/api/ai/quiz', { slug, title: item?.title || '' });
      setQuizData(json);
    } catch (e) {
      setQuizError(e?.message || 'Failed to generate quiz');
    } finally {
      setQuizLoading(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-100">Recently Solved</h1>
        <p className="mt-2 text-slate-400">Login to view your recently solved questions.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Recently Solved</h1>
          <p className="mt-1 text-sm text-slate-400">Stored month-wise from your LeetCode accepted submissions.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-slate-400">Month</div>
            <select
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
              value={selectedMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              disabled={!monthGroups.length}
            >
              {monthGroups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label || g.key}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            onClick={async () => {
              setLoading(true);
              try {
                setSyncing(true);
                try {
                  setError('');
                  setMessage('');
                  await syncLeetcodeToStored();
                  await loadStoredSolved();
                  await loadMonthlyRevisionArchive();
                  setMessage('Synced successfully.');
                } finally {
                  setSyncing(false);
                }
              } finally {
                setLoading(false);
              }
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        {message ? <div className="text-sm text-emerald-300">{message}</div> : null}
        {error ? <div className="mt-1 text-sm text-rose-300">{error}</div> : null}
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Total: {total}
          {totalStored ? <span className="text-slate-500"> (stored: {totalStored})</span> : null}
        </div>
        <div className="text-xs text-slate-500">{syncing ? 'Syncing from LeetCode…' : null}</div>
      </div>

      {loading ? <div className="mt-6 text-slate-300">Loading…</div> : null}

      <div className="mt-6 space-y-3">
        {!loading && !visibleGroups.length ? (
          <div className="text-sm text-slate-500">No solved questions stored yet.</div>
        ) : null}

        {!loading
          ? visibleGroups.map((group) => {
              const totalPages = Math.max(1, Math.ceil(group.items.length / PAGE_SIZE));
              const rawPage = Number(pageByMonthKey[group.key] || 1);
              const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, rawPage), totalPages) : 1;
              const start = (page - 1) * PAGE_SIZE;
              const end = start + PAGE_SIZE;
              const pageItems = totalPages > 1 ? group.items.slice(start, end) : group.items;

              return (
                <div key={group.key} className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100">{group.label || group.key}</div>
                    <div className="text-xs text-slate-500">{group.items.length}</div>
                  </div>

                  {totalPages > 1 ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        Page {page} / {totalPages}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={page <= 1}
                          onClick={() =>
                            setPageByMonthKey((prev) => ({
                              ...prev,
                              [group.key]: Math.max(1, page - 1),
                            }))
                          }
                          className={
                            'rounded-lg px-3 py-2 text-xs ring-1 ' +
                            (page <= 1
                              ? 'cursor-not-allowed bg-white/5 text-slate-500 ring-white/10'
                              : 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10')
                          }
                        >
                          Prev
                        </button>

                        {Array.from({ length: totalPages }).map((_, idx) => {
                          const n = idx + 1;
                          const isActive = n === page;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                setPageByMonthKey((prev) => ({
                                  ...prev,
                                  [group.key]: n,
                                }))
                              }
                              className={
                                'rounded-lg px-3 py-2 text-xs ring-1 ' +
                                (isActive
                                  ? 'bg-white/10 text-slate-100 ring-white/20'
                                  : 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10')
                              }
                            >
                              {n}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          disabled={page >= totalPages}
                          onClick={() =>
                            setPageByMonthKey((prev) => ({
                              ...prev,
                              [group.key]: Math.min(totalPages, page + 1),
                            }))
                          }
                          className={
                            'rounded-lg px-3 py-2 text-xs ring-1 ' +
                            (page >= totalPages
                              ? 'cursor-not-allowed bg-white/5 text-slate-500 ring-white/10'
                              : 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10')
                          }
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-3">
                    {pageItems.map((it) => (
                      <div
                        key={String(it?._id || it?.questionKey || it?.ref)}
                        className="rounded-xl border border-white/10 bg-slate-900/20 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-100">{it.title}</div>
                            <div className="mt-1 truncate text-xs text-slate-400">{it.ref}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <a
                              href={it.link}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                            >
                              Open
                            </a>

                            <button
                              type="button"
                              onClick={() => {
                                setQuizItem({ title: it.title, ref: it.ref });
                                setQuizError('');
                                setQuizData(null);
                                setAiStatus(null);
                                setQuizSelections({});
                                generateQuizFor(it);
                              }}
                              className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                            >
                              Quiz
                            </button>

                            <button
                              type="button"
                              onClick={() => setReviseItem({ title: it.title, ref: it.ref })}
                              className="rounded-lg bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-200 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25"
                            >
                              Revise
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          : null}
      </div>

      {quizItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setQuizItem(null);
              setQuizData(null);
              setQuizError('');
              setQuizLoading(false);
              setQuizSelections({});
            }
          }}
        >
          <div className="w-[min(980px,calc(100vw-2rem))]">
            <div className="dsa-scroll max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-8">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-300">Quiz</p>
                  <p className="mt-1 truncate text-xl font-semibold text-white">{quizItem.title}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{quizItem.ref}</p>
                </div>
                <button
                  type="button"
                  className="rounded-2xl bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                  onClick={() => {
                    setQuizItem(null);
                    setQuizData(null);
                    setQuizError('');
                    setQuizLoading(false);
                    setQuizSelections({});
                  }}
                >
                  Close
                </button>
              </div>

              <div className="mt-5">
                {quizLoading ? <div className="text-sm text-slate-300">Loading…</div> : null}
                {quizError ? <div className="mt-2 text-sm text-rose-300">{quizError}</div> : null}

                {aiStatus?.configured === false ? (
                  <div className="mt-2 text-xs text-slate-400">
                    AI status: not configured (server missing{' '}
                    <span className="font-mono">
                      {String(aiStatus?.provider || 'openai').toLowerCase() === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'}
                    </span>
                    ).
                  </div>
                ) : null}

                {!quizLoading && !quizError ? (
                  <button
                    type="button"
                    className="rounded-2xl bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                    onClick={() => generateQuizFor(quizItem)}
                  >
                    Reload
                  </button>
                ) : null}

                {Array.isArray(quizData?.questions) && quizData.questions.length ? (
                  <div className="mt-5 space-y-4">
                    {quizData.questions.map((q, idx) => (
                      <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold text-white">
                            {idx + 1}. {q.question}
                          </div>
                          {q.category ? (
                            <div className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-300">
                              {q.category}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 grid gap-2">
                          {q.options.map((opt, oi) => {
                            const selectedIndex = quizSelections[idx];
                            const answered = selectedIndex !== undefined;
                            const isCorrect = oi === q.correctIndex;
                            const isSelected = oi === selectedIndex;

                            const cls =
                              'rounded-xl border px-3 py-2 text-left text-sm transition-colors ' +
                              (answered
                                ? isCorrect
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                  : isSelected
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                                    : 'border-white/10 bg-black/20 text-slate-200'
                                : 'cursor-pointer border-white/10 bg-black/20 text-slate-200 hover:bg-white/10');

                            return (
                              <button
                                key={oi}
                                type="button"
                                className={cls}
                                disabled={answered}
                                onClick={() => {
                                  if (answered) return;
                                  setQuizSelections((prev) => ({ ...prev, [idx]: oi }));
                                }}
                              >
                                <span className="mr-2 font-semibold text-slate-300">
                                  {String.fromCharCode(65 + oi)}.
                                </span>
                                {opt}
                              </button>
                            );
                          })}
                        </div>

                        {quizSelections[idx] !== undefined ? (
                          <div className="mt-3 text-xs text-slate-300">
                            <div>
                              Correct answer:{' '}
                              <span className="font-semibold text-slate-100">
                                {String.fromCharCode(65 + q.correctIndex)}. {q.options[q.correctIndex]}
                              </span>
                            </div>
                            {q.explanation ? <div className="mt-2">{q.explanation}</div> : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reviseItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="text-base font-semibold text-slate-100">Add to revision</div>
            <div className="mt-1 text-sm text-slate-400">Choose a bucket for:</div>
            <div className="mt-2 truncate text-sm font-semibold text-slate-200">{reviseItem.title}</div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                className="rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-500/25 hover:bg-emerald-500/20"
                onClick={async () => {
                  const it = reviseItem;
                  setReviseItem(null);
                  await reviseSolved(it, 'today');
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="rounded-xl bg-indigo-500/15 px-3 py-2 text-sm font-semibold text-indigo-200 ring-1 ring-indigo-500/25 hover:bg-indigo-500/20"
                onClick={async () => {
                  const it = reviseItem;
                  setReviseItem(null);
                  await reviseSolved(it, 'week');
                }}
              >
                Upcoming Sunday
              </button>
              <button
                type="button"
                className="rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
                onClick={async () => {
                  const it = reviseItem;
                  setReviseItem(null);
                  await reviseSolved(it, 'month');
                }}
              >
                Month
              </button>
            </div>

            <div className="mt-4">
              <button
                type="button"
                className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                onClick={() => setReviseItem(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
