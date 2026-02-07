import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import homeCss from '../legacy/home.css?raw';
import { useLegacyStyle } from '../legacy/useLegacyStyle';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet } from '../lib/api.js';
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

export default function Home() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  useLegacyStyle('home', homeCss);

  const [revTodayTotal, setRevTodayTotal] = useState(0);
  const [revTodayDue, setRevTodayDue] = useState(0);
  const [revWeekTotal, setRevWeekTotal] = useState(0);
  const [revWeekEndsAtMs, setRevWeekEndsAtMs] = useState(null);

  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll('.feature-card, .topic-card'));
    cards.forEach((card) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      card.style.transition = 'all 0.6s ease';
    });

    const timeouts = cards.map((card, i) =>
      setTimeout(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, 120 + i * 120),
    );

    return () => {
      timeouts.forEach((x) => clearTimeout(x));
    };
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
    return `Week bucket: ${revWeekTotal} question(s)`;
  }, [isLoggedIn, revTodayDue, revTodayTotal, revWeekTotal]);

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

  const contestCountdown = useMemo(() => {
    const startsAt = nextContest?.startsAtUtc?.getTime();
    if (!Number.isFinite(startsAt)) return null;
    return formatCountdownDHMS(startsAt - nowTick);
  }, [nextContest, nowTick]);

  const contestStartsAtLabel = useMemo(() => {
    if (!nextContest?.startsAtUtc) return '';
    return formatContestStartsAtIST(nextContest.startsAtUtc);
  }, [nextContest]);

  return (
    <>
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Data Structures and Algorithms </h1>
          <p className="hero-subtitle">
            Your ultimate destination for Data Structures and Algorithms mastery.
            Practice, Learn, and Dominate!
          </p>
          <div className="cta-buttons">
            <button
              type="button"
              onClick={() => navigate('/questions')}
              className="cta-button primary-button"
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
            <h3 className="feature-title">Upcoming Contest Registered</h3>
            <p className="feature-description">
              {CONTEST_SCHEDULE_TEXT}
              {nextContest?.title && contestStartsAtLabel ? ` • Next: ${nextContest.title} (${contestStartsAtLabel})` : ''}
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
        </div>
      </section>

      <section id="topics" className="topics-section">
        <h2 className="section-title">Master These Topics</h2>
        <div className="topics-grid">
          <div className="topic-card" onClick={() => navigate('/questions?topic=arrays')}>
            <h3 className="topic-title">Arrays &amp; Strings</h3>
            <p className="topic-description">Master fundamental array manipulations and string algorithms.</p>
          </div>
          <div className="topic-card" onClick={() => navigate('/questions?topic=linkedlist')}>
            <h3 className="topic-title">Linked Lists</h3>
            <p className="topic-description">Deep dive into linked list problems and patterns.</p>
          </div>
          <div className="topic-card" onClick={() => navigate('/questions?topic=trees')}>
            <h3 className="topic-title">Trees &amp; Graphs</h3>
            <p className="topic-description">Explore tree traversals and graph algorithms.</p>
          </div>
          <div className="topic-card" onClick={() => navigate('/questions?topic=dp')}>
            <h3 className="topic-title">Dynamic Programming</h3>
            <p className="topic-description">Master the art of solving complex DP problems.</p>
          </div>
          <div className="topic-card" onClick={() => navigate('/questions?topic=sorting')}>
            <h3 className="topic-title">Sorting &amp; Searching</h3>
            <p className="topic-description">Learn efficient sorting and searching techniques.</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-content">
          <p className="footer-text">Built with ❤️ for DSA Enthusiasts</p>
          <div className="social-links">
            <a href="https://github.com/shivaapratim" className="social-link">
              <i className="fab fa-github"></i>
            </a>
            <a href="https://www.linkedin.com/in/shivang-shukla-872712252/" className="social-link">
              <i className="fab fa-linkedin"></i>
            </a>
            <a href="#" className="social-link">
              <i className="fab fa-twitter"></i>
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
