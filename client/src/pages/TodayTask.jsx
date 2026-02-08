import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import LoadingIndicator from '../components/LoadingIndicator.jsx';
import { apiGet } from '../lib/api.js';
import { 
  CheckCircle2, 
  Circle, 
  Trash2, 
  ExternalLink, 
  Flame, 
  Clock, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  LayoutGrid,
  Trophy,
  AlertCircle
} from 'lucide-react';

function difficultyMeta(difficulty) {
  const d = String(difficulty || '').toLowerCase();
  if (d === 'hard') return { label: 'Hard', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/20', glow: 'shadow-[0_0_15px_rgba(244,63,94,0.2)]' };
  if (d === 'medium') return { label: 'Medium', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/20', glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]' };
  return { label: 'Easy', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20', glow: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]' };
}

function utcDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function istDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const map = Object.create(null);
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    const y = map.year;
    const m = map.month;
    const day = map.day;
    return y && m && day ? `${y}-${m}-${day}` : '';
  } catch {
    return '';
  }
}

function isUtcDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function addUtcDaysToKey(dayKey, deltaDays) {
  if (!isUtcDateKey(dayKey)) return '';
  const [y, m, d] = String(dayKey).split('-').map((x) => Number(x));
  const baseMs = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(baseMs)) return '';
  const next = new Date(baseMs + (Number(deltaDays) || 0) * 24 * 60 * 60 * 1000);
  return utcDateKey(next);
}

function formatKeyDMY(dayKey) {
  if (!isUtcDateKey(dayKey)) return '';
  const [y, m, d] = String(dayKey).split('-');
  return `${d}-${m}-${y}`;
}

