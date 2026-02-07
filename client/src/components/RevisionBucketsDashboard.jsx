import { useEffect, useMemo, useState, useRef } from 'react';
import { CalendarClock, CheckSquare, ClipboardPlus, Code2, ExternalLink, RefreshCcw, ChevronDown } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet, apiPatch, apiPost } from '../lib/api.js';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeLeetCodeSlug(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  const m = s.match(/leetcode\.com\/problems\/([^/?#]+)/i) || s.match(/\/problems\/([^/?#]+)/i);
  if (m && m[1]) s = m[1];
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return s;
}

function difficultyBadge(difficulty) {
  const d = String(difficulty || '').toLowerCase();
  if (d === 'hard') return 'bg-rose-500/15 text-rose-300 ring-rose-500/30';
  if (d === 'medium') return 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30';
}

function safeTime(value) {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function isSameUtcDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

function startOfLocalDay(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function weekWindowStartFromDueAt(dueAt) {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const start = startOfLocalDay(due);
  if (!start) return null;
  // Due is Sunday end-of-day; window start is Monday 00:00 (6 days before).
  start.setDate(start.getDate() - 6);
  return start;
}

function sortMonthItems(items) {
  const copy = Array.isArray(items) ? [...items] : [];
  copy.sort((a, b) => {
    const aDoneAt = safeTime(a?.lastCompletedAt);
    const bDoneAt = safeTime(b?.lastCompletedAt);
    const aDone = Number.isFinite(aDoneAt);
    const bDone = Number.isFinite(bDoneAt);

    // Not-done items first; done items at the bottom.
    if (aDone !== bDone) return aDone ? 1 : -1;

    // For done items: older completions first, newest at the bottom.
    if (aDone && bDone && aDoneAt !== bDoneAt) return aDoneAt - bDoneAt;

    // For not-done items: keep a stable, predictable order by due date.
    const aDueAt = safeTime(a?.bucketDueAt);
    const bDueAt = safeTime(b?.bucketDueAt);
    if (Number.isFinite(aDueAt) && Number.isFinite(bDueAt) && aDueAt !== bDueAt) return aDueAt - bDueAt;

    const aTitle = String(a?.title || a?.ref || '');
    const bTitle = String(b?.title || b?.ref || '');
    return aTitle.localeCompare(bTitle);
  });
  return copy;
}

function BucketHeader({ title, subtitle, icon: Icon }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-amber-500 mb-0.5">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Tabs({ value, onChange, items }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`flex items-center gap-3 rounded-full px-6 py-3 text-sm font-bold transition-all duration-300 ${
            value === t.value
              ? 'bg-amber-500 text-black shadow-[0_10px_20px_-5px_rgba(245,158,11,0.4)] scale-105'
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          {t.label}
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
            value === t.value ? 'bg-black/20 text-black' : 'bg-white/10 text-slate-500'
          }`}>
            {t.count}
          </span>
        </button>
      ))}
    </div>
  );
}

function ItemRow({ 
  item, 
  onMove, 
  onCompleteWeek, 
  onCompleteToday, 
  onCompleteMonth,
  showMoveToMonth,
  isMoveToMonthChecked,
  onToggleMoveToMonth
}) {
  const title = item.title || item.ref;
  const link = item.link || (item.source === 'leetcode' ? `https://leetcode.com/problems/${item.ref}/` : '');
  const now = new Date();

  const canMoveToToday = item.bucket !== 'today';
  const canMoveToWeek = item.bucket !== 'week';
  const canMoveToMonth = item.bucket !== 'month';
  const submittedToday =
    item.bucket === 'today' &&
    String(item?.source || '').toLowerCase() === 'leetcode' &&
    item.leetcodeLastAcceptedAt &&
    isSameUtcDay(item.leetcodeLastAcceptedAt, now);
  const manuallyDoneToday = item.bucket === 'today' && item.lastCompletedAt && isSameUtcDay(item.lastCompletedAt, now);
  const todayDone = Boolean(submittedToday || manuallyDoneToday);

  const weekDone = (() => {
    if (item.bucket !== 'week') return false;
    if (!item.weekCompletedAt) return false;
    const windowStart = weekWindowStartFromDueAt(item.bucketDueAt);
    if (!windowStart) return true;
    return new Date(item.weekCompletedAt).getTime() >= windowStart.getTime();
  })();

  const monthDone = (() => {
    if (item.bucket !== 'month') return false;
    if (!item.monthCompletedAt) return false;
    const mStart = startOfMonth(now);
    if (!mStart) return true;
    return new Date(item.monthCompletedAt).getTime() >= mStart.getTime();
  })();

  const showLeetCodeLastAccepted = String(item?.source || '').toLowerCase() === 'leetcode' && item.leetcodeLastAcceptedAt;

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-white/5 bg-[#1C1C2E]/40 p-7 transition-all duration-500 hover:bg-[#1C1C2E] hover:border-amber-500/50 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)]">
      {/* Glass Reflection Effect */}
      <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg]"></div>
      
      {/* Premium Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="truncate text-lg font-bold text-white/90 transition-colors group-hover:text-amber-500">
                {title}
              </h3>
              {item.difficulty ? (
                <span className={`shrink-0 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ${
                  item.difficulty === 'Easy' ? 'bg-emerald-500/20 text-emerald-400' :
                  item.difficulty === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-rose-500/20 text-rose-400'
                }`}>
                  {item.difficulty}
                </span>
              ) : null}
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                {item.source}:{item.ref}
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-800"></span>
                {item.bucket === 'month' ? 'Next' : 'Due'}: {formatDate(item.bucketDueAt)}
              </div>
            </div>

            <div className="space-y-1.5 opacity-60 transition-opacity group-hover:opacity-100">
              {item.lastCompletedAt ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <CheckSquare className="h-3 w-3" />
                  Done: {formatDate(item.lastCompletedAt)}
                </div>
              ) : null}
              {showLeetCodeLastAccepted ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <RefreshCcw className="h-3 w-3" />
                  Last submitted: {formatDateTime(item.leetcodeLastAcceptedAt)}
                </div>
              ) : null}
            </div>
          </div>

          {link ? (
            <a
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-all hover:bg-amber-500 hover:text-black hover:border-amber-500 hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]"
              href={link}
              target="_blank"
              rel="noreferrer"
              title="Open Problem"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {canMoveToToday ? (
              <button
                type="button"
                className="rounded-full bg-white/5 px-4 py-1.5 text-[11px] font-bold text-slate-400 transition-all hover:bg-white/10 hover:text-white border border-white/5"
                onClick={() => onMove(item._id, 'today')}
              >
                Move Today
              </button>
            ) : null}
            {canMoveToWeek ? (
              <button
                type="button"
                className="rounded-full bg-white/5 px-4 py-1.5 text-[11px] font-bold text-slate-400 transition-all hover:bg-white/10 hover:text-white border border-white/5"
                onClick={() => onMove(item._id, 'week')}
              >
                Move Week
              </button>
            ) : null}
            {canMoveToMonth ? (
              <button
                type="button"
                className="rounded-full bg-white/5 px-4 py-1.5 text-[11px] font-bold text-slate-400 transition-all hover:bg-white/10 hover:text-white border border-white/5"
                onClick={() => onMove(item._id, 'month')}
              >
                Move Month
              </button>
            ) : null}
          </div>

          {(item.bucket === 'week' || item.bucket === 'today' || item.bucket === 'month') ? (
            <div className="flex flex-wrap items-center gap-4">
              {showMoveToMonth && (
                <label className="flex items-center gap-2 rounded-xl bg-amber-500/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-amber-500 border border-amber-500/10 transition-all hover:bg-amber-500/20 hover:border-amber-500/30 cursor-pointer shadow-lg shadow-amber-500/5 group/toggle">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-amber-500/20 bg-black/20 text-amber-500 focus:ring-amber-500/30 transition-all cursor-pointer"
                    checked={Boolean(isMoveToMonthChecked)}
                    onChange={(e) => onToggleMoveToMonth(e.target.checked)}
                  />
                  Move to Month
                </label>
              )}
              <button
                type="button"
                disabled={(item.bucket === 'week' && weekDone) || (item.bucket === 'today' && todayDone) || (item.bucket === 'month' && monthDone)}
                className={`inline-flex items-center gap-2 rounded-full px-6 py-2 text-xs font-bold transition-all ${
                  (item.bucket === 'week' && weekDone) || (item.bucket === 'today' && todayDone) || (item.bucket === 'month' && monthDone)
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 opacity-60'
                    : 'bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500 hover:text-black active:scale-95 shadow-lg shadow-amber-500/20'
                }`}
                onClick={() => {
                  if (item.bucket === 'week' && !weekDone) onCompleteWeek(item);
                  if (item.bucket === 'today' && !todayDone) onCompleteToday(item);
                  if (item.bucket === 'month' && !monthDone) onCompleteMonth(item);
                }}
              >
                <CheckSquare className="h-4 w-4" />
                {(item.bucket === 'week' && weekDone) || (item.bucket === 'today' && todayDone) || (item.bucket === 'month' && monthDone) ? 'Completed' : 'Complete'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function RevisionBucketsDashboard() {
  const { isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [today, setToday] = useState([]);
  const [week, setWeek] = useState([]);
  const [month, setMonth] = useState([]);

  const [slug, setSlug] = useState('');
  const [bucket, setBucket] = useState('today');
  const [message, setMessage] = useState('');

  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);

  const [activeTab, setActiveTab] = useState('today');
  const [easyMoveToMonthById, setEasyMoveToMonthById] = useState({});

  const [confirmDone, setConfirmDone] = useState(null); // { scope: 'week'|'today'|'month', item }
  const [confirmDoneSubmitting, setConfirmDoneSubmitting] = useState(false);

  const [isWhenDropdownOpen, setIsWhenDropdownOpen] = useState(false);
  const whenDropdownRef = useRef(null);

  const total = useMemo(() => today.length + week.length + month.length, [today.length, week.length, month.length]);

  async function loadSummary() {
    setError('');
    const json = await apiGet('/api/revision/summary');
    setToday(json.today || []);
    setWeek(json.week || []);
    setMonth(sortMonthItems(json.month || []));
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (whenDropdownRef.current && !whenDropdownRef.current.contains(event.target)) {
        setIsWhenDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setMessage('');
        if (!isLoggedIn) {
          setToday([]);
          setWeek([]);
          setMonth([]);
          return;
        }
        await loadSummary();
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load revision items');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    let cancelled = false;
    const q = normalizeLeetCodeSlug(slug);

    if (!isLoggedIn) {
      setSuggestions([]);
      setSuggestError('');
      setSuggestLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!q || q.length < 1) {
      setSuggestions([]);
      setSuggestError('');
      setSuggestLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const handle = setTimeout(() => {
      (async () => {
        try {
          setSuggestLoading(true);
          setSuggestError('');
          const json = await apiGet(`/api/catalog/leetcode/suggest?search=${encodeURIComponent(q)}&limit=10`);
          if (!cancelled) {
            setSuggestions(Array.isArray(json?.items) ? json.items : []);
          }
        } catch (e) {
          if (!cancelled) {
            setSuggestions([]);
            setSuggestError(e?.message || 'Failed to load suggestions');
          }
        } finally {
          if (!cancelled) setSuggestLoading(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [slug, isLoggedIn]);

  async function handleAddFromLeetCode(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    const cleanSlug = normalizeLeetCodeSlug(slug);
    if (!cleanSlug) return;

    try {
      const res = await apiPost('/api/revision/from-leetcode', { slug: cleanSlug, bucket });
      if (res.duplicate) {
        setMessage('Already added (no duplicates).');
      } else {
        setMessage('Added to revision.');
      }
      setSlug('');
      await loadSummary();
    } catch (e2) {
      setError(e2?.message || 'Failed to add question. Try a slug like "two-sum" or paste the LeetCode problem URL.');
    }
  }

  async function moveItem(id, toBucket) {
    setError('');
    setMessage('');
    try {
      await apiPatch(`/api/revision/items/${id}/move`, { bucket: toBucket });
      await loadSummary();
    } catch (e) {
      setError(e?.message || 'Failed to move item');
    }
  }

  async function completeWeek(item) {
    setConfirmDone({ scope: 'week', item });
  }

  async function completeToday(item) {
    setConfirmDone({ scope: 'today', item });
  }

  async function completeMonth(item) {
    setConfirmDone({ scope: 'month', item });
  }

  useEffect(() => {
    if (!confirmDone) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') setConfirmDone(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmDone]);

  async function submitConfirmDone() {
    const scope = confirmDone?.scope;
    const item = confirmDone?.item;
    const id = item?._id;
    if (!scope || !id) return;

    setError('');
    setMessage('');
    setConfirmDoneSubmitting(true);

    let ok = false;
    try {
      if (scope === 'week') {
        const isEasy = String(item.difficulty || '').toLowerCase() === 'easy' || !item.difficulty;
        const moveEasyToMonth = isEasy ? Boolean(easyMoveToMonthById[id]) : false;
        const res = await apiPost(`/api/revision/items/${id}/complete`, { scope: 'week', moveEasyToMonth });

        if (res?.movedToMonth) setMessage('Moved to Month.');
        else setMessage('Weekly marked done.');

        if (isEasy) {
          setEasyMoveToMonthById((prev) => ({ ...prev, [id]: false }));
        }
      } else {
        await apiPost(`/api/revision/items/${id}/complete`, { scope });
        if (scope === 'today') setMessage('Marked done for today.');
        else setMessage('Monthly marked done.');
      }

      ok = true;
      await loadSummary();
    } catch (e) {
      if (scope === 'week') setError(e?.message || 'Failed to mark weekly done');
      else if (scope === 'today') setError(e?.message || 'Failed to mark done');
      else setError(e?.message || 'Failed to mark month done');
    } finally {
      setConfirmDoneSubmitting(false);
      if (ok) setConfirmDone(null);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-12 flex-1">
      {confirmDone ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !confirmDoneSubmitting) setConfirmDone(null);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0d0e14] p-8 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.8)]">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <CheckSquare className="h-7 w-7" />
            </div>
            <h3 className="text-2xl font-bold text-white">Mark as completed?</h3>
            <p className="mt-2 text-slate-400">
              {confirmDone?.item?.title || confirmDone?.item?.ref || 'This question'}
            </p>

            {confirmDone?.scope === 'week' ? (
              <div className="mt-4 rounded-xl bg-orange-500/10 p-3 text-xs text-orange-300 border border-orange-500/20">
                Weekly revision: Medium/Hard questions will move to Month automatically.
              </div>
            ) : null}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-4 text-sm font-bold text-slate-200 transition-all hover:bg-white/10 disabled:opacity-50"
                disabled={confirmDoneSubmitting}
                onClick={() => setConfirmDone(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-2xl bg-amber-500 py-4 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 disabled:opacity-50"
                disabled={confirmDoneSubmitting}
                onClick={submitConfirmDone}
              >
                {confirmDoneSubmitting ? 'Processing…' : 'Yes, Done'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-amber-500 mb-2">Revision</h1>
        </div>

        <button
          type="button"
          className="group inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-amber-500 hover:border-amber-500 hover:text-black hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
          onClick={async () => {
            setLoading(true);
            try {
              await loadSummary();
            } finally {
              setLoading(false);
            }
          }}
        >
          <RefreshCcw className="h-4 w-4 transition-transform group-hover:rotate-180 duration-500" />
          Sync Progress
        </button>
      </div>

      <div className="relative mb-12 rounded-[2.5rem] border border-white/5 bg-[#1C1C2E]/30 p-8 backdrop-blur-sm">
        <div className="absolute top-0 right-0 p-8 opacity-5">
            <ClipboardPlus className="h-24 w-24 text-white" />
        </div>

        <form onSubmit={handleAddFromLeetCode} className="relative z-10 font-sans">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <div className="md:col-span-7 relative">
              <label className="block text-xs font-black uppercase tracking-widest text-amber-500 mb-2 px-1 text-[10px]">LeetCode Problem</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <Code2 className="h-5 w-5" />
                </div>
                <input
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setShowSuggest(true);
                  }}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => {
                    setTimeout(() => setShowSuggest(false), 200);
                  }}
                  placeholder="Paste URL or slug (e.g. two-sum)"
                  className="w-full rounded-2xl border border-white/10 bg-[#05070a] py-4 pl-12 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-bold"
                />
              </div>

              {showSuggest && (suggestions.length > 0 || suggestLoading) && (
                <div className="absolute z-[100] left-0 right-0 mt-3 overflow-hidden rounded-[2rem] border border-white/10 bg-[#05070a] shadow-[0_30px_90px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                  {suggestLoading && (
                      <div className="px-4 py-3 text-xs text-slate-400 border-b border-white/5 italic">Searching Problemset...</div>
                  )}
                  <div className="max-h-72 overflow-y-auto custom-scrollbar p-2">
                    {suggestions.map((s) => (
                      <button
                        key={s.slug}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSlug(s.slug);
                          setShowSuggest(false);
                        }}
                        className="group flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition-all hover:bg-amber-500/10"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-bold text-slate-200 group-hover:text-amber-500 transition-colors">
                            {s.id ? `${s.id}. ` : ''}{s.title}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400">{s.slug}</div>
                        </div>
                        {s.difficulty ? (
                          <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            s.difficulty === 'Easy' ? 'bg-emerald-500/20 text-emerald-400' :
                            s.difficulty === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-rose-500/20 text-rose-400'
                          }`}>
                            {s.difficulty}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-black uppercase tracking-widest text-amber-500 mb-2 px-1 text-[10px]">Target When</label>
              <div className="relative" ref={whenDropdownRef}>
                <div 
                  onClick={() => setIsWhenDropdownOpen(!isWhenDropdownOpen)}
                  className={`bg-[#05070a] border border-white/10 px-5 py-4 text-sm cursor-pointer flex items-center justify-between gap-3 transition-all duration-200 ${isWhenDropdownOpen ? 'rounded-t-[1.5rem] rounded-b-none border-amber-500 ring-1 ring-amber-500/30' : 'rounded-2xl hover:border-white/20'}`}
                >
                  <span className="font-bold text-white italic capitalize">
                    {bucket === 'today' ? 'Daily' : bucket === 'week' ? 'Weekly' : 'Monthly'}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isWhenDropdownOpen ? 'rotate-180 text-amber-500' : 'text-slate-500'}`} />
                </div>

                {isWhenDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 z-[100] mt-0 overflow-hidden rounded-b-[1.5rem] border border-t-0 border-amber-500 bg-[#05070a] shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
                    {[
                      { value: 'today', label: 'Daily' },
                      { value: 'week', label: 'Weekly' },
                      { value: 'month', label: 'Monthly' }
                    ].map((opt) => (
                      <div 
                        key={opt.value}
                        className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors hover:bg-amber-500/10 hover:text-white ${bucket === opt.value ? 'bg-amber-500/5 text-amber-500' : 'text-slate-400'}`}
                        onClick={() => {
                          setBucket(opt.value);
                          setIsWhenDropdownOpen(false);
                        }}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 text-sm font-black uppercase tracking-widest text-black shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 hover:scale-[1.02] active:scale-[0.98]"
              >
                <ClipboardPlus className="h-5 w-5" />
                Add
              </button>
            </div>
          </div>

          {message ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-bold text-emerald-400 animate-in fade-in slide-in-from-top-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400"></div>
                  {message}
              </div>
          ) : null}
          {error ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs font-bold text-rose-400 animate-in fade-in slide-in-from-top-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-rose-400"></div>
                  {error}
              </div>
          ) : null}
        </form>
      </div>

      <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Active Queue Analysis</div>
          <div className="text-xs font-bold text-slate-400 bg-white/5 py-1 px-3 rounded-full border border-white/10">Total Items: {total}</div>
      </div>

      {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-4 opacity-60">
              <RefreshCcw className="h-10 w-10 animate-spin text-amber-500" />
              <p className="text-sm font-bold tracking-widest uppercase text-slate-500">Analyzing Buckets...</p>
          </div>
      )}

      {!loading && (
        <>
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { value: 'today', label: 'Today', count: today.length },
              { value: 'week', label: 'Upcoming Sunday', count: week.length },
              { value: 'month', label: 'Month', count: month.length },
            ]}
          />

          <div className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {activeTab === 'today' && (
              <>
                <BucketHeader 
                    title="Daily Tasks" 
                    subtitle="Critical items requiring immediate revision. Resets daily at 5:30 AM IST." 
                    icon={CalendarClock}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {today.map((item) => (
                    <ItemRow
                      key={item._id}
                      item={item}
                      onMove={moveItem}
                      onCompleteWeek={completeWeek}
                      onCompleteToday={completeToday}
                      onCompleteMonth={completeMonth}
                    />
                  ))}
                </div>
                {!today.length ? (
                    <div className="py-20 text-center rounded-[2.5rem] border-2 border-dashed border-white/5">
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">All questions revised for today! 🎉</p>
                    </div>
                ) : null}
              </>
            )}

            {activeTab === 'week' && (
              <>
                <BucketHeader 
                    title="Weekend Cycle" 
                    subtitle="Upcoming Sunday revisions. Medium/Hard auto-elevate to Monthly bucket." 
                    icon={RefreshCcw}
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {week.map((item) => {
                    const isEasy = String(item.difficulty || '').toLowerCase() === 'easy' || !item.difficulty;
                    return (
                      <ItemRow
                        key={item._id}
                        item={item}
                        onMove={moveItem}
                        onCompleteWeek={completeWeek}
                        onCompleteToday={completeToday}
                        onCompleteMonth={completeMonth}
                        showMoveToMonth={isEasy}
                        isMoveToMonthChecked={Boolean(easyMoveToMonthById[item._id])}
                        onToggleMoveToMonth={(val) =>
                          setEasyMoveToMonthById((prev) => ({ ...prev, [item._id]: val }))
                        }
                      />
                    );
                  })}
                </div>
                {!week.length ? (
                    <div className="py-20 text-center rounded-[2.5rem] border-2 border-dashed border-white/5">
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No items queued for Sunday revision.</p>
                    </div>
                ) : null}
              </>
            )}

            {activeTab === 'month' && (
              <>
                <BucketHeader 
                    title="Deep Memory" 
                    subtitle="Long-term retention cycle. Items show up once a month." 
                    icon={CalendarClock}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {month.map((item) => (
                    <ItemRow
                      key={item._id}
                      item={item}
                      onMove={moveItem}
                      onCompleteWeek={completeWeek}
                      onCompleteToday={completeToday}
                      onCompleteMonth={completeMonth}
                    />
                  ))}
                </div>
                {!month.length ? (
                    <div className="py-20 text-center rounded-[2.5rem] border-2 border-dashed border-white/5">
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Monthly bucket is currently empty.</p>
                    </div>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-16 rounded-[2rem] border border-white/5 bg-[#1C1C2E]/20 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <CheckSquare className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white">System Protocols</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex gap-4">
                  <div className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-slate-400 border border-white/10">01</div>
                  <div>
                      <h5 className="text-xs font-bold text-slate-200 mb-1">Deduplication</h5>
                      <p className="text-xs text-slate-500 leading-relaxed">System ensures unique entries per user profile to prevent revision clutter.</p>
                  </div>
              </div>
              <div className="flex gap-4">
                  <div className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-slate-400 border border-white/10">02</div>
                  <div>
                      <h5 className="text-xs font-bold text-slate-200 mb-1">Auto-Elevation</h5>
                      <p className="text-xs text-slate-500 leading-relaxed">Medium and Hard problems automatically advance to the Deep Memory bucket upon weekly completion.</p>
                  </div>
              </div>
              <div className="flex gap-4">
                  <div className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-slate-400 border border-white/10">03</div>
                  <div>
                      <h5 className="text-xs font-bold text-slate-200 mb-1">Manual Upgrade</h5>
                      <p className="text-xs text-slate-500 leading-relaxed">Easy questions can be manually promoted to the Monthly cycle via the post-completion protocol.</p>
                  </div>
              </div>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
