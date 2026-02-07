import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Code2, Smile } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getNextContestIST, isContestTomorrowIST } from '../utils/contestSchedule.js';

function endOfUtcDay(value = new Date()) {
  const d = new Date(value);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function formatHoursLeft(msRemaining) {
  if (!Number.isFinite(msRemaining)) return '';
  if (msRemaining <= 0) return '0h';
  const totalMinutes = Math.floor(msRemaining / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${Math.max(0, minutes)}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getISTParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  // IST = UTC+05:30 (no DST)
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
  };
}

function isAfter10pmIST(date = new Date()) {
  const p = getISTParts(date);
  return Boolean(p && p.hour >= 22);
}

function istDateKey(date = new Date()) {
  const p = getISTParts(date);
  if (!p) return '';
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function istWallTimeToUtcMs({ year, month, day, hour, minute = 0, second = 0 }) {
  // IST = UTC+05:30 (no DST)
  const offsetMs = 330 * 60 * 1000;
  return Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs;
}

function getContestReminderStage(msRemaining) {
  if (!Number.isFinite(msRemaining)) return null;
  if (msRemaining <= 0) return null;

  const HOUR_MS = 60 * 60 * 1000;
  const stages = [
    { key: '2h', thresholdMs: 2 * HOUR_MS, label: '2 hours' },
    { key: '12h', thresholdMs: 12 * HOUR_MS, label: '12 hours' },
    { key: '24h', thresholdMs: 24 * HOUR_MS, label: '1 day' },
  ];

  for (const s of stages) {
    if (msRemaining <= s.thresholdMs) return s;
  }
  return null;
}

function formatContestCountdown(msRemaining) {
  if (!Number.isFinite(msRemaining)) return '';
  if (msRemaining <= 0) return '0m';

  const totalMinutes = Math.floor(msRemaining / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const navLinkBase =
  'rounded-lg px-3 py-2 text-sm font-medium text-slate-200/90 hover:text-white hover:bg-white/5 transition';

function potdMeta(potdSolved) {
  if (potdSolved === false) {
    return {
      pill: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/20',
      text: 'text-rose-200',
      dot: 'bg-rose-400',
      showSmile: false,
    };
  }
  if (potdSolved === true) {
    return {
      pill: 'bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20',
      text: 'text-emerald-100',
      dot: 'bg-emerald-400',
      showSmile: true,
    };
  }
  return {
    pill: 'bg-white/5 text-slate-200 ring-1 ring-white/10 hover:bg-white/10',
    text: 'text-slate-200',
    dot: 'bg-slate-500',
    showSmile: false,
  };
}

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          navLinkBase,
          isActive ? 'bg-white/10 text-white ring-1 ring-white/10' : '',
        ].join(' ')
      }
      end
    >
      {children}
    </NavLink>
  );
}

