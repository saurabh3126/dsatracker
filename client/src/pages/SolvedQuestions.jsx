import { useEffect, useMemo, useState, useRef } from 'react';
import { RefreshCcw, Search, Calendar, ChevronDown, Clock, Hash } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useStarred } from '../auth/StarredContext.jsx';
import LoadingIndicator from '../components/LoadingIndicator.jsx';

function formatIstDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

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
  const { isStarred, toggleStar } = useStarred();

  const PAGE_SIZE = 10;

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [items, setItems] = useState([]);
  const [totalStored, setTotalStored] = useState(0);
  const [monthlyRevisionItems, setMonthlyRevisionItems] = useState([]);

  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [pageByMonthKey, setPageByMonthKey] = useState({});

  const [reviseItem, setReviseItem] = useState(null);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const monthDropdownRef = useRef(null);

  const [quizItem, setQuizItem] = useState(null);

  const [statementItem, setStatementItem] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');
  const [statementDetails, setStatementDetails] = useState(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target)) {
        setIsMonthDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [quizData, setQuizData] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [quizSelections, setQuizSelections] = useState({});

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingNoteId, setEditingNoteId] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

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

  useEffect(() => {
    if (!statementItem) return;
    let cancelled = false;

    (async () => {
      const slug = String(statementItem?.ref || statementItem?.slug || '').trim();
      if (!slug) {
        setStatementDetails(null);
        setStatementError('No slug found for this item.');
        return;
      }

      setStatementLoading(true);
      setStatementError('');
      setStatementDetails(null);

      try {
        const json = await apiGet(`/api/catalog/leetcode/question/${encodeURIComponent(slug)}`);
        if (!cancelled) setStatementDetails(json);
      } catch (e) {
        if (!cancelled) setStatementError(e?.message || 'Failed to load problem statement');
      } finally {
        if (!cancelled) setStatementLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [statementItem]);

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
      const its = Array.isArray(m?.completed) ? m.completed : [];
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

    try {
      const status = await apiGet('/api/ai/status');
      setAiStatus(status);
      if (status?.configured === false) {
        setQuizError('GEMINI_API_KEY is not set on the server. Add it to the repo-root .env and restart the server.');
        return;
      }
      if (status?.looksValid === false) {
        setQuizError('GEMINI_API_KEY looks invalid. Update the key in the repo-root .env and restart the server.');
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
      setQuizError(e?.message || 'Failed to load quiz');
    } finally {
      setQuizLoading(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-100">Solved</h1>
        <p className="mt-2 text-slate-400">Login to view your solved questions.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-12 flex-1">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-12">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
              Solved <span className="text-amber-500">Question</span>
            </h1>
            <div className="flex items-center gap-3 text-slate-400">
              <p className="text-sm font-bold uppercase tracking-widest italic">Syncing Month-wise logs</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">History</div>
              
              <div className="relative" ref={monthDropdownRef}>
                <div 
                  onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}
                  className={`bg-[#05070a] border border-white/10 px-5 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-3 transition-all duration-200 w-full min-w-0 sm:w-auto sm:min-w-[200px] ${isMonthDropdownOpen ? 'rounded-t-[1.5rem] rounded-b-none border-amber-500 ring-1 ring-amber-500/30' : 'rounded-full hover:border-white/20'}`}
                >
                  <span className="font-medium text-white italic">
                    {monthGroups.find(g => g.key === selectedMonthKey)?.label || 'Select Month'}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isMonthDropdownOpen ? 'rotate-180 text-amber-500' : 'text-slate-500'}`} />
                </div>

                {isMonthDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 z-[100] mt-0 max-h-[300px] overflow-y-auto rounded-b-[1.5rem] border border-t-0 border-amber-500 bg-[#05070a] shadow-[0_30px_90px_rgba(0,0,0,0.7)] dsa-scroll">
                    {monthGroups.map((g) => (
                      <div 
                        key={g.key}
                        className={`px-5 py-3 text-sm cursor-pointer transition-colors hover:bg-amber-500/10 hover:text-white ${selectedMonthKey === g.key ? 'bg-amber-500/5 text-amber-500 font-bold' : 'text-slate-400'}`}
                        onClick={() => {
                          setSelectedMonthKey(g.key);
                          setIsMonthDropdownOpen(false);
                        }}
                      >
                        {g.label || g.key}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              className="group inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-amber-500 hover:border-amber-500 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
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
              {syncing ? (
                <LoadingIndicator label="" size="sm" className="flex-row gap-0" />
              ) : (
                <RefreshCcw className="h-4 w-4 transition-transform group-hover:rotate-180" />
              )}
              Refresh
            </button>
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-emerald-400">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm font-bold text-rose-400">
            {error}
          </div>
        )}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-400">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Total Solved</span>
              <span className="text-xl font-bold text-white">{total}</span>
            </div>
          </div>
          <div className="font-bold text-amber-500/80 tracking-widest uppercase text-[10px]">
            {syncing ? 'Syncing from LeetCode...' : 'Logs updated'}
          </div>
        </div>

        {loading ? (
          <div className="py-20 opacity-80">
            <LoadingIndicator label="Loading solved questions..." size="lg" />
          </div>
        ) : (
          <div className="space-y-12">
            {!visibleGroups.length ? (
              <div className="rounded-3xl border border-dashed border-white/10 p-10 sm:p-20 text-center">
                <div className="text-slate-500 font-bold italic">No solved questions found for this period.</div>
              </div>
            ) : (
              visibleGroups.map((group) => {
                const totalPages = Math.max(1, Math.ceil(group.items.length / PAGE_SIZE));
                const rawPage = Number(pageByMonthKey[group.key] || 1);
                const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, rawPage), totalPages) : 1;
                const start = (page - 1) * PAGE_SIZE;
                const end = start + PAGE_SIZE;
                const pageItems = totalPages > 1 ? group.items.slice(start, end) : group.items;

                return (
                  <div key={group.key} className="space-y-6">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <h2 className="text-2xl font-black text-white">{group.label || group.key}</h2>
                      <span className="rounded-full bg-white/5 px-4 py-1 text-xs font-bold text-slate-400 border border-white/10">
                        {group.items.length} questions
                      </span>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          disabled={page <= 1}
                          onClick={() => setPageByMonthKey((prev) => ({ ...prev, [group.key]: Math.max(1, page - 1) }))}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-400 border border-white/10 transition-all hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          &lt;
                        </button>
                        {Array.from({ length: totalPages }).map((_, idx) => {
                          const n = idx + 1;
                          const isActive = n === page;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setPageByMonthKey((prev) => ({ ...prev, [group.key]: n }))}
                              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all text-sm font-bold ${
                                isActive ? 'bg-amber-500 border-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          disabled={page >= totalPages}
                          onClick={() => setPageByMonthKey((prev) => ({ ...prev, [group.key]: Math.min(totalPages, page + 1) }))}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-400 border border-white/10 transition-all hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          &gt;
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {pageItems.map((it) => (
                        <div
                          key={String(it?._id || it?.questionKey || it?.ref)}
                          className="group relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#1C1C2E]/40 p-5 sm:p-6 backdrop-blur-xl transition-all duration-300 hover:border-amber-500/50 hover:bg-[#1C1C2E]/60"
                        >
                          {/* Shimmer Effect */}
                          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                          
                          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <button
                              type="button"
                              onClick={() =>
                                setStatementItem({
                                  title: it?.title || '',
                                  ref: it?.ref || it?.slug || '',
                                  solvedAt: it?.solvedAt || null,
                                  link: it?.link || '',
                                })
                              }
                              className="min-w-0 text-left focus:outline-none"
                              title="Open Problem Statement"
                            >
                              <div className="truncate text-lg font-black text-white group-hover:text-amber-500 transition-colors">
                                {it.title}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500/80">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3 w-3 text-amber-500/40" />
                                  <span>{formatIstDateTime(it.solvedAt).split(',')[0]}</span>
                                </div>
                                <div className="flex items-center gap-1.5 border-l border-white/5 pl-4">
                                  <Clock className="h-3 w-3 text-amber-500/40" />
                                  <span>{formatIstDateTime(it.solvedAt).split(',')[1]}</span>
                                </div>
                              </div>
                            </button>

                            <div className="flex shrink-0 items-center gap-2">
                              {it.link ? (
                                <a
                                  href={it.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-slate-400 transition-all hover:bg-white/10 hover:text-white border border-white/10"
                                  title="Open on LeetCode"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              ) : null}

                              <button
                                type="button"
                                onClick={() =>
                                  toggleStar({
                                    source: it.source,
                                    ref: it.ref,
                                    title: it.title,
                                    difficulty: it.difficulty || null,
                                    link: it.link || '',
                                  })
                                }
                                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-slate-400 transition-all hover:bg-white/10 hover:text-white border border-white/10"
                                title={isStarred(it.source, it.ref) ? 'Unstar' : 'Star'}
                              >
                                <i className={`${isStarred(it.source, it.ref) ? 'fas' : 'far'} fa-star ${isStarred(it.source, it.ref) ? 'text-amber-500' : ''}`} />
                              </button>

                              {!it?.kind ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const id = String(it?._id || '');
                                    if (!id) return;
                                    setEditingNoteId(id);
                                    setNoteDraft(String(it?.notes || ''));
                                    setMessage('');
                                    setError('');
                                  }}
                                  className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400 transition-all hover:bg-white/10 hover:text-white border border-white/10"
                                  title="Notes"
                                >
                                  Notes
                                </button>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => {
                                  setQuizItem({ title: it.title, ref: it.ref, solvedAt: it.solvedAt });
                                  setQuizError('');
                                  setQuizData(null);
                                  setAiStatus(null);
                                  setQuizSelections({});
                                  generateQuizFor(it);
                                }}
                                className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400 transition-all hover:bg-white/10 hover:text-white border border-white/10"
                              >
                                Quiz
                              </button>

                              <button
                                type="button"
                                onClick={() => setReviseItem({ title: it.title, ref: it.ref })}
                                className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-500 transition-all hover:bg-amber-500 hover:text-black border border-amber-500/20"
                              >
                                Revise
                              </button>
                            </div>
                          </div>

                          {!it?.kind && String(it?._id || '') && editingNoteId === String(it._id) ? (
                            <div className="relative mt-4 rounded-3xl border border-white/10 bg-black/20 p-4">
                              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Notes</div>
                              <textarea
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                rows={3}
                                maxLength={1000}
                                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-[#0b0f1a]/60 p-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500/40"
                                placeholder="Write a short note..."
                              />

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  {String(noteDraft || '').length}/1000
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNoteId('');
                                      setNoteDraft('');
                                    }}
                                    className="rounded-2xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={noteSaving}
                                    onClick={async () => {
                                      try {
                                        setNoteSaving(true);
                                        const id = String(it._id);
                                        const json = await apiPatch(`/api/solved/${encodeURIComponent(id)}/notes`, { notes: noteDraft });
                                        const next = json?.item;
                                        if (next) {
                                          setItems((prev) => (Array.isArray(prev) ? prev.map((x) => (String(x?._id) === id ? { ...x, notes: next.notes || '' } : x)) : []));
                                        }
                                        setEditingNoteId('');
                                        setNoteDraft('');
                                        setMessage('Notes saved');
                                      } catch (e) {
                                        setError(e?.message || 'Failed to save notes');
                                      } finally {
                                        setNoteSaving(false);
                                      }
                                    }}
                                    className="rounded-2xl bg-amber-500 px-4 py-2 text-xs font-black uppercase tracking-widest text-black hover:bg-amber-400 disabled:opacity-40"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {statementItem ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-20 sm:pt-24 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setStatementItem(null);
          }}
        >
          <div className="w-[min(980px,calc(100vw-2rem))]">
            <div className="dsa-scroll max-h-[85vh] overflow-y-auto rounded-[2.5rem] border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-10">
              <style>{`
                /* LeetCode statement HTML: prevent horizontal overflow/clipping */
                .leetcode-content {
                  overflow-wrap: anywhere;
                  word-break: break-word;
                }
                .leetcode-content pre,
                .leetcode-content code {
                  white-space: pre-wrap !important;
                  word-break: break-word;
                  overflow-x: hidden;
                }
                .leetcode-content img {
                  max-width: 100%;
                  height: auto;
                }
                .leetcode-content table {
                  width: 100%;
                  table-layout: fixed;
                }
                .leetcode-content th,
                .leetcode-content td {
                  word-break: break-word;
                }
              `}</style>

              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-6">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Problem</div>
                  <p className="mt-1 break-words text-xl font-semibold text-white">{statementItem.title || 'Untitled'}</p>
                </div>

                <div className="flex items-center gap-2">
                  {(() => {
                    const slug = encodeURIComponent(String(statementItem?.ref || statementItem?.slug || '').trim());
                    const href = String(statementItem?.link || '').trim() || (slug ? `https://leetcode.com/problems/${slug}/` : '');
                    return href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                      >
                        View Problem
                      </a>
                    ) : null;
                  })()}

                  <button
                    type="button"
                    onClick={() => setStatementItem(null)}
                    className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Problem Information</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="text-sm text-slate-200">
                      <span className="text-slate-400">Source:</span>{' '}
                      <span className="font-semibold text-white">LeetCode</span>
                    </div>
                    <div className="text-sm text-slate-200">
                      <span className="text-slate-400">Slug:</span>{' '}
                      <span className="break-words font-semibold text-white">{String(statementItem?.ref || statementItem?.slug || '').trim() || '—'}</span>
                    </div>
                    {statementItem?.solvedAt ? (
                      <div className="text-sm text-slate-200">
                        <span className="text-slate-400">Solved:</span>{' '}
                        <span className="font-semibold text-white">{formatIstDateTime(statementItem.solvedAt)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Problem Statement</p>

                  {statementLoading ? (
                    <div className="mt-2 text-sm text-slate-200/90">Loading details…</div>
                  ) : statementError ? (
                    <div className="mt-2 text-sm text-rose-200">{statementError}</div>
                  ) : statementDetails?.contentHtml ? (
                    <div
                      className="leetcode-content mt-3 text-sm text-slate-200/90"
                      // contentHtml is sanitized server-side
                      dangerouslySetInnerHTML={{ __html: statementDetails.contentHtml }}
                    />
                  ) : (
                    <div className="mt-2 text-sm text-slate-200/90">No statement available.</div>
                  )}
                </div>

                {!statementLoading && !statementError ? (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold text-white">Constraints</p>
                      {Array.isArray(statementDetails?.constraints) && statementDetails.constraints.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200/90">
                          {statementDetails.constraints.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-2 text-sm text-slate-200/90">No constraints found.</div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold text-white">Example Test Cases</p>
                      {statementDetails?.exampleTestcases ? (
                        <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-100">
                          {String(statementDetails.exampleTestcases).trim()}
                        </pre>
                      ) : (
                        <div className="mt-2 text-sm text-slate-200/90">No test cases available.</div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {quizItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setQuizItem(null);
            }
          }}
        >
          <div className="w-[min(980px,calc(100vw-2rem))]">
            <div className="dsa-scroll max-h-[85vh] overflow-y-auto rounded-[2.5rem] border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-10">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-6">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">AI Assessment</div>
                  <h2 className="mt-2 text-2xl font-black text-white">{quizItem.title}</h2>
                  <div className="mt-1 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-amber-500/40" />
                      <span>{formatIstDateTime(quizItem.solvedAt).split(',')[0]}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-amber-500/40" />
                      <span>{formatIstDateTime(quizItem.solvedAt).split(',')[1]}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-2xl bg-white/5 p-3 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
                  onClick={() => setQuizItem(null)}
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-8">
                {quizLoading && (
                  <div className="py-12 opacity-80">
                    <LoadingIndicator label="Loading quiz..." size="md" />
                  </div>
                )}
                
                {quizError && (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-center">
                    <div className="text-sm font-bold text-rose-400">{quizError}</div>
                  </div>
                )}

                {aiStatus?.configured === false && (
                  <div className="mb-6 rounded-xl bg-amber-500/10 p-4 border border-amber-500/20 text-xs font-bold text-amber-400">
                    AI CONFIG REQUIRED: Please set GEMINI_API_KEY in your environment.
                  </div>
                )}

                {!quizLoading && !quizError && (
                   <div className="flex justify-end mb-4">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                      onClick={() => generateQuizFor(quizItem)}
                    >
                      Reload
                    </button>
                   </div>
                )}

                {Array.isArray(quizData?.questions) && quizData.questions.length ? (
                  <div className="space-y-6">
                    {quizData.questions.map((q, idx) => (
                      <div key={idx} className="rounded-3xl border border-white/10 bg-white/5 p-6 transition-all hover:bg-white/[0.07]">
                        <div className="flex items-start justify-between gap-4">
                          <div className="text-lg font-bold text-white leading-snug">
                            <span className="text-amber-500 mr-2 text-sm">0{idx + 1}.</span> {q.question}
                          </div>
                          {q.category && (
                            <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                              {q.category}
                            </span>
                          )}
                        </div>

                        <div className="mt-6 grid gap-3">
                          {q.options.map((opt, oi) => {
                            const selectedIndex = quizSelections[idx];
                            const answered = selectedIndex !== undefined;
                            const isCorrect = oi === q.correctIndex;
                            const isSelected = oi === selectedIndex;

                            const cls = `group relative overflow-hidden rounded-2xl border px-6 py-4 text-left transition-all duration-300 ${
                              answered
                                ? isCorrect
                                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100'
                                  : isSelected
                                    ? 'border-rose-500/50 bg-rose-500/10 text-rose-100'
                                    : 'border-white/5 bg-black/40 text-slate-400 opacity-50'
                                : 'cursor-pointer border-white/10 bg-black/40 text-slate-300 hover:border-amber-500/50 hover:bg-black/60 hover:text-white'
                            }`;

                            return (
                              <button key={oi} type="button" className={cls} disabled={answered} onClick={() => {
                                if (!answered) setQuizSelections(prev => ({ ...prev, [idx]: oi }));
                              }}>
                                <div className="relative flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black ring-1 transition-colors ${
                                      answered 
                                        ? isCorrect ? 'bg-emerald-500 text-black ring-emerald-500' : isSelected ? 'bg-rose-500 text-white ring-rose-500' : 'bg-white/5 text-slate-500 ring-white/10'
                                        : 'bg-white/5 text-slate-400 ring-white/10 group-hover:bg-amber-500 group-hover:text-black group-hover:ring-amber-500'
                                    }`}>
                                      {String.fromCharCode(65 + oi)}
                                    </span>
                                    <span className="text-sm font-bold tracking-tight">{opt}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {quizSelections[idx] !== undefined && (
                          <div className="mt-6 animate-in fade-in slide-in-from-top-2 duration-500">
                            <div className="rounded-2xl bg-white/5 p-5 border border-white/10">
                              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/80 mb-3">
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                                Perspective Analysis
                              </div>
                              <div className="text-sm font-bold text-white mb-2">
                                Correct Answer: {String.fromCharCode(65 + q.correctIndex)}. {q.options[q.correctIndex]}
                              </div>
                              {q.explanation && <p className="text-xs font-medium leading-relaxed text-slate-400">{q.explanation}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {reviseItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0b0f1a]/95 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="bg-amber-500 p-1 text-center text-[10px] font-black uppercase tracking-[0.3em] text-black">
              System Scheduler
            </div>
            <div className="p-8">
              <h2 className="text-xl font-black text-white">Add to <span className="text-amber-500">Revision</span></h2>
              <p className="mt-1 text-xs font-bold text-slate-500 uppercase tracking-widest">Select Target Window</p>
              
              <div className="mt-4 rounded-2xl bg-white/5 p-4 border border-white/10">
                <div className="truncate text-sm font-bold text-white italic">"{reviseItem.title}"</div>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-3">
                <button
                  type="button"
                  className="group flex flex-col items-center justify-center rounded-2xl bg-white/5 p-4 border border-white/10 transition-all hover:bg-amber-500 hover:border-amber-500"
                  onClick={async () => {
                    const it = reviseItem;
                    setReviseItem(null);
                    await reviseSolved(it, 'today');
                  }}
                >
                  <span className="text-sm font-black text-white group-hover:text-black uppercase tracking-widest">Daily</span>
                  <span className="mt-1 text-[10px] font-bold text-slate-500 group-hover:text-black/70">Execute Session Today</span>
                </button>
                <button
                  type="button"
                  className="group flex flex-col items-center justify-center rounded-2xl bg-white/5 p-4 border border-white/10 transition-all hover:bg-amber-500 hover:border-amber-500"
                  onClick={async () => {
                    const it = reviseItem;
                    setReviseItem(null);
                    await reviseSolved(it, 'week');
                  }}
                >
                  <span className="text-sm font-black text-white group-hover:text-black uppercase tracking-widest">Weekly</span>
                  <span className="mt-1 text-[10px] font-bold text-slate-500 group-hover:text-black/70">Schedule for Sunday</span>
                </button>
                <button
                  type="button"
                  className="group flex flex-col items-center justify-center rounded-2xl bg-white/5 p-4 border border-white/10 transition-all hover:bg-amber-500 hover:border-amber-500"
                  onClick={async () => {
                    const it = reviseItem;
                    setReviseItem(null);
                    await reviseSolved(it, 'month');
                  }}
                >
                  <span className="text-sm font-black text-white group-hover:text-black uppercase tracking-widest">Monthly</span>
                  <span className="mt-1 text-[10px] font-bold text-slate-500 group-hover:text-black/70">Archive for Review</span>
                </button>
              </div>

              <button
                type="button"
                className="mt-6 w-full py-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition-colors"
                onClick={() => setReviseItem(null)}
              >
                Dismiss Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
