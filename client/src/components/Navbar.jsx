import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bell, Code2, Smile, ChevronDown, CheckCircle2, Clock, Calendar } from 'lucide-react';
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

function formatIstDateTime(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
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
  'rounded-full px-5 py-2.5 text-sm font-medium text-amber-500 hover:text-amber-400 hover:bg-amber-500/5 transition';

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
          isActive ? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]' : '',
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
        className={`${navLinkBase} inline-flex items-center gap-2.5 bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition-all duration-300 ${open ? 'bg-white/10 ring-amber-500/30' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-bold tracking-tight text-slate-200">Hi {name || 'User'}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180 text-amber-500' : ''}`} />
      </button>

      {open ? (
        <div
          role="menu"
          className={
            'absolute right-0 mt-3 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#05070a] shadow-[0_30px_90px_rgba(0,0,0,0.7)] backdrop-blur-2xl z-[600] animate-in fade-in slide-in-from-top-2 duration-200 ' +
            (variant === 'mobile' ? 'w-[min(18rem,calc(100vw-2rem))]' : 'w-48')
          }
        >
          {variant === 'mobile' ? (
            <div className="flex flex-col">
              {[
                { to: '/', label: 'Home' },
                { to: '/questions', label: 'Questions' },
                { to: '/revision', label: 'Revision' },
                { to: '/today', label: "Today's Task" },
                { to: '/solved', label: 'Solved Question' },
                { to: '/topics', label: 'Topics' },
              ].map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  role="menuitem"
                  className={({ isActive }) =>
                    `block px-6 py-3.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                      isActive ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`
                  }
                  onClick={() => setOpen(false)}
                  end={link.to === '/'}
                >
                  {link.label}
                </NavLink>
              ))}
              <div className="mx-6 h-px bg-white/10" />
            </div>
          ) : null}
          <div className="flex flex-col">
            <NavLink
              to="/solved"
              role="menuitem"
              className={({ isActive }) =>
                `block px-6 py-4 text-[10px] font-black tracking-widest uppercase transition-all ${
                  isActive ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
              onClick={() => setOpen(false)}
            >
              History
            </NavLink>
            <NavLink
              to="/logout"
              role="menuitem"
              className="block px-6 py-4 text-[10px] font-black tracking-widest uppercase text-rose-400 transition-all hover:bg-rose-500/10 hover:text-rose-300"
              onClick={() => setOpen(false)}
            >
              Logout
            </NavLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function notificationsStorageKey() {
  return 'dsaTracker.notifications.recent';
}

function readNotifications() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(notificationsStorageKey());
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeNotifications(items) {
  if (typeof window === 'undefined') return;
  try {
    const next = Array.isArray(items) ? items.slice(0, 10) : [];
    window.localStorage.setItem(notificationsStorageKey(), JSON.stringify(next));
  } catch {
    // ignore
  }
}

function NotificationsMenu({ items, onOpenChange, variant = 'desktop' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (onOpenChange) onOpenChange(open);
  }, [onOpenChange, open]);

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

  const btnClass =
    navLinkBase +
    ' inline-flex items-center gap-2 bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition-all duration-300 ' +
    (variant === 'mobile' ? 'px-4 py-2.5' : '') +
    (open ? ' bg-white/10 ring-amber-500/30' : '');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={btnClass}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
      >
        <div className="relative">
          <Bell className={`h-4 w-4 transition-colors duration-300 ${open ? 'text-amber-500' : 'text-slate-200'}`} />
          {items && items.length > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white animate-pulse">
              {items.length}
            </span>
          )}
        </div>
        <span className={`text-[10px] font-black uppercase tracking-widest transition-colors duration-300 ${open ? 'text-amber-500' : 'text-slate-200'}`}>Alerts</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-3 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-[2rem] border border-white/10 bg-[#05070a] shadow-[0_30px_90px_rgba(0,0,0,0.7)] backdrop-blur-2xl z-[600] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="border-b border-white/10 px-8 py-5">
            <p className="text-xs font-black uppercase tracking-widest text-white">Recent notifications</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Last 10 closed popups</p>
          </div>

          <div className="max-h-[360px] overflow-auto overscroll-contain">
            {items && items.length ? (
              items.map((n) => (
                <div key={n.id} className="border-b border-white/5 px-8 py-5 last:border-b-0 transition-colors hover:bg-white/5">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-bold text-slate-100">{n.title || 'Reminder'}</p>
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-400">
                      <Clock className="h-3 w-3 opacity-50" />
                      <span>{formatIstDateTime(n.ts)}</span>
                    </div>
                  </div>
                  {n.message ? (
                    <p className="mt-2 whitespace-pre-line text-xs font-medium leading-relaxed text-slate-400">{n.message}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="px-8 py-10 text-center">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No notifications yet.</p>
              </div>
            )}
          </div>
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

  const [notifications, setNotifications] = useState(() => readNotifications());

  const [weekBucketDueAtMs, setWeekBucketDueAtMs] = useState(null);
  const [weekBucketCount, setWeekBucketCount] = useState(0);

  const [hasContestTomorrow, setHasContestTomorrow] = useState(false);

  const [potdTitle, setPotdTitle] = useState('');
  const [potdSolved, setPotdSolved] = useState(null);
  const [potdHref, setPotdHref] = useState('https://leetcode.com/problemset/');

  const [nowTick, setNowTick] = useState(() => Date.now());

  const isHomeRoute = pathname === '/';

  const potdUi = useMemo(() => potdMeta(potdSolved), [potdSolved]);

  function resolveReminderMessage() {
    if (homeReminderMode === 'potd') return 'DO IT ASAP !!! BEFORE SLEEPING';
    if (homeReminderMode === 'contest') return homeReminderText || 'Contest Reminder';
    if (homeReminderMode === 'week') return homeReminderText || 'Weekly Revision Reminder';
    return homeReminderText || 'Complete your revision ASAP!!!!';
  }

  function resolveReminderTitle() {
    if (homeReminderMode === 'potd') return 'POTD';
    if (homeReminderMode === 'contest') return 'Contest';
    if (homeReminderMode === 'week') return 'Weekly Revision';
    return 'Reminder';
  }

  function recordReminderNotification() {
    if (typeof window === 'undefined') return;
    if (!homeReminderOpen) return;
    const message = String(resolveReminderMessage() || '').trim();
    if (!message) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ts: Date.now(),
      mode: homeReminderMode,
      title: resolveReminderTitle(),
      message,
      route: pathname,
    };

    const current = readNotifications();
    const next = [entry, ...(Array.isArray(current) ? current : [])].slice(0, 10);
    writeNotifications(next);
    setNotifications(next);
  }

  function closeHomeReminder() {
    recordReminderNotification();
    setHomeReminderOpen(false);
  }

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
    <div className="sticky top-0 z-[500] bg-transparent">
      <div className="w-full">
        <div className="flex items-center justify-between gap-3 rounded-none border border-white/10 bg-slate-950/60 px-5 py-3.5 backdrop-blur ring-1 ring-fuchsia-500/10 shadow-lg shadow-black/30">
        <Link to="/" className="inline-flex items-center gap-2">
          <Code2 className="h-5 w-5 text-yellow-400" />
          <span className="text-lg font-bold tracking-tight text-white">DSA Tracker</span>
        </Link>

        <div className="flex items-center gap-5 sm:hidden">
          {isLoggedIn ? (
            <a
              href={potdHref}
              target="_blank"
              rel="noreferrer"
              className={navLinkBase + ' inline-flex items-center gap-2 ' + potdUi.pill + ' !px-4.5 !py-2.5'}
              title={potdTitle ? `POTD: ${potdTitle}` : 'POTD'}
            >
              <span className={'text-xs font-semibold tracking-wide ' + potdUi.text}>POTD</span>
              {potdUi.showSmile ? <Smile className="h-4 w-4" aria-label="Solved" /> : null}
              <span className={'h-2 w-2 rounded-full ' + potdUi.dot} />
            </a>
          ) : null}

          {isLoggedIn ? <NotificationsMenu items={notifications} variant="mobile" /> : null}

          {isLoggedIn ? <UserMenu name={user?.name} variant="mobile" /> : <NavItem to="/login">Login</NavItem>}
        </div>

        <nav className="hidden items-center gap-5 sm:flex">
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

          {isLoggedIn ? <NotificationsMenu items={notifications} /> : null}

          {isLoggedIn ? <UserMenu name={user?.name} /> : <NavItem to="/login">Login</NavItem>}
        </nav>
        </div>
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
                      onClick={closeHomeReminder}
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
