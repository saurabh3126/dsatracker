import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  RefreshCcw,
  Flame,
  Gauge,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import LoadingIndicator from './LoadingIndicator.jsx';

function difficultyMeta(difficulty) {
  const d = String(difficulty || '').toLowerCase();
  if (d === 'hard') {
    return { label: 'Hard', icon: Flame, badge: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' };
  }
  if (d === 'medium') {
    return { label: 'Medium', icon: Gauge, badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' };
  }
  return { label: 'Easy', icon: Sparkles, badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' };
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function LeetCodeRevisionDashboard() {
  const [username, setUsername] = useState(import.meta.env.VITE_LEETCODE_USERNAME || '');
  const { token, isLoggedIn } = useAuth();
  const isAuthed = isLoggedIn && Boolean(token);
  const authHeaders = useMemo(() => (isAuthed ? { Authorization: `Bearer ${token}` } : {}), [isAuthed, token]);

  const [potd, setPotd] = useState(null);
  const [potdSolved, setPotdSolved] = useState(false);
  const [potdReason, setPotdReason] = useState('');

  const [due, setDue] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [mode, setMode] = useState('due'); // 'due' | 'monthly'

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [error, setError] = useState('');

  const items = useMemo(() => (mode === 'monthly' ? monthly : due), [mode, monthly, due]);

  async function loadAll({ showSpinner } = { showSpinner: true }) {
    if (showSpinner) setLoading(true);
    setError('');

    const potdUrl = isAuthed
      ? '/api/leetcode/my/potd-status'
      : `/api/leetcode/potd-status${username ? `?username=${encodeURIComponent(username)}` : ''}`;
    const dueUrl = isAuthed ? '/api/leetcode/my/due' : '/api/leetcode/due';
    const monthlyUrl = isAuthed ? '/api/leetcode/my/questions?days=30' : '/api/leetcode/questions?days=30';

    const [potdStatusRes, dueRes, monthlyRes] = await Promise.all([
      fetch(potdUrl, { headers: authHeaders }),
      fetch(dueUrl, { headers: authHeaders }),
      fetch(monthlyUrl, { headers: authHeaders }),
    ]);

    const potdStatus = await potdStatusRes.json().catch(() => null);
    const dueJson = await dueRes.json().catch(() => null);
    const monthlyJson = await monthlyRes.json().catch(() => null);

    setPotd(potdStatus?.potd || null);
    setPotdSolved(Boolean(potdStatus?.solved));
    setPotdReason(potdStatus?.reason || '');

    if (!dueRes.ok) {
      setDue([]);
      setError(dueJson?.error || 'Failed to load revision window');
    } else {
      setDue(dueJson?.items || []);
    }

    if (!monthlyRes.ok) {
      setMonthly([]);
    } else {
      setMonthly(monthlyJson?.items || []);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setSyncMessage('');
        await loadAll({ showSpinner: true });
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Request failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, isAuthed, token]);

  async function syncNow() {
    setSyncing(true);
    setSyncMessage('Syncing recent accepted submissions…');
    setError('');

    try {
      if (!isAuthed && !username) {
        throw new Error('Set your LeetCode username first.');
      }

      const res = await fetch(
        isAuthed
          ? '/api/leetcode/my/sync?limit=20'
          : `/api/leetcode/sync?username=${encodeURIComponent(username)}&limit=20`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeaders },
          body: JSON.stringify({}),
        },
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || 'Sync failed');
      }

      setSyncMessage(`Synced ${json?.synced ?? 0} submissions.`);
      await loadAll({ showSpinner: false });
    } catch (e) {
      setError(e?.message || 'Sync failed');
      setSyncMessage('');
    } finally {
      setSyncing(false);
    }
  }

  const potdLink = potd?.link ? `https://leetcode.com${potd.link}` : 'https://leetcode.com/problemset/';
  const potdTitle = potd?.question?.title || 'Daily Challenge';

  return (
    <div className="min-h-screen text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-slate-400">LeetCode Revision Dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Practice → Review → Retain</h1>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {!isAuthed ? (
              <>
                <label className="text-xs text-slate-400">LeetCode Username (for POTD status)</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.trim())}
                  placeholder="your_username"
                  className="w-full rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-500 sm:w-72"
                />
              </>
            ) : (
              <div className="text-xs text-slate-400">Using your saved LeetCode username (account login)</div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing}
                className={
                  'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ring-1 ring-white/10 ' +
                  (syncing
                    ? 'cursor-not-allowed bg-white/5 text-slate-300'
                    : 'bg-slate-950/40 text-slate-100 hover:bg-slate-950/60')
                }
              >
                {syncing ? (
                  <LoadingIndicator label="" size="sm" className="flex-row gap-0" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>

              {syncMessage && (
                <span className="text-xs text-slate-400">{syncMessage}</span>
              )}
            </div>
          </div>
        </header>

        <section className="mt-8">
          <div
            className={
              "rounded-2xl border px-5 py-4 " +
              (potdSolved
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : 'border-amber-500/30 bg-amber-500/10')
            }
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                {potdSolved ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                ) : (
                  <CircleAlert className="mt-0.5 h-5 w-5 text-amber-300" />
                )}
                <div>
                  <p className="text-sm font-medium">Daily Challenge Status</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {potdSolved
                      ? `Done — ${potdTitle}`
                      : `Pending — ${potdTitle}`}
                  </p>
                  {!potdSolved && (
                    <p className="mt-1 text-xs text-slate-300/90">
                      {potdReason || 'Solve today’s POTD to keep your streak.'}
                    </p>
                  )}
                </div>
              </div>

              <a
                href={potdLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-100 ring-1 ring-white/10 hover:bg-slate-950/60"
              >
                <CalendarClock className="h-4 w-4" />
                Open LeetCode
              </a>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Revision Window</h2>
              <p className="mt-1 text-sm text-slate-400">
                {mode === 'due'
                  ? 'Questions due for revision (nextRevisionDate ≤ today).'
                  : 'Monthly review (solved in the last 30 days).'}
              </p>
            </div>

            <div className="inline-flex rounded-xl bg-slate-950/40 p-1 ring-1 ring-white/10">
              <button
                onClick={() => setMode('due')}
                className={
                  'rounded-lg px-3 py-2 text-sm ' +
                  (mode === 'due'
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:text-white')
                }
              >
                Due Now
              </button>
              <button
                onClick={() => setMode('monthly')}
                className={
                  'rounded-lg px-3 py-2 text-sm ' +
                  (mode === 'monthly'
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:text-white')
                }
              >
                Monthly Review
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading && (
              <div className="col-span-full rounded-2xl border border-slate-800/60 bg-slate-950/30 p-10 text-sm text-slate-300">
                <LoadingIndicator label="Loading…" size="lg" />
              </div>
            )}

            {!loading && items.length === 0 && !error && (
              <div className="col-span-full rounded-2xl border border-slate-800/60 bg-slate-950/30 p-6 text-sm text-slate-300">
                No questions to show.
              </div>
            )}

            {!loading &&
              items.map((q) => {
                const original = difficultyMeta(q.difficulty);
                const personal = difficultyMeta(q.userSetDifficulty || q.difficulty);
                const OriginalIcon = original.icon;
                const PersonalIcon = personal.icon;

                return (
                  <div
                    key={q.slug}
                    className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-400">{q.slug}</p>
                        <h3 className="mt-1 line-clamp-2 text-base font-semibold">{q.title}</h3>
                      </div>
                      <a
                        href={`https://leetcode.com/problems/${q.slug}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                      >
                        Open
                      </a>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ${original.badge}`}>
                        <OriginalIcon className="h-3.5 w-3.5" />
                        Original: {original.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ${personal.badge}`}>
                        <PersonalIcon className="h-3.5 w-3.5" />
                        Personal: {personal.label}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-300">
                      <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                        <p className="text-slate-400">Solved</p>
                        <p className="mt-1 font-medium text-slate-100">{formatDate(q.solvedDate)}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                        <p className="text-slate-400">Next revision</p>
                        <p className="mt-1 font-medium text-slate-100">{formatDate(q.nextRevisionDate)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        <footer className="mt-12 text-xs text-slate-500">
          Tip: run a sync after setting MongoDB:{' '}
          <span className="text-slate-300">POST /api/leetcode{isAuthed ? '/my' : ''}/sync{isAuthed ? '' : '?username=YOURNAME'}</span>
        </footer>
      </div>
    </div>
  );
}