function readCheckedMap(dayKey) {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(`dsaTracker.todayTask.checked.${dayKey}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCheckedMap(dayKey, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`dsaTracker.todayTask.checked.${dayKey}`, JSON.stringify(value || {}));
  } catch {
    // ignore
  }
}

export default function TodayTask() {
  const { token, isLoggedIn } = useAuth();
  const isAuthed = isLoggedIn && Boolean(token);
  const headers = useMemo(() => (isAuthed ? { Authorization: `Bearer ${token}` } : {}), [isAuthed, token]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [potd, setPotd] = useState(null);
  const [potdSolved, setPotdSolved] = useState(false);
  const [potdReason, setPotdReason] = useState('');
  const [todayBucket, setTodayBucket] = useState([]);

  const [dayKey, setDayKey] = useState(() => utcDateKey(new Date()));
  const [checkedByKey, setCheckedByKey] = useState(() => readCheckedMap(utcDateKey(new Date())));

  const [todoDayKey, setTodoDayKey] = useState(() => istDateKey(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => istDateKey(new Date()));
  const [todoText, setTodoText] = useState('');
  const [todos, setTodos] = useState([]); // [{ id, text, done }]

  const todoDayKeyRef = useRef(todoDayKey);

  useEffect(() => {
    todoDayKeyRef.current = todoDayKey;
  }, [todoDayKey]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date();
      const nextUtc = utcDateKey(now);
      const nextIst = istDateKey(now);
      setDayKey((prev) => (prev === nextUtc ? prev : nextUtc));
      setTodoDayKey((prev) => (prev === nextIst ? prev : nextIst));
    }, 30 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setSelectedDateKey((prev) => (prev ? prev : todoDayKey));
      return;
    }

    const ROLLOVER_TO_KEY = 'dsaTracker.todo.rollover.lastToDayKey';
    const alreadyRolledTo = window.localStorage.getItem(ROLLOVER_TO_KEY) || '';

    const prevTodoDayKey = todoDayKeyRef.current;
    const shouldAutoAdvance =
      !selectedDateKey || (prevTodoDayKey && selectedDateKey === prevTodoDayKey && prevTodoDayKey !== todoDayKey);
    if (shouldAutoAdvance) setSelectedDateKey(todoDayKey);

    if (alreadyRolledTo === todoDayKey) return;

    const fromKey = addUtcDaysToKey(todoDayKey, -1);
    if (!fromKey || fromKey === todoDayKey) {
      window.localStorage.setItem(ROLLOVER_TO_KEY, todoDayKey);
      return;
    }

    try {
      const fromTodosRaw = window.localStorage.getItem(`dsaTracker.todo.list.${fromKey}`);
      const fromTodos = fromTodosRaw ? JSON.parse(fromTodosRaw) : null;
      const fromList = Array.isArray(fromTodos) ? fromTodos : [];

      const carry = fromList
        .filter((t) => t && t.done !== true)
        .map((t) => ({
          ...t,
          originDateKey: isUtcDateKey(t?.originDateKey) ? t.originDateKey : fromKey,
        }));

      if (carry.length) {
        const toTodosRaw = window.localStorage.getItem(`dsaTracker.todo.list.${todoDayKey}`);
        const toTodos = toTodosRaw ? JSON.parse(toTodosRaw) : null;
        const current = Array.isArray(toTodos) ? toTodos : [];

        const existingIds = new Set(current.map((t) => String(t?.id || '')).filter(Boolean));
        const moved = carry.filter((t) => {
          const id = String(t?.id || '');
          return id && !existingIds.has(id);
        });

        const next = [...moved, ...current];
        window.localStorage.setItem(`dsaTracker.todo.list.${todoDayKey}`, JSON.stringify(next));

        const remainingFrom = fromList.filter((t) => t && Boolean(t.done) === true);
        window.localStorage.setItem(`dsaTracker.todo.list.${fromKey}`, JSON.stringify(remainingFrom));

        if (selectedDateKey === todoDayKey || shouldAutoAdvance) setTodos(next);
      }

      window.localStorage.setItem(ROLLOVER_TO_KEY, todoDayKey);
    } catch {
      // ignore
    }
  }, [todoDayKey, selectedDateKey]);

  useEffect(() => {
    setCheckedByKey(readCheckedMap(dayKey));
  }, [dayKey]);

  function setChecked(itemKey, nextChecked) {
    setCheckedByKey((prev) => {
      const next = { ...(prev || {}) };
      if (nextChecked) next[itemKey] = true;
      else delete next[itemKey];
      writeCheckedMap(dayKey, next);
      return next;
    });
  }

  function readTodos(dateKey) {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(`dsaTracker.todo.list.${dateKey}`);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeTodos(dateKey, nextTodos) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(`dsaTracker.todo.list.${dateKey}`, JSON.stringify(Array.isArray(nextTodos) ? nextTodos : []));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    setTodos(readTodos(selectedDateKey));
  }, [selectedDateKey]);

  function addTodo() {
    const text = String(todoText || '').trim();
    if (!text) return;
    const item = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, done: false, originDateKey: '' };
    const next = [item, ...(Array.isArray(todos) ? todos : [])];
    setTodos(next);
    writeTodos(selectedDateKey, next);
    setTodoText('');
  }

  function toggleTodo(id, done) {
    const next = (Array.isArray(todos) ? todos : []).map((t) => (t.id === id ? { ...t, done: Boolean(done) } : t));
    setTodos(next);
    writeTodos(selectedDateKey, next);
  }

  function deleteTodo(id) {
    const next = (Array.isArray(todos) ? todos : []).filter((t) => t.id !== id);
    setTodos(next);
    writeTodos(selectedDateKey, next);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');

      try {
        const potdRes = await fetch(isAuthed ? '/api/leetcode/my/potd-status' : '/api/leetcode/potd-status', {
          headers,
        });
        const revisionSummary = isAuthed ? await apiGet('/api/revision/summary').catch(() => null) : null;

        const potdJson = await potdRes.json().catch(() => null);

        if (!cancelled) {
          if (!potdRes.ok) throw new Error(potdJson?.error || 'Failed to load POTD status');

          setPotd(potdJson?.potd || null);
          setPotdSolved(Boolean(potdJson?.solved));
          setPotdReason(String(potdJson?.reason || ''));
          setTodayBucket(Array.isArray(revisionSummary?.today) ? revisionSummary.today : []);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [headers, isAuthed]);

  const potdLink = potd?.link ? `https://leetcode.com${potd.link}` : 'https://leetcode.com/problemset/';
  const potdTitle = potd?.question?.title || 'Daily Challenge';
  const potdDifficulty = potd?.question?.difficulty || '';
  const potdDiff = difficultyMeta(potdDifficulty);

  const todayCheckedCount = useMemo(() => {
    return todayBucket.reduce((acc, q) => (checkedByKey[`task:${q._id}`] ? acc + 1 : acc), 0);
  }, [checkedByKey, todayBucket]);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-12 flex-1">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-10 sm:mb-12">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">Today's Focus</h1>
          <div className="flex items-center gap-3 text-slate-400">
            <p className="text-sm font-bold uppercase tracking-widest">{formatKeyDMY(dayKey)}</p>
          </div>
        </div>

        {!loading && (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className={`flex items-center gap-3 rounded-2xl border bg-white/5 px-4 py-3 sm:px-5 transition-all ${potdSolved ? 'border-emerald-500/30 text-emerald-400' : 'border-white/10 text-slate-400'}`}>
              <Trophy className={`h-5 w-5 ${potdSolved ? 'fill-emerald-400/20' : ''}`} />
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50">POTD Status</div>
                <div className="text-sm font-bold">{potdSolved ? 'Completed' : 'Pending'}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:px-5 text-slate-400">
              <LayoutGrid className="h-5 w-5" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50">Revision Progress</div>
                <div className="text-sm font-bold text-white">{todayCheckedCount} / {todayBucket.length}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div className="mb-8 flex items-center gap-4 rounded-[2rem] border border-rose-500/20 bg-rose-500/10 p-4 sm:p-6 text-rose-400">
            <AlertCircle className="h-6 w-6 shrink-0" />
            <p className="font-bold">{error}</p>
        </div>
      ) : null}

      {!isAuthed && !loading && (
          <div className="mb-8 flex items-center gap-4 rounded-[2rem] border border-amber-500/20 bg-amber-500/10 p-4 sm:p-6 text-amber-400">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <p className="font-bold">You're not logged in, so this is showing global demo data. Log in to see your personal tasks.</p>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10">
        <div className="lg:col-span-7 space-y-8 sm:space-y-10">
          <section>
            <div className="flex items-center gap-3 mb-6 px-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Flame className="h-5 w-5 fill-amber-500/20" />
              </div>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Daily Challenge</h2>
            </div>

            {loading ? (
              <div className="h-48 rounded-[2.5rem] bg-white/5 border border-white/5 animate-pulse flex items-center justify-center">
                <LoadingIndicator label="" size="sm" />
              </div>
            ) : (
              <div className="group relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#1C1C2E]/40 p-6 sm:p-8 transition-all hover:bg-[#1C1C2E] hover:border-amber-500/30">
                {/* Glass Reflection Effect */}
                <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg] z-20"></div>
                
                <div className="absolute top-0 right-0 p-6 sm:p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                    <Trophy className="h-32 w-32 text-white" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`rounded-full border px-3 py-0.5 text-[10px] font-black uppercase tracking-widest ${potdDiff.badge}`}>
                        {potdDiff.label}
                      </span>
                      {potdSolved && (
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                           <CheckCircle2 className="h-3 w-3" /> Solved
                        </span>
                      )}
                    </div>
                      <h3 className="text-xl sm:text-2xl font-black text-white leading-tight mb-2 group-hover:text-amber-500 transition-colors italic">
                       {potdTitle}
                    </h3>
                    <p className="text-sm text-slate-400 font-medium italic">LeetCode Problem of the Day</p>
                  </div>

                  <a
                    href={potdLink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-3 rounded-2xl bg-amber-500 px-6 py-3.5 sm:px-8 sm:py-4 text-[12px] sm:text-sm font-black uppercase tracking-widest text-black shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 hover:scale-[1.02] active:scale-[0.98] italic"
                  >
                    Initiate Challenge
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-3 mb-6 px-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Clock className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-amber-500">Revision Queue</h2>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 rounded-[2rem] bg-white/5 border border-white/5 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {todayBucket.length > 0 ? (
                  todayBucket.map((q) => {
                    const isChecked = !!checkedByKey[`task:${q._id}`];
                    const meta = difficultyMeta(q.difficulty);
                    return (
                      <div
                        key={q._id}
                        onClick={() => setChecked(`task:${q._id}`, !isChecked)}
                        className={`group cursor-pointer relative overflow-hidden flex items-center justify-between gap-4 sm:gap-6 rounded-[2rem] border p-5 sm:p-6 transition-all duration-500 ${
                          isChecked 
                            ? 'bg-emerald-500/5 border-emerald-500/20' 
                            : 'bg-[#1C1C2E]/40 border-white/5 hover:border-white/20 hover:bg-[#1C1C2E]'
                        }`}
                      >
                        {/* Glass Reflection Effect */}
                        <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg]"></div>
                        
                        <div className="relative z-10 flex items-center gap-5 min-w-0">
                          <div className={`shrink-0 rounded-xl p-3 transition-colors ${isChecked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500'}`}>
                            {isChecked ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${meta.label.toLowerCase() === 'easy' ? 'text-emerald-400' : meta.label.toLowerCase() === 'medium' ? 'text-amber-400' : 'text-rose-400'}`}>
                                    {meta.label}
                                </span>
                                <span className="h-1 w-1 rounded-full bg-slate-700"></span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{q.category || 'DSA'}</span>
                            </div>
                            <h4 className={`truncate text-lg font-bold leading-tight transition-all ${isChecked ? 'text-slate-500 line-through' : 'text-slate-100 group-hover:text-white'}`}>
                              {q.title || q.ref}
                            </h4>
                          </div>
                        </div>

                        <Link
                          to="/revision"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 flex items-center justify-center p-3 rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </Link>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 sm:py-20 text-center rounded-[2.5rem] border-2 border-dashed border-white/5">
                    <CheckCircle2 className="h-12 w-12 text-emerald-500/20 mx-auto mb-4" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No revisions due for today!</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-5">
            <section className="lg:sticky lg:top-24">
                <div className="flex items-center justify-between mb-6 px-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Calendar className="h-5 w-5" />
                        </div>
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Priority Tasks</h2>
                    </div>
                </div>

                <div className="rounded-[2.5rem] border border-white/10 bg-[#05070a] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
                  <div className="bg-white/5 border-b border-white/5 p-4 sm:p-6">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <button 
                                onClick={() => setSelectedDateKey(addUtcDaysToKey(selectedDateKey, -1))}
                                className="p-2 rounded-xl hover:bg-white/5 text-slate-400 transition-colors"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <div className="text-center">
                                <span className={`text-xs font-black uppercase tracking-widest ${selectedDateKey === todoDayKey ? 'text-indigo-400' : 'text-slate-500'}`}>
                                    {selectedDateKey === todoDayKey ? 'Today’s Tasks' : formatKeyDMY(selectedDateKey)}
                                </span>
                            </div>
                            <button 
                                onClick={() => setSelectedDateKey(addUtcDaysToKey(selectedDateKey, 1))}
                                className="p-2 rounded-xl hover:bg-white/5 text-slate-400 transition-colors"
                            >
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="relative group/input">
                            <input
                                placeholder="Add a key focus for today..."
                                value={todoText}
                                onChange={(e) => setTodoText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                                className="w-full rounded-2xl border border-white/5 bg-[#050506] py-3.5 sm:py-4 pl-5 pr-14 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all shadow-inner"
                            />
                            <button
                                onClick={addTodo}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-all scale-90 group-focus-within/input:scale-100"
                            >
                                <Plus className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-3">
                        {todos.length > 0 ? (
                            todos.map((t) => (
                                <div
                                    key={t.id}
                                    className={`group flex items-start gap-4 rounded-2xl border p-4 transition-all duration-300 ${
                                        t.done 
                                            ? 'bg-emerald-500/5 border-emerald-500/10 opacity-60' 
                                            : 'bg-white/5 border-white/5 hover:border-white/10'
                                    }`}
                                >
                                    <button
                                        onClick={() => toggleTodo(t.id, !t.done)}
                                        className={`mt-0.5 shrink-0 rounded-lg p-1 transition-colors ${t.done ? 'text-emerald-400' : 'text-slate-500 hover:text-white'}`}
                                    >
                                        {t.done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium leading-relaxed transition-all ${t.done ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                                            {t.text}
                                        </p>
                                        {t.originDateKey && t.originDateKey !== selectedDateKey && (
                                            <span className="inline-block mt-2 text-[10px] font-black uppercase tracking-[0.1em] text-amber-500/60 transition-colors">
                                                Carried from {formatKeyDMY(t.originDateKey)}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => deleteTodo(t.id)}
                                        className="shrink-0 p-1 rounded-lg text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 text-center">
                                <p className="text-xs font-black uppercase tracking-widest text-slate-600">No priority tasks found</p>
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-white/5 border-t border-white/5 p-4 text-center">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Unfinished tasks auto-carry to next day</p>
                    </div>
                </div>
            </section>
        </div>
      </div>
    </div>
    </div>
  );
}
