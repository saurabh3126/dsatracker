import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet } from '../lib/api.js';

function difficultyMeta(difficulty) {
  const d = String(difficulty || '').toLowerCase();
  if (d === 'hard') return { label: 'Hard', badge: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' };
  if (d === 'medium') return { label: 'Medium', badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' };
  return { label: 'Easy', badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' };
}

function utcDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

  const [selectedDateKey, setSelectedDateKey] = useState(() => utcDateKey(new Date()));
  const [todoText, setTodoText] = useState('');
  const [todos, setTodos] = useState([]); // [{ id, text, done }]

  useEffect(() => {
    const t = setInterval(() => {
      const next = utcDateKey(new Date());
      setDayKey((prev) => (prev === next ? prev : next));
    }, 30 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Default selectors to "today" if empty.
    setSelectedDateKey((prev) => (prev ? prev : dayKey));
  }, [dayKey]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateKey]);

  function addTodo() {
    const text = String(todoText || '').trim();
    if (!text) return;
    const item = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, done: false };
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
  const taskRemaining = Math.max(0, todayBucket.length - todayCheckedCount);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 text-slate-100">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-400">Today’s Task</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">POTD + Revision Due</h1>
        </div>

        <div className="flex gap-2">
          <Link
            to="/revision"
            className="rounded-xl bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
          >
            Open Revision
          </Link>
          <a
            href={potdLink}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
          >
            Open LeetCode
          </a>
        </div>
      </div>

      {!isAuthed ? (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          You’re not logged in, so this is showing global demo data. Log in to see your personal tasks.
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">Loading…</div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Tasks half */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">POTD</p>
                    <p className="mt-1 text-lg font-semibold text-white">{potdTitle}</p>
                  </div>
                  {potdDifficulty ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ring-1 ${potdDiff.badge}`}>
                      {potdDiff.label}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4">
                  <p className="text-sm">
                    Status:{' '}
                    <span className={potdSolved ? 'text-emerald-300' : 'text-amber-300'}>
                      {potdSolved ? 'Solved' : 'Pending'}
                    </span>
                  </p>
                  {!potdSolved && potdReason ? (
                    <p className="mt-2 text-xs text-slate-300/90">{potdReason}</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm text-slate-400">Tasks today (added by you)</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {taskRemaining} remaining <span className="text-slate-400">/ {todayBucket.length}</span>
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="text-xs text-slate-400">Resets at 5:30 AM IST</div>
                </div>

                <div className="mt-4 space-y-2">
                  {todayBucket.slice(0, 10).map((q) => {
                    const key = `task:${q._id}`;
                    const checked = Boolean(checkedByKey[key]);
                    return (
                      <div
                        key={q._id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 ring-1 ring-white/10"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-400"
                            checked={checked}
                            onChange={(e) => setChecked(key, e.target.checked)}
                            aria-label="Mark considered"
                          />
                          <div className="min-w-0">
                            <p className={'truncate text-sm ' + (checked ? 'text-slate-400 line-through' : 'text-slate-100')}>
                              {q.title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {q.source}:{q.ref}
                            </p>
                          </div>
                        </div>

                        <a
                          href={q.link || (q.source === 'leetcode' ? `https://leetcode.com/problems/${q.ref}/` : '#')}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                        >
                          Open
                        </a>
                      </div>
                    );
                  })}

                  {!todayBucket.length ? <p className="text-sm text-slate-300">No tasks added for today.</p> : null}
                </div>
              </div>
            </div>

            {/* To-do list half */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-400">To-do list</p>
                    <p className="mt-1 text-lg font-semibold text-white">Plan tasks by date</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Date</label>
                    <input
                      type="date"
                      value={selectedDateKey}
                      onChange={(e) => setSelectedDateKey(e.target.value)}
                      className="mt-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Resets at 5:30 AM IST</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={todoText}
                    onChange={(e) => setTodoText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTodo();
                    }}
                    placeholder="Add a task…"
                    className="w-full flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-white/20"
                  />
                  <button
                    type="button"
                    onClick={addTodo}
                    className="rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {todos.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 ring-1 ring-white/10"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-400"
                          checked={Boolean(t.done)}
                          onChange={(e) => toggleTodo(t.id, e.target.checked)}
                          aria-label="Mark done"
                        />
                        <p className={'min-w-0 truncate text-sm ' + (t.done ? 'text-slate-400 line-through' : 'text-slate-100')}>
                          {t.text}
                        </p>
                      </div>

                      {!t.done ? (
                        <button
                          type="button"
                          onClick={() => deleteTodo(t.id)}
                          className="shrink-0 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-rose-200 ring-1 ring-white/10 hover:bg-white/10"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ))}

                  {!todos.length ? <p className="text-sm text-slate-300">No tasks for this date.</p> : null}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
