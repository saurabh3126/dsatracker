import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import homeCss from '../legacy/home.css?raw';
import { useLegacyStyle } from '../legacy/useLegacyStyle';
import { useAuth } from '../auth/AuthContext.jsx';
import LoadingIndicator from '../components/LoadingIndicator.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import {
  CONTEST_SCHEDULE_TEXT,
  formatContestStartsAtIST,
  getNextContestIST,
} from '../utils/contestSchedule.js';

function getUpcomingWeeklyResetMs(nowMs) {
  // Weekly reset: Sunday 5:30 AM IST == Sunday 00:00 UTC.
  // Compute next Sunday 00:00 UTC strictly after now.
  const now = new Date(nowMs);
  if (Number.isNaN(now.getTime())) return NaN;

  const base = new Date(now);
  base.setUTCHours(0, 0, 0, 0);
  const day = base.getUTCDay(); // 0=Sun
  const daysUntilSunday = (7 - day) % 7;
  let sundayStartMs = base.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000;
  if (sundayStartMs <= now.getTime()) sundayStartMs += 7 * 24 * 60 * 60 * 1000;
  return sundayStartMs;
}

function pad2(n) {
  return String(Math.max(0, Number(n) || 0)).padStart(2, '0');
}

function formatCountdownDHMS(msRemaining) {
  if (!Number.isFinite(msRemaining)) return '--';
  if (msRemaining <= 0) return '00h 00m 00s';

  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`;
  return `${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`;
}

function getISTParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  // IST = UTC+05:30
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
  };
}

function istDateKey(date = new Date()) {
  const p = getISTParts(date);
  if (!p) return '';
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export default function Home() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();

  useLegacyStyle('home', homeCss);

  const [revTodayTotal, setRevTodayTotal] = useState(0);
  const [revTodayDue, setRevTodayDue] = useState(0);
  const [revWeekTotal, setRevWeekTotal] = useState(0);
  const [revWeekEndsAtMs, setRevWeekEndsAtMs] = useState(null);

  const [nowTick, setNowTick] = useState(() => Date.now());

  const [todos, setTodos] = useState([]);
  const [feedback, setFeedback] = useState({ type: 'Suggestion', message: '' });
  const [feedbackStatus, setFeedbackStatus] = useState(''); // '', 'sending', 'sent'
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setTodos([]);
      return;
    }
    const key = `dsa_todo_${istDateKey(new Date())}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        setTodos(JSON.parse(raw));
      } catch {
        setTodos([]);
      }
    }
  }, [isLoggedIn]);

  const saveTodos = (newTodos) => {
    setTodos(newTodos);
    const key = `dsa_todo_${istDateKey(new Date())}`;
    localStorage.setItem(key, JSON.stringify(newTodos));
  };

  const toggleTodo = (id) => {
    const next = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    saveTodos(next);
  };

  const deleteTodo = (id) => {
    const next = todos.filter((t) => t.id !== id);
    saveTodos(next);
  };

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!isLoggedIn) {
      setRevTodayTotal(0);
      setRevTodayDue(0);
      setRevWeekTotal(0);
      setRevWeekEndsAtMs(null);
      return;
    }

    let cancelled = false;

    apiGet('/api/revision/summary')
      .then((summary) => {
        if (cancelled) return;
        const week = Array.isArray(summary?.week) ? summary.week : [];

        // Home card is weekly-only.
        setRevTodayTotal(0);
        setRevTodayDue(0);
        setRevWeekTotal(week.length);

        // Align the countdown with the backend's actual week bucket due date.
        const dueTimes = week
          .map((it) => new Date(it?.bucketDueAt || 0).getTime())
          .filter((t) => Number.isFinite(t) && t > 0);
        setRevWeekEndsAtMs(dueTimes.length ? Math.min(...dueTimes) : null);
      })
      .catch(() => {
        // ignore
      });

    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isLoggedIn]);

  const revisionSubtitle = useMemo(() => {
    if (!isLoggedIn) return 'Log in to see your upcoming revision session.';
    if (!revWeekTotal) return 'No weekly revision items yet. Add some from Revision.';
    return `Weekly revision: ${revWeekTotal} question(s)`;
  }, [isLoggedIn, revWeekTotal]);

  const revisionCountdown = useMemo(() => {
    if (Number.isFinite(revWeekEndsAtMs)) {
      return formatCountdownDHMS(revWeekEndsAtMs - nowTick);
    }
    const nextResetMs = getUpcomingWeeklyResetMs(nowTick);
    if (!Number.isFinite(nextResetMs)) return '--';
    return formatCountdownDHMS(nextResetMs - nowTick);
  }, [nowTick, revWeekEndsAtMs]);

  const nextContest = useMemo(() => {
    return getNextContestIST(new Date(nowTick));
  }, [nowTick]);

  const contestStartsAtLabel = useMemo(() => {
    if (!nextContest?.startsAtUtc) return '';
    return formatContestStartsAtIST(nextContest.startsAtUtc);
  }, [nextContest]);

  const contestCountdown = useMemo(() => {
    if (!nextContest?.startsAtUtc) return '';
    const startsAtMs = new Date(nextContest.startsAtUtc).getTime();
    if (!Number.isFinite(startsAtMs)) return '';
    return formatCountdownDHMS(startsAtMs - nowTick);
  }, [nextContest, nowTick]);

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!isLoggedIn) {
      setFeedbackStatus('login');
      setTimeout(() => setFeedbackStatus(''), 3000);
      return;
    }
    if (!feedback.message.trim()) return;
    
    setFeedbackStatus('sending');

    async function sendFeedbackViaWeb3Forms() {
      const accessKey = String(import.meta.env.VITE_WEB3FORMS_ACCESS_KEY || '').trim();
      if (!accessKey) {
        const err = new Error('Email notifications are not configured (missing VITE_WEB3FORMS_ACCESS_KEY).');
        err.code = 'WEB3FORMS_KEY_MISSING';
        throw err;
      }

      const payload = {
        access_key: accessKey,
        subject: `DSA Tracker: ${String(feedback.type || 'Feedback').trim()}`,
        from_name: String(user?.name || 'DSA Tracker').trim(),
        name: String(user?.name || 'User').trim(),
        email: String(user?.email || '').trim(),
        message: `Type: ${feedback.type}\nUser: ${user?.name || 'User'}${user?.email ? ` <${user.email}>` : ''}\n\n${feedback.message}`,
      };

      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const msg = String(json?.message || res.statusText || `Web3Forms failed: ${res.status}`).trim();
        const err = new Error(msg);
        err.status = res.status;
        err.provider = 'web3forms';
        throw err;
      }

      return json;
    }
    
    try {
      await apiPost('/api/feedback', feedback);

      // Web3Forms is expected to be called from the client (browser). If you don't
      // set VITE_WEB3FORMS_ACCESS_KEY, we still save feedback but will show an error.
      try {
        await sendFeedbackViaWeb3Forms();
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
        setFeedbackStatus('error');
        setTimeout(() => setFeedbackStatus(''), 5000);
        return;
      }

      setFeedbackStatus('sent');
      setFeedback({ type: 'Suggestion', message: '' });
      setTimeout(() => setFeedbackStatus(''), 3000);
    } catch (err) {
      console.error('Feedback failed:', err);
      setFeedbackStatus('error');
      setTimeout(() => setFeedbackStatus(''), 3000);
    }
  };

  return (
    <div className="home-page flex flex-col">
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      <main className="home-main flex-1">
        <section className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">
              Data Structures and <span className="text-amber-500">Algorithms</span>
            </h1>
            <p className="hero-subtitle">
              Your ultimate destination for Data Structures and Algorithms mastery.
              Practice, Learn, and Dominate!
            </p>
            <div className="cta-buttons">
              <button
                type="button"
                onClick={() => navigate('/questions')}
                className="cta-button primary-button shadow-[0_0_30px_rgba(245,158,11,0.2)]"
              >
                <i className="fas fa-rocket"></i>
                Start Practice
              </button>
              <button
                type="button"
                onClick={() => document.querySelector('#topics')?.scrollIntoView({ behavior: 'smooth' })}
                className="cta-button secondary-button"
              >
                <i className="fas fa-book"></i>
                Explore Topics
              </button>
            </div>
          </div>
        </section>

        <section className="features-section">
          <div className="features-grid">
            <div className="feature-card">
              <i className="fas fa-calendar-check feature-icon"></i>
              <h3 className="feature-title">Upcoming Revision Session</h3>
              <p className="feature-description">{revisionSubtitle}</p>

              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ opacity: 0.9, fontSize: 'clamp(13px, 2.5vw, 14px)' }}>Time left this week</div>
                <div style={{ fontWeight: 800, letterSpacing: 0.8, fontSize: 'clamp(16px, 4vw, 18px)' }}>{revisionCountdown}</div>
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => navigate('/today')} className="cta-button secondary-button">
                  <i className="fas fa-list-check"></i>
                  View Today
                </button>
                {isLoggedIn ? (
                  <button type="button" onClick={() => navigate('/revision')} className="cta-button primary-button">
                    <i className="fas fa-rotate"></i>
                    Open Revision
                  </button>
                ) : null}
              </div>
            </div>

            <div className="feature-card">
              <i className="fas fa-trophy feature-icon"></i>
              <h3 className="feature-title">Upcoming Contest</h3>
              <p className="feature-description">
                {nextContest?.title && contestStartsAtLabel 
                  ? `${nextContest.title} (Starts At: ${contestStartsAtLabel})` 
                  : 'Checking for upcoming contests...'}
              </p>

              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ opacity: 0.9, fontSize: 'clamp(13px, 2.5vw, 14px)' }}>Countdown</div>
                <div style={{ fontWeight: 800, letterSpacing: 0.8, fontSize: 'clamp(16px, 4vw, 18px)' }}>{contestCountdown || '--:--:--'}</div>
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a
                  className="cta-button secondary-button"
                  href="https://leetcode.com/contest/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <i className="fas fa-external-link-alt"></i>
                  Open Contests
                </a>
              </div>
            </div>

            {isLoggedIn && (
              <div className="feature-card" style={{ minHeight: '300px' }}>
                <i className="fas fa-list-check feature-icon"></i>
                <h3 className="feature-title">Your To-dos (Today)</h3>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {todos.length > 0 ? (
                    todos.map((todo) => (
                      <div
                        key={todo.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            flex: 1,
                          }}
                          onClick={() => toggleTodo(todo.id)}
                        >
                          {todo.done ? (
                            <i className="fas fa-check-circle h-5 w-5 text-emerald-400" style={{ fontSize: '1.25rem' }}></i>
                          ) : (
                            <i className="far fa-circle h-5 w-5 text-slate-500" style={{ fontSize: '1.25rem' }}></i>
                          )}
                          <span
                            style={{
                              fontSize: '14px',
                              color: todo.done ? 'rgba(255,255,255,0.4)' : 'white',
                              textDecoration: todo.done ? 'line-through' : 'none',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {todo.text}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteTodo(todo.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'rgba(255,255,255,0.3)',
                            padding: '4px',
                            transition: 'color 0.2s ease',
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
                          onMouseOut={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                        >
                          <i className="fas fa-trash h-4 w-4"></i>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
                      No tasks for today. Add some from <Link to="/today" className="text-amber-400 no-underline">Today's Task</Link>!
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section id="topics" className="topics-section">
          <h2 className="section-title">Master These Topics</h2>
          <div className="topics-grid">
            <div className="topic-card">
              <h3 className="topic-title">Arrays &amp; Strings</h3>
              <p className="topic-description">Master fundamental array manipulations and string algorithms.</p>
            </div>
            <div className="topic-card">
              <h3 className="topic-title">Linked Lists</h3>
              <p className="topic-description">Deep dive into linked list problems and patterns.</p>
            </div>
            <div className="topic-card">
              <h3 className="topic-title">Trees &amp; Graphs</h3>
              <p className="topic-description">Explore tree traversals and graph algorithms.</p>
            </div>
            <div className="topic-card">
              <h3 className="topic-title">Dynamic Programming</h3>
              <p className="topic-description">Master the art of solving complex DP problems.</p>
            </div>
            <div className="topic-card">
              <h3 className="topic-title">Sorting &amp; Searching</h3>
              <p className="topic-description">Learn efficient sorting and searching techniques.</p>
            </div>
          </div>
        </section>

        <section className="feedback-section" style={{ padding: '60px 20px 80px', maxWidth: '540px', margin: '0 auto' }}>
          <div 
            className="feedback-card-container"
            style={{ 
              background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)', 
              border: '1px solid rgba(255, 255, 255, 0.12)', 
              borderRadius: '28px', 
              padding: '40px 35px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255,255,255,0.08)',
              position: 'relative',
              overflow: 'hidden',
              transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-8px)';
              e.currentTarget.style.boxShadow = '0 40px 80px -15px rgba(107, 115, 255, 0.25)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 30px 60px -15px rgba(0, 0, 0, 0.6)';
            }}
          >
            {/* Top accent line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '5px',
              background: 'linear-gradient(90deg, transparent, #6B73FF, #000DFF, #6B73FF, transparent)'
            }}></div>

            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '10px', color: 'white', textAlign: 'center', letterSpacing: '-0.02em' }}>
                Feedback & Suggestions
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', textAlign: 'center', marginBottom: '35px', maxWidth: '340px', margin: '0 auto 35px', lineHeight: '1.5' }}>
                Your insights help us build the best version of this platform. Share your thoughts with us!
              </p>

              {!isLoggedIn ? (
                <div style={{ textAlign: 'center', margin: '-18px auto 26px', fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>
                  <Link to="/login" style={{ color: '#6B73FF', fontWeight: 700, textDecoration: 'none' }}>
                    Login
                  </Link>{' '}
                  to send message.
                </div>
              ) : null}

              <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#6B73FF', textTransform: 'uppercase', letterSpacing: '0.15em', paddingLeft: '8px' }}>
                    Category
                  </label>
                  
                  {/* Custom Modern Dropdown */}
                  <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
                    <div 
                      onClick={() => {
                        if (!isLoggedIn) return;
                        setIsDropdownOpen(!isDropdownOpen);
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isDropdownOpen ? '#6B73FF' : 'rgba(255,255,255,0.15)'}`,
                        borderRadius: '15px',
                        padding: '14px 20px',
                        color: 'white',
                        fontSize: '14px',
                        cursor: isLoggedIn ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: isDropdownOpen ? '0 0 20px rgba(107, 115, 255, 0.2)' : '0 4px 6px rgba(0,0,0,0.1)',
                        opacity: isLoggedIn ? 1 : 0.75,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {feedback.type === 'Suggestion' && '✨ Feature Suggestion'}
                        {feedback.type === 'Bug Report' && '🐛 Bug / Issue'}
                        {feedback.type === 'Question' && '❓ General Question'}
                        {feedback.type === 'Complaints' && '📢 Complaint'}
                      </span>
                      <i className={`fas fa-chevron-down`} style={{ 
                        fontSize: '12px', 
                        transition: 'transform 0.4s ease', 
                        transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        color: isDropdownOpen ? '#6B73FF' : 'rgba(255,255,255,0.4)'
                      }}></i>
                    </div>

                    {isDropdownOpen && (
                      <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        width: '100%',
                        background: '#0b1220',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '18px',
                        overflow: 'hidden',
                        zIndex: 100,
                        boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(20px)',
                        animation: 'dropdownFadeIn 0.3s ease'
                      }}>
                        <style>{`
                          @keyframes dropdownFadeIn {
                            from { opacity: 0; transform: translateY(-10px); }
                            to { opacity: 1; transform: translateY(0); }
                          }
                          .dropdown-option { 
                            padding: 14px 20px; 
                            cursor: pointer; 
                            transition: all 0.2s ease;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            color: rgba(255,255,255,0.8);
                            font-size: 14px;
                          }
                          .dropdown-option:hover { 
                            background: rgba(107, 115, 255, 0.15); 
                            color: white;
                            padding-left: 26px;
                          }
                          .dropdown-option.selected {
                            background: rgba(107, 115, 255, 0.1);
                            color: #6B73FF;
                            font-weight: 600;
                          }
                        `}</style>
                        <div 
                          className={`dropdown-option ${feedback.type === 'Suggestion' ? 'selected' : ''}`}
                          onClick={() => { setFeedback({ ...feedback, type: 'Suggestion' }); setIsDropdownOpen(false); }}
                        >
                          ✨ Feature Suggestion
                        </div>
                        <div 
                          className={`dropdown-option ${feedback.type === 'Bug Report' ? 'selected' : ''}`}
                          onClick={() => { setFeedback({ ...feedback, type: 'Bug Report' }); setIsDropdownOpen(false); }}
                        >
                          🐛 Bug / Issue
                        </div>
                        <div 
                          className={`dropdown-option ${feedback.type === 'Question' ? 'selected' : ''}`}
                          onClick={() => { setFeedback({ ...feedback, type: 'Question' }); setIsDropdownOpen(false); }}
                        >
                          ❓ General Question
                        </div>
                        <div 
                          className={`dropdown-option ${feedback.type === 'Complaints' ? 'selected' : ''}`}
                          onClick={() => { setFeedback({ ...feedback, type: 'Complaints' }); setIsDropdownOpen(false); }}
                        >
                          📢 Complaint
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#6B73FF', textTransform: 'uppercase', letterSpacing: '0.15em', paddingLeft: '8px' }}>
                    Your Message
                  </label>
                  <div style={{ position: 'relative' }}>
                    <textarea 
                      required
                      disabled={!isLoggedIn}
                      value={feedback.message}
                      onChange={(e) => setFeedback({ ...feedback, message: e.target.value })}
                      placeholder={isLoggedIn ? 'Share your thoughts...' : 'Login to send message...'}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '18px',
                        padding: '18px 20px',
                        color: 'white',
                        outline: 'none',
                        fontSize: '14px',
                        minHeight: '140px',
                        width: '100%',
                        resize: 'none',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        lineHeight: '1.6',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        opacity: isLoggedIn ? 1 : 0.75,
                      }}
                      onFocus={(e) => {
                        if (!isLoggedIn) return;
                        e.target.style.borderColor = '#6B73FF';
                        e.target.style.background = 'rgba(255,255,255,0.08)';
                        e.target.style.boxShadow = '0 0 20px rgba(107, 115, 255, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'rgba(255,255,255,0.15)';
                        e.target.style.background = 'rgba(255,255,255,0.05)';
                        e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                      }}
                    />
                    <div style={{ position: 'absolute', bottom: '15px', right: '15px', color: 'rgba(255,255,255,0.2)', fontSize: '11px', pointerEvents: 'none' }}>
                      <i className="fas fa-pen-nib"></i>
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={feedbackStatus === 'sending' || !isLoggedIn}
                  className="cta-button primary-button"
                  style={{ 
                    width: '100%', 
                    justifyContent: 'center',
                    padding: '16px',
                    borderRadius: '16px',
                    marginTop: '8px',
                    fontSize: '15px',
                    fontWeight: '700',
                    boxShadow: '0 15px 30px -10px rgba(107, 115, 255, 0.4)',
                    opacity: feedbackStatus === 'sending' || !isLoggedIn ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseOver={(e) => {
                    if (feedbackStatus !== 'sending' && isLoggedIn) {
                      e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(107, 115, 255, 0.6)';
                    }
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.boxShadow = '0 15px 30px -10px rgba(107, 115, 255, 0.4)';
                  }}
                >
                  {!isLoggedIn ? (
                    <><i className="fas fa-lock"></i> Login to submit</>
                  ) : feedbackStatus === 'sending' ? (
                    <><LoadingIndicator label="" size="sm" className="flex-row gap-0" /> Sending...</>
                  ) : feedbackStatus === 'sent' ? (
                    <><i className="fas fa-check-circle"></i> Feedback Received!</>
                  ) : feedbackStatus === 'login' ? (
                    <><i className="fas fa-lock"></i> Login required</>
                  ) : feedbackStatus === 'error' ? (
                    <><i className="fas fa-exclamation-circle"></i> Failed to send</>
                  ) : (
                    <><i className="fas fa-paper-plane"></i> Submit Feedback</>
                  )}
                </button>

                {!isLoggedIn ? (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: '12px', marginTop: '-8px' }}>
                    Please log in to send feedback.
                  </div>
                ) : null}
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
