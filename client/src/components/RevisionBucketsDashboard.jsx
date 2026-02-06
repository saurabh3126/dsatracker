import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckSquare, ClipboardPlus, ExternalLink, RefreshCcw } from 'lucide-react';
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

function isSameLocalDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
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

function BucketHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      </div>
      {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
    </div>
  );
}

function Tabs({ value, onChange, items }) {
  return (
    <div className="mt-6 inline-flex w-full flex-wrap gap-2 rounded-2xl border border-white/10 bg-slate-900/40 p-2">
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={
            value === t.value
              ? 'rounded-xl bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-100 ring-1 ring-indigo-500/30'
              : 'rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-white/10'
          }
        >
          {t.label}
          <span className="ml-2 rounded-full bg-black/30 px-2 py-0.5 text-xs text-slate-200 ring-1 ring-white/10">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

function ItemRow({ item, onMove, onCompleteWeek, onCompleteToday, onCompleteMonth }) {
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
    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold text-slate-100">{title}</div>
            {item.difficulty ? (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${difficultyBadge(item.difficulty)}`}>
                {item.difficulty}
              </span>
            ) : null}
            <span className="text-xs text-slate-500">{item.source}:{item.ref}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {item.bucket === 'month' ? 'Next revision on' : 'Due'}:{' '}
            <span className="text-slate-200">{formatDate(item.bucketDueAt)}</span>
            {item.lastCompletedAt ? (
              <>
                <span className="mx-2 text-slate-500">|</span>
                Done: <span className="text-slate-200">{formatDate(item.lastCompletedAt)}</span>
              </>
            ) : null}
            {showLeetCodeLastAccepted ? (
              <>
                <span className="mx-2 text-slate-500">|</span>
                Last submitted at: <span className="text-slate-200">{formatDateTime(item.leetcodeLastAcceptedAt)}</span>
              </>
            ) : null}
          </div>
        </div>

        {link ? (
          <a
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
            href={link}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canMoveToToday ? (
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
            onClick={() => onMove(item._id, 'today')}
          >
            Today
          </button>
        ) : null}
        {canMoveToWeek ? (
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
            onClick={() => onMove(item._id, 'week')}
          >
            Week
          </button>
        ) : null}
        {canMoveToMonth ? (
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
            onClick={() => onMove(item._id, 'month')}
          >
            Month
          </button>
        ) : null}

        {item.bucket === 'week' ? (
          <button
            type="button"
            disabled={weekDone}
            className={
              'ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ring-1 ' +
              (weekDone
                ? 'cursor-not-allowed bg-emerald-500/30 text-emerald-100 ring-emerald-500/40'
                : 'bg-rose-500/20 text-rose-200 ring-rose-500/30 hover:bg-rose-500/25')
            }
            onClick={() => (weekDone ? null : onCompleteWeek(item))}
            title="Mark weekly revision done"
          >
            Done
          </button>
        ) : null}

        {item.bucket === 'today' ? (
          <button
            type="button"
            disabled={todayDone}
            className={
              'ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ring-1 ' +
              (todayDone
                ? 'cursor-not-allowed bg-emerald-500/30 text-emerald-100 ring-emerald-500/40'
                : 'bg-rose-500/20 text-rose-200 ring-rose-500/30 hover:bg-rose-500/25')
            }
            onClick={() => (todayDone ? null : onCompleteToday(item))}
          >
            Done
          </button>
        ) : null}

        {item.bucket === 'month' ? (
          <button
            type="button"
            disabled={monthDone}
            className={
              'ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ring-1 ' +
              (monthDone
                ? 'cursor-not-allowed bg-emerald-500/30 text-emerald-100 ring-emerald-500/40'
                : 'bg-rose-500/20 text-rose-200 ring-rose-500/30 hover:bg-rose-500/25')
            }
            onClick={() => (monthDone ? null : onCompleteMonth(item))}
          >
            Done
          </button>
        ) : null}
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

  const total = useMemo(() => today.length + week.length + month.length, [today.length, week.length, month.length]);

  async function loadSummary() {
    setError('');
    const json = await apiGet('/api/revision/summary');
    setToday(json.today || []);
    setWeek(json.week || []);
    setMonth(sortMonthItems(json.month || []));
  }

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

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-100">Revision</h1>
        <p className="mt-2 text-slate-400">Login to use your personal revision buckets.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {confirmDone ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !confirmDoneSubmitting) setConfirmDone(null);
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="text-base font-semibold text-slate-100">Mark done?</div>
            <div className="mt-1 text-sm text-slate-300">
              {confirmDone?.item?.title || confirmDone?.item?.ref || 'This question'}
            </div>

            {confirmDone?.scope === 'week' ? (
              <div className="mt-3 text-xs text-slate-400">
                Weekly done: Medium/Hard moves to Month automatically. Easy uses the checkbox next to the item.
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
                disabled={confirmDoneSubmitting}
                onClick={() => setConfirmDone(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-100 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 disabled:opacity-50"
                disabled={confirmDoneSubmitting}
                onClick={submitConfirmDone}
              >
                {confirmDoneSubmitting ? 'Marking…' : 'Mark done'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Revision Buckets</h1>
          <p className="mt-1 text-sm text-slate-400">Today • Upcoming Sunday • Month (no repeated questions)</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            onClick={async () => {
              setLoading(true);
              try {
                await loadSummary();
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

      <form onSubmit={handleAddFromLeetCode} className="mt-6 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <label className="block text-xs font-semibold text-slate-300">Add LeetCode slug</label>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setShowSuggest(true);
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => {
                // Give click events a chance to fire.
                setTimeout(() => setShowSuggest(false), 150);
              }}
              placeholder="e.g. two-sum or https://leetcode.com/problems/two-sum/"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />

            {showSuggest ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-xl">
                <div className="px-3 py-2 text-xs text-slate-400">
                  {suggestLoading ? 'Loading suggestions…' : suggestError ? suggestError : 'Suggestions'}
                </div>
                <div className="max-h-64 overflow-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.slug}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSlug(s.slug);
                        setShowSuggest(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {s.id ? `${s.id}. ` : ''}{s.title}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-400">{s.slug}</div>
                      </div>
                      {s.difficulty ? (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ring-1 ${difficultyBadge(s.difficulty)}`}>
                          {s.difficulty}
                        </span>
                      ) : null}
                    </button>
                  ))}
                  {!suggestions.length && !suggestLoading && !suggestError ? (
                    <div className="px-3 py-3 text-sm text-slate-400">No matches</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300">Bucket</label>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              <option value="today">Today</option>
              <option value="week">Upcoming Sunday</option>
              <option value="month">Month</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-200 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25"
          >
            <ClipboardPlus className="h-4 w-4" />
            Add
          </button>
        </div>

        {message ? <div className="mt-3 text-sm text-emerald-300">{message}</div> : null}
        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
      </form>

      <div className="mt-4 text-sm text-slate-400">Total: {total}</div>

      {loading ? <div className="mt-6 text-slate-300">Loading…</div> : null}

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'today', label: 'Today', count: today.length },
          { value: 'week', label: 'Upcoming Sunday', count: week.length },
          { value: 'month', label: 'Month', count: month.length },
        ]}
      />

      <div className="mt-6">
        {activeTab === 'today' ? (
          <>
            <BucketHeader title="Today" subtitle="Must revise today items. Completing schedules for tomorrow." />
            <div className="space-y-3">
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
              {!today.length ? <div className="text-sm text-slate-500">No items</div> : null}
            </div>
          </>
        ) : null}

        {activeTab === 'week' ? (
          <>
            <BucketHeader title="Upcoming Sunday" subtitle="Weekly revision. Medium/Hard auto-move to Month when done." />
            <div className="mb-3 rounded-xl border border-white/10 bg-slate-900/40 p-3 text-sm text-slate-300">
              <div className="font-semibold text-slate-100">Easy checkbox</div>
              <div className="mt-1 text-slate-400">For Easy questions, tick “Move to Month” before clicking Weekly done.</div>
            </div>
            <div className="space-y-3">
              {week.map((item) => {
                const isEasy = String(item.difficulty || '').toLowerCase() === 'easy' || !item.difficulty;
                return (
                  <div key={item._id} className="space-y-2">
                    {isEasy ? (
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(easyMoveToMonthById[item._id])}
                          onChange={(e) =>
                            setEasyMoveToMonthById((prev) => ({ ...prev, [item._id]: e.target.checked }))
                          }
                        />
                        Move to Month after Weekly done
                      </label>
                    ) : null}
                    <ItemRow
                      item={item}
                      onMove={moveItem}
                      onCompleteWeek={completeWeek}
                      onCompleteToday={completeToday}
                      onCompleteMonth={completeMonth}
                    />
                  </div>
                );
              })}
              {!week.length ? <div className="text-sm text-slate-500">No items</div> : null}
            </div>
          </>
        ) : null}

        {activeTab === 'month' ? (
          <>
            <BucketHeader title="Month" subtitle="Monthly revision. Completing schedules next month." />
            <div className="space-y-3">
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
              {!month.length ? <div className="text-sm text-slate-500">No items</div> : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-8 rounded-xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-300">
        <div className="flex items-center gap-2 font-semibold text-slate-100">
          <CheckSquare className="h-4 w-4" />
          Rules
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
          <li>No duplicates: the same question can only be added once per user.</li>
          <li>Week done: Medium/Hard moves to Month automatically.</li>
          <li>Week done: Easy asks whether to move to Month.</li>
        </ul>
      </div>
    </div>
  );
}