function UserMenu({ name, variant = 'desktop' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!open) return;
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target)) setOpen(false);
    }

    function onKeyDown(e) {
      if (!open) return;
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={navLinkBase + ' inline-flex items-center gap-2 bg-white/5 ring-1 ring-white/10 hover:bg-white/10'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Hi {name || 'User'}</span>
        <span className={'text-xs opacity-80 transition ' + (open ? 'rotate-180' : '')}>▾</span>
      </button>

      {open ? (
        <div
          role="menu"
          className={
            'absolute right-0 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#0b0f1a]/95 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur ' +
            (variant === 'mobile' ? 'w-[min(18rem,calc(100vw-2rem))]' : 'w-44')
          }
        >
          {variant === 'mobile' ? (
            <>
              <NavLink
                to="/"
                role="menuitem"
                className={({ isActive }) =>
                  [
                    'block px-4 py-3 text-sm',
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
                  ].join(' ')
                }
                onClick={() => setOpen(false)}
                end
              >
                Home
              </NavLink>
              <NavLink
                to="/questions"
                role="menuitem"
                className={({ isActive }) =>
                  [
                    'block px-4 py-3 text-sm',
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
                  ].join(' ')
                }
                onClick={() => setOpen(false)}
                end
              >
                Questions
              </NavLink>
              <NavLink
                to="/revision"
                role="menuitem"
                className={({ isActive }) =>
                  [
                    'block px-4 py-3 text-sm',
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
                  ].join(' ')
                }
                onClick={() => setOpen(false)}
              >
                Revision
              </NavLink>
              <NavLink
                to="/today"
                role="menuitem"
                className={({ isActive }) =>
                  [
                    'block px-4 py-3 text-sm',
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
                  ].join(' ')
                }
                onClick={() => setOpen(false)}
              >
                Today's Task
              </NavLink>
              <NavLink
                to="/solved"
                role="menuitem"
                className={({ isActive }) =>
                  [
                    'block px-4 py-3 text-sm',
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
                  ].join(' ')
                }
                onClick={() => setOpen(false)}
              >
                Solved
              </NavLink>
              <NavLink
                to="/topics"
                role="menuitem"
                className={({ isActive }) =>
                  [
                    'block px-4 py-3 text-sm',
                    isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
                  ].join(' ')
                }
                onClick={() => setOpen(false)}
              >
                Topics
              </NavLink>
              <div className="h-px bg-white/10" />
            </>
          ) : null}
          <NavLink
            to="/solved"
            role="menuitem"
            className={({ isActive }) =>
              [
                'block px-4 py-3 text-sm',
                isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
              ].join(' ')
            }
            onClick={() => setOpen(false)}
          >
            Solved
          </NavLink>
          <NavLink
            to="/logout"
            role="menuitem"
            className={() => 'block px-4 py-3 text-sm text-slate-200 hover:bg-white/5'}
            onClick={() => setOpen(false)}
          >
            Logout
          </NavLink>
        </div>
      ) : null}
    </div>
  );
}

export default function Navbar() {
  const { isLoggedIn, user, token } = useAuth();
  const { pathname } = useLocation();

  const authHeaders = useMemo(() => {
    if (!isLoggedIn || !token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [isLoggedIn, token]);

  const [homeReminderOpen, setHomeReminderOpen] = useState(false);
  const [homeReminderText, setHomeReminderText] = useState('');
  const [homeReminderCompletionPct, setHomeReminderCompletionPct] = useState(null);
  const [homeReminderMode, setHomeReminderMode] = useState('summary');

  const [weekBucketDueAtMs, setWeekBucketDueAtMs] = useState(null);
  const [weekBucketCount, setWeekBucketCount] = useState(0);

  const [hasContestTomorrow, setHasContestTomorrow] = useState(false);

  const [potdTitle, setPotdTitle] = useState('');
  const [potdSolved, setPotdSolved] = useState(null);
  const [potdHref, setPotdHref] = useState('https://leetcode.com/problemset/');

  const [nowTick, setNowTick] = useState(() => Date.now());

  const isHomeRoute = pathname === '/';

  const potdUi = useMemo(() => potdMeta(potdSolved), [potdSolved]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const now = new Date();
    const next = getNextContestIST(now);
    if (!next?.startsAtUtc) {
      setHasContestTomorrow(false);
      return;
    }

    setHasContestTomorrow(isContestTomorrowIST(now, next.startsAtUtc));
  }, [nowTick]);

  function canShowHomeReminderNow() {
    if (typeof window === 'undefined') return true;
    try {
      const key = 'dsaTracker.homeReminder.lastShownAtMs';
      const last = Number(window.localStorage.getItem(key) || 0);
      const now = Date.now();
      // Show task reminder every 2 hours.
      return !Number.isFinite(last) || now - last >= 2 * 60 * 60 * 1000;
    } catch {
      return true;
    }
  }

  function markHomeReminderShownNow() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('dsaTracker.homeReminder.lastShownAtMs', String(Date.now()));
    } catch {
      // ignore
    }
  }

  function canShowPotdLateReminderToday(now = new Date()) {
    if (typeof window === 'undefined') return true;
    try {
      const key = 'dsaTracker.potdLateReminder.lastShownIstDate';
      const last = String(window.localStorage.getItem(key) || '');
      const today = istDateKey(now);
      if (!today) return true;
      return last !== today;
    } catch {
      return true;
    }
  }

  function markPotdLateReminderShownToday(now = new Date()) {
    if (typeof window === 'undefined') return;
    try {
      const key = 'dsaTracker.potdLateReminder.lastShownIstDate';
      const today = istDateKey(now);
      if (today) window.localStorage.setItem(key, today);
    } catch {
      // ignore
    }
  }

  function contestReminderStorageKey() {
    return 'dsaTracker.contestReminder.shown';
  }

  function getContestReminderStore() {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(contestReminderStorageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function wasContestReminderShown(contestId, stageKey) {
    if (!contestId || !stageKey) return false;
    try {
      const store = getContestReminderStore();
      return Boolean(store?.[contestId]?.[stageKey]);
    } catch {
      return false;
    }
  }

  function markContestReminderShown(contestId, stageKey) {
    if (typeof window === 'undefined') return;
    if (!contestId || !stageKey) return;
    try {
      const store = getContestReminderStore();
      const next = { ...(store || {}) };
      next[contestId] = { ...(next[contestId] || {}), [stageKey]: Date.now() };
      window.localStorage.setItem(contestReminderStorageKey(), JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function weekReminderStorageKey() {
    return 'dsaTracker.weekRevisionReminder.shown';
  }

  function getWeekReminderStore() {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(weekReminderStorageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function wasWeekReminderShown(dueAtMs) {
    const id = String(dueAtMs || '');
    if (!id) return false;
    try {
      const store = getWeekReminderStore();
      return Boolean(store?.[id]);
    } catch {
      return false;
    }
  }

  function markWeekReminderShown(dueAtMs) {
    if (typeof window === 'undefined') return;
    const id = String(dueAtMs || '');
    if (!id) return;
    try {
      const store = getWeekReminderStore();
      const next = { ...(store || {}) };
      next[id] = Date.now();
      window.localStorage.setItem(weekReminderStorageKey(), JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!isLoggedIn) return;
    if (homeReminderOpen) return;
    if (!weekBucketCount) return;
    if (!Number.isFinite(weekBucketDueAtMs)) return;

    const msRemaining = weekBucketDueAtMs - nowTick;
    if (msRemaining <= 0) return;

    // Trigger: 9:00 PM IST on the day before the weekly due date.
    const duePartsIst = getISTParts(new Date(weekBucketDueAtMs));
    if (!duePartsIst) return;

    // Compute the IST calendar day for "day before due".
    const dueDayUtcMidnightMs = Date.UTC(duePartsIst.year, duePartsIst.month - 1, duePartsIst.day);
    const prevDay = new Date(dueDayUtcMidnightMs);
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    const prevY = prevDay.getUTCFullYear();
    const prevM = prevDay.getUTCMonth() + 1;
    const prevD = prevDay.getUTCDate();

    const triggerMs = istWallTimeToUtcMs({ year: prevY, month: prevM, day: prevD, hour: 21, minute: 0, second: 0 });
    if (nowTick < triggerMs) return;
    if (nowTick >= weekBucketDueAtMs) return;
    if (wasWeekReminderShown(weekBucketDueAtMs)) return;

    setHomeReminderMode('week');
    setHomeReminderCompletionPct(null);
    setHomeReminderText(`WEEKLY REVISION COMING in ${formatContestCountdown(msRemaining)}`);
    setHomeReminderOpen(true);
    markWeekReminderShown(weekBucketDueAtMs);
  }, [homeReminderOpen, isLoggedIn, nowTick, weekBucketCount, weekBucketDueAtMs]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isLoggedIn || !token) {
        if (!cancelled) {
          setPotdTitle('');
          setPotdSolved(null);
          setPotdHref('https://leetcode.com/problemset/');
          setHomeReminderOpen(false);
          setHomeReminderText('');
          setHomeReminderCompletionPct(null);
          setHomeReminderMode('summary');
        }
        return;
      }

      try {
        const potdRes = await fetch('/api/leetcode/my/potd-status', { headers: authHeaders });
        const potdJson = await potdRes.json().catch(() => null);

        const revRes = await fetch('/api/revision/summary', { headers: authHeaders });
        const revJson = await revRes.json().catch(() => null);

        if (cancelled) return;

        const potd = potdJson?.potd;
        const nextTitle = String(potd?.question?.title || 'Daily Challenge');
        const solvedNow = typeof potdJson?.solved === 'boolean' ? potdJson.solved : null;
        const href = potd?.link ? `https://leetcode.com${potd.link}` : 'https://leetcode.com/problemset/';

        setPotdTitle(nextTitle);
        setPotdSolved(solvedNow);
        setPotdHref(href);

        const now = new Date();

        // Track week bucket due time for weekly reminders (works on all routes).
        const weekBucket = Array.isArray(revJson?.week) ? revJson.week : [];
        const weekDueTimes = weekBucket
          .map((it) => new Date(it?.bucketDueAt || 0).getTime())
          .filter((t) => Number.isFinite(t) && t > 0);
        setWeekBucketCount(weekBucket.length);
        setWeekBucketDueAtMs(weekDueTimes.length ? Math.min(...weekDueTimes) : null);

        // Contest reminders at checkpoints: 24h, 12h, 2h before the next contest.
        const nextContest = getNextContestIST(now);
        const startsAtUtc = nextContest?.startsAtUtc ? new Date(nextContest.startsAtUtc) : null;
        const startsAtMs = startsAtUtc && Number.isFinite(startsAtUtc.getTime()) ? startsAtUtc.getTime() : NaN;
        const msRemaining = Number.isFinite(startsAtMs) ? startsAtMs - now.getTime() : NaN;
        const stage = getContestReminderStage(msRemaining);
        const contestId =
          nextContest?.key && Number.isFinite(startsAtMs) ? `${nextContest.key}:${startsAtMs}` : '';

        if (contestId && stage && !wasContestReminderShown(contestId, stage.key)) {
          const countdown = formatContestCountdown(msRemaining);
          setHomeReminderMode('contest');
          setHomeReminderCompletionPct(null);
          setHomeReminderText(`CONTEST COMING !!!!\nTime left ${countdown}\nALL THE BEST 😊`);
          setHomeReminderOpen(true);
          markContestReminderShown(contestId, stage.key);
          return;
        }

        const todayBucket = Array.isArray(revJson?.today) ? revJson.today : [];

        // Today tasks reset at 5:30 AM IST (midnight UTC).
        const eod = endOfUtcDay(now).getTime();
        const dueTodayCount = todayBucket.filter((x) => {
          const t = new Date(x?.bucketDueAt || 0).getTime();
          return Number.isFinite(t) && t <= eod;
        }).length;
        const totalTodayCount = todayBucket.length;
        const dueTodayPct = totalTodayCount ? dueTodayCount / totalTodayCount : 0;

        const hasRevisionLeft = dueTodayCount > 0;

        const potdIsPending = solvedNow === false;
        const shouldShowPotdLateReminder = potdIsPending && isAfter10pmIST(now);

        const nextMode = shouldShowPotdLateReminder ? 'potd' : 'summary';

        let nextText = '';
        const completionPct = null;

        if (shouldShowPotdLateReminder) {
          nextText = '';
        } else {
          nextText = hasRevisionLeft ? 'Complete your revision ASAP!!!!' : '';
        }
        const canShowNow = shouldShowPotdLateReminder ? canShowPotdLateReminderToday(now) : canShowHomeReminderNow();

        if (nextText && canShowNow) {
          setHomeReminderText(nextText);
          setHomeReminderCompletionPct(null);
          setHomeReminderMode(nextMode);
          setHomeReminderOpen(true);
          if (shouldShowPotdLateReminder) markPotdLateReminderShownToday(now);
          else markHomeReminderShownNow();
        } else if (shouldShowPotdLateReminder && canShowNow) {
          setHomeReminderText('');
          setHomeReminderCompletionPct(null);
          setHomeReminderMode('potd');
          setHomeReminderOpen(true);
          markPotdLateReminderShownToday(now);
        } else {
          setHomeReminderOpen(false);
          setHomeReminderText('');
          setHomeReminderCompletionPct(null);
          setHomeReminderMode('summary');
        }
      } catch {
        // Silent failure; don't block nav rendering.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authHeaders, hasContestTomorrow, isHomeRoute, isLoggedIn, pathname, token]);

  return (
    <div className="sticky top-0 z-40 border-b border-white/5 bg-[#060a18]/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="inline-flex items-center gap-2">
          <Code2 className="h-5 w-5 text-yellow-400" />
          <span className="text-base font-semibold tracking-tight text-white">DSA Tracker</span>
        </Link>

        <div className="flex items-center gap-2 sm:hidden">
          {isLoggedIn ? (
            <a
              href={potdHref}
              target="_blank"
              rel="noreferrer"
              className={navLinkBase + ' inline-flex items-center gap-2 ' + potdUi.pill}
              title={potdTitle ? `POTD: ${potdTitle}` : 'POTD'}
            >
              <span className={'text-xs font-semibold tracking-wide ' + potdUi.text}>POTD</span>
              {potdUi.showSmile ? <Smile className="h-4 w-4" aria-label="Solved" /> : null}
              <span className={'h-2 w-2 rounded-full ' + potdUi.dot} />
            </a>
          ) : null}

          {isLoggedIn ? <UserMenu name={user?.name} variant="mobile" /> : <NavItem to="/login">Login</NavItem>}
        </div>

        <nav className="hidden items-center gap-1 sm:flex">
          <NavItem to="/">Home</NavItem>
          <NavItem to="/questions">Questions</NavItem>
          {isLoggedIn ? <NavItem to="/revision">Revision</NavItem> : null}
          {isLoggedIn ? <NavItem to="/today">Today's Task</NavItem> : null}

          {isLoggedIn ? (
            <a
              href={potdHref}
              target="_blank"
              rel="noreferrer"
              className={navLinkBase + ' inline-flex items-center gap-2 ' + potdUi.pill}
              title={potdTitle ? `POTD: ${potdTitle}` : 'POTD'}
            >
              <span className={'text-xs font-semibold tracking-wide ' + potdUi.text}>POTD</span>
              {potdUi.showSmile ? <Smile className="h-4 w-4" aria-label="Solved" /> : null}
              {potdSolved === false ? (
                <span className="text-[10px] text-slate-300">
                  {formatHoursLeft(endOfUtcDay(new Date(nowTick)).getTime() - nowTick)} left
                </span>
              ) : null}
              <span
                className={
                  'h-2 w-2 rounded-full ' + potdUi.dot
                }
              />
            </a>
          ) : null}

          {isLoggedIn ? <UserMenu name={user?.name} /> : <NavItem to="/login">Login</NavItem>}
        </nav>
      </div>

      {homeReminderOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-[min(920px,calc(100vw-2rem))]">
                <div className="dsa-scroll rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-5 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-8">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      {homeReminderMode === 'potd' || homeReminderMode === 'contest' || homeReminderMode === 'week' ? null : (
                        <p className="text-base text-slate-300">Reminder</p>
                      )}
                      <p className="mt-1 whitespace-pre-line text-xl font-semibold text-white sm:text-2xl">
                        {homeReminderMode === 'potd'
                          ? 'DO IT ASAP !!! BEFORE SLEEPING'
                          : homeReminderMode === 'contest'
                            ? homeReminderText || 'Contest Reminder'
                            : homeReminderMode === 'week'
                              ? homeReminderText || 'Weekly Revision Reminder'
                            : 'Complete your revision ASAP!!!!'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10 sm:px-5 sm:py-3"
                      onClick={() => setHomeReminderOpen(false)}
                    >
                      Close
                    </button>
                  </div>

                  {homeReminderMode === 'summary' ? (
                    <>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <NavLink
                          to="/today"
                          className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10 sm:px-6 sm:py-3"
                          onClick={() => setHomeReminderOpen(false)}
                        >
                          Open Today's Task
                        </NavLink>
                        <NavLink
                          to="/revision"
                          className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10 sm:px-6 sm:py-3"
                          onClick={() => setHomeReminderOpen(false)}
                        >
                          Open Revision
                        </NavLink>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
