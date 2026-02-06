import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import questionsCss from '../legacy/questions.css?raw';
import { useLegacyStyle } from '../legacy/useLegacyStyle';
import { useAuth } from '../auth/AuthContext.jsx';

const DEFAULT_DATA = { questions: [], practiceLogs: [], topics: {} };

function statusSlug(status) {
  return String(status || 'Not Started').toLowerCase().replace(/\s+/g, '-');
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calculateSuccessRate(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return 0;
  const successful = logs.filter((log) => log.solvedWithoutHelp).length;
  return Math.round((successful / logs.length) * 100);
}

function calculateTopicStats(questions, topicKey) {
  const topicQuestions = questions.filter((q) => q.topic === topicKey);
  const completed = topicQuestions.filter((q) => q.status === 'Completed' || q.status === 'Mastered').length;
  const mastered = topicQuestions.filter((q) => q.status === 'Mastered').length;
  return {
    total: topicQuestions.length,
    completed,
    mastered,
    completionRate: topicQuestions.length ? (completed / topicQuestions.length) * 100 : 0,
  };
}

export default function Questions() {
  const [searchParams] = useSearchParams();
  const { isLoggedIn } = useAuth();

  useLegacyStyle('questions', questionsCss);

  const [data, setData] = useState(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sheet1');

  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');

  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [practiceQuestionId, setPracticeQuestionId] = useState(null);

  const [practiceTimeTaken, setPracticeTimeTaken] = useState('');
  const [practiceSolvedWithoutHelp, setPracticeSolvedWithoutHelp] = useState(false);
  const [practiceNotes, setPracticeNotes] = useState('');

  const [notifications, setNotifications] = useState([]);
  const [showOverlay, setShowOverlay] = useState(false);

  function notify(message, type = 'info') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotifications((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  }

  async function refreshData() {
    const json = await apiGet('/api/data');
    setData({
      questions: Array.isArray(json?.questions) ? json.questions : [],
      practiceLogs: Array.isArray(json?.practiceLogs) ? json.practiceLogs : [],
      topics: json?.topics && typeof json.topics === 'object' ? json.topics : {},
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await refreshData();
      } catch (e) {
        if (!cancelled) {
          notify(e?.message || 'Error loading data', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const topicParam = String(searchParams.get('topic') || '').toLowerCase();
    if (!topicParam) return;

    const map = {
      arrays: 'Arrays',
      linkedlist: 'Linked List',
      trees: 'Trees',
      dp: 'Dynamic Programming',
      sorting: 'Sorting Techniques',
    };

    const mapped = map[topicParam];
    if (mapped) {
      setTopic(mapped);
      setActiveTab('sheet1');
      return;
    }

    setSearch(topicParam);
    setActiveTab('sheet1');
  }, [searchParams]);

  const topicsForFilter = useMemo(() => {
    const set = new Set();
    (data.questions || []).forEach((q) => {
      if (q?.topic) set.add(String(q.topic));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.questions]);

  const filteredQuestions = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return (data.questions || []).filter((q) => {
      const matchesSearch = !searchTerm || String(q.title || '').toLowerCase().includes(searchTerm);
      const matchesTopic = !topic || q.topic === topic;
      const matchesDifficulty = !difficulty || q.difficulty === difficulty;
      const matchesStatus = !status || q.status === status;
      return matchesSearch && matchesTopic && matchesDifficulty && matchesStatus;
    });
  }, [data.questions, difficulty, search, status, topic]);

  const selectedQuestion = useMemo(
    () => (data.questions || []).find((q) => q.id === selectedQuestionId) || null,
    [data.questions, selectedQuestionId]
  );

  const practiceQuestion = useMemo(
    () => (data.questions || []).find((q) => q.id === practiceQuestionId) || null,
    [data.questions, practiceQuestionId]
  );

  useEffect(() => {
    if (!selectedQuestion) return;
    window.setTimeout(() => {
      try {
        window.hljs?.highlightAll?.();
      } catch {
        // ignore
      }
    }, 0);
  }, [selectedQuestion]);

  async function submitPractice(e) {
    e.preventDefault();
    if (!practiceQuestion) return;

    const timeTaken = Number.parseInt(practiceTimeTaken, 10);
    if (!Number.isFinite(timeTaken) || timeTaken <= 0) {
      notify('Please enter a valid time taken (minutes).', 'error');
      return;
    }

    setShowOverlay(true);
    try {
      await apiPost('/api/practice', {
        questionId: practiceQuestion.id,
        timeTaken,
        solvedWithoutHelp: Boolean(practiceSolvedWithoutHelp),
        notes: practiceNotes || '',
        date: new Date().toISOString(),
      });

      await refreshData();
      setPracticeQuestionId(null);
      setPracticeTimeTaken('');
      setPracticeSolvedWithoutHelp(false);
      setPracticeNotes('');
      notify('Practice session saved successfully!', 'success');
    } catch (e2) {
      notify(e2?.message || 'Error saving practice session', 'error');
    } finally {
      setShowOverlay(false);
    }
  }

  return (
    <div className="legacy-questions-root">
      <div className="container">
      <div className="content-tabs">
        <button
          className={`content-tab ${activeTab === 'sheet1' ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveTab('sheet1')}
        >
          <i className="fas fa-list"></i> Master Question List
        </button>
        <button
          className={`content-tab ${activeTab === 'sheet2' ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveTab('sheet2')}
        >
          <i className="fas fa-folder"></i> Topic-wise Details
        </button>
        <button
          className={`content-tab ${activeTab === 'sheet3' ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveTab('sheet3')}
        >
          <i className="fas fa-history"></i> Practice Log
        </button>
        <button
          className={`content-tab ${activeTab === 'sheet4' ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveTab('sheet4')}
        >
          <i className="fas fa-chart-pie"></i> Topic Summary
        </button>
      </div>

      <div id="sheet1" className={`content-section ${activeTab === 'sheet1' ? 'active' : ''}`}>
        <div className="controls">
          <div className="search-filters">
            <div className="filter-group">
              <i className="fas fa-search"></i>
              <input
                type="text"
                className="filter-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions..."
              />
            </div>
            <div className="filter-group">
              <i className="fas fa-folder"></i>
              <select className="filter-input" value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">All Topics</option>
                {topicsForFilter.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <i className="fas fa-signal"></i>
              <select
                className="filter-input"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            <div className="filter-group">
              <i className="fas fa-tasks"></i>
              <select className="filter-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All Status</option>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Mastered">Mastered</option>
              </select>
            </div>

            {isLoggedIn ? (
              <Link to="/add" className="add-question-btn" style={{ textDecoration: 'none' }}>
                <i className="fas fa-plus"></i> Add Question
              </Link>
            ) : null}
          </div>
        </div>

        <div className="questions-grid" id="questionsGrid">
          {!loading && filteredQuestions.length === 0 ? (
            <div style={{ padding: 12 }}>No questions found.</div>
          ) : null}

          {filteredQuestions.map((question) => (
            <div className="question-card" data-id={question.id} key={question.id}>
              <div className="question-header">
                <h3 className="question-title">{question.title}</h3>
                <span className={`difficulty-badge difficulty-${question.difficulty}`}>{question.difficulty}</span>
              </div>

              <div className="tags-container">
                {question.topic ? <span className="tag">{question.topic}</span> : null}
                {question.subTopic ? <span className="tag">{question.subTopic}</span> : null}
              </div>

              <div className="confidence-meter">
                <div className={`confidence-level confidence-${question.confidence || 1}`}></div>
              </div>

              <div className="question-footer">
                <div className="status-indicator">
                  <i className={`fas fa-circle status-${statusSlug(question.status)}`}></i>
                  {question.status || 'Not Started'}
                </div>

                <div className="action-buttons">
                  <button
                    type="button"
                    className="action-button view-btn"
                    onClick={() => setSelectedQuestionId(question.id)}
                  >
                    <i className="fas fa-eye"></i> View
                  </button>
                  <button
                    type="button"
                    className="action-button practice-btn"
                    onClick={() => {
                      setPracticeQuestionId(question.id);
                      setPracticeTimeTaken('');
                      setPracticeSolvedWithoutHelp(false);
                      setPracticeNotes('');
                    }}
                  >
                    <i className="fas fa-play"></i> Practice
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div id="sheet2" className={`content-section ${activeTab === 'sheet2' ? 'active' : ''}`}>
        <div className="topic-grid" id="topicGrid">
          {Object.entries(data.topics || {}).map(([key, topicDef]) => {
            const stats = calculateTopicStats(data.questions || [], key);
            return (
              <div className="topic-card" key={key}>
                <div className="topic-header">
                  <h3>{topicDef?.name || key}</h3>
                  <div className="topic-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${stats.completionRate}%` }}></div>
                    </div>
                    <span>{Math.round(stats.completionRate)}% Complete</span>
                  </div>
                </div>
                <div className="subtopics-list">
                  {(topicDef?.subTopics || []).map((sub) => (
                    <div className="subtopic-item" key={sub}>
                      <i className="fas fa-chevron-right"></i>
                      {sub}
                    </div>
                  ))}
                </div>
                <div className="topic-stats">
                  <div className="stat-item">
                    <span>Questions: {stats.total}</span>
                  </div>
                  <div className="stat-item">
                    <span>Mastered: {stats.mastered}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div id="sheet3" className={`content-section ${activeTab === 'sheet3' ? 'active' : ''}`}>
        <div className="practice-log" id="practiceLog">
          <div className="practice-summary">
            <h3>Practice Summary</h3>
            <div className="summary-stats">
              <div className="stat-item">
                <span>Total Sessions: {(data.practiceLogs || []).length}</span>
              </div>
              <div className="stat-item">
                <span>Success Rate: {calculateSuccessRate(data.practiceLogs || [])}%</span>
              </div>
            </div>
          </div>

          <div className="practice-entries">
            {[...(data.practiceLogs || [])]
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((log) => {
                const q = (data.questions || []).find((qq) => qq.id === log.questionId);
                const difficultyLabel = q?.difficulty || 'Unknown';
                return (
                  <div
                    key={log.id || `${log.questionId}-${log.date}`}
                    className={`log-entry ${log.solvedWithoutHelp ? 'success' : 'needs-practice'}`}
                  >
                    <div className="log-header">
                      <div className="log-title">
                        <strong>{q?.title || 'Unknown Question'}</strong>
                        <span className={`difficulty-badge difficulty-${difficultyLabel}`}>{difficultyLabel}</span>
                      </div>
                      <span className="log-date">{formatDate(log.date)}</span>
                    </div>
                    <div className="log-details">
                      <div className="log-stat">
                        <i className="fas fa-clock"></i>
                        Time: {log.timeTaken} minutes
                      </div>
                      <div className="log-stat">
                        <i className={`fas ${log.solvedWithoutHelp ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        {log.solvedWithoutHelp ? 'Solved Independently' : 'Needed Help'}
                      </div>
                    </div>
                    {log.notes ? (
                      <div className="log-notes">
                        <i className="fas fa-sticky-note"></i>
                        {log.notes}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div id="sheet4" className={`content-section ${activeTab === 'sheet4' ? 'active' : ''}`}>
        <div className="topic-summary" id="topicSummary">
          {Object.entries(data.topics || {}).map(([key, topicDef]) => {
            const stats = calculateTopicStats(data.questions || [], key);
            return (
              <div className="summary-card" key={key}>
                <h3>{topicDef?.name || key}</h3>
                <div className="progress-section">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${stats.completionRate}%` }}></div>
                  </div>
                  <span>{Math.round(stats.completionRate)}% Complete</span>
                </div>
                <div className="summary-stats">
                  <div className="stat-row">
                    <span>Total Questions:</span>
                    <span>{stats.total}</span>
                  </div>
                  <div className="stat-row">
                    <span>Completed:</span>
                    <span>{stats.completed}</span>
                  </div>
                  <div className="stat-row">
                    <span>Mastered:</span>
                    <span>{stats.mastered}</span>
                  </div>
                </div>
                <div className="patterns-section">
                  <h4>Common Patterns</h4>
                  <ul>
                    {(topicDef?.patterns || []).map((pattern) => (
                      <li key={pattern}>{pattern}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedQuestion ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedQuestionId(null);
          }}
        >
          <div className="w-[min(920px,calc(100vw-2rem))]">
            <div className="max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-8">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm text-slate-300">Question</p>
                  <p className="mt-1 text-xl font-semibold text-white">{selectedQuestion.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedQuestionId(null)}
                  className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Problem Information</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="text-sm text-slate-200">
                      <span className="text-slate-400">Difficulty:</span>{' '}
                      <span className="font-semibold text-white">{selectedQuestion.difficulty}</span>
                    </div>
                    <div className="text-sm text-slate-200">
                      <span className="text-slate-400">Topic:</span>{' '}
                      <span className="font-semibold text-white">{selectedQuestion.topic || '—'}</span>
                    </div>
                    <div className="text-sm text-slate-200">
                      <span className="text-slate-400">Status:</span>{' '}
                      <span className="font-semibold text-white">{selectedQuestion.status || 'Not Started'}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Core Concept</p>
                  <p className="mt-2 text-sm text-slate-200/90">{selectedQuestion.coreConcept || 'Not specified'}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Approach / Intuition</p>
                  <p className="mt-2 text-sm text-slate-200/90">
                    {Array.isArray(selectedQuestion.approach)
                      ? selectedQuestion.approach.filter(Boolean).join(', ')
                      : selectedQuestion.approach || 'Not specified'}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Code Template</p>
                  <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-100">
                    <code className="language-javascript">
                      {selectedQuestion.codeTemplate || '// No template available'}
                    </code>
                  </pre>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Common Pitfalls</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200/90">
                    {(Array.isArray(selectedQuestion.commonPitfalls) ? selectedQuestion.commonPitfalls : [])
                      .filter(Boolean)
                      .map((pitfall, idx) => (
                        <li key={`${pitfall}-${idx}`}>{pitfall}</li>
                      ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedQuestionId(null);
                    setPracticeQuestionId(selectedQuestion.id);
                  }}
                  className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                >
                  Start Practice
                </button>
                <a
                  href={selectedQuestion.link}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                >
                  View Problem
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {practiceQuestion ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPracticeQuestionId(null);
          }}
        >
          <div className="w-[min(920px,calc(100vw-2rem))]">
            <div className="max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-8">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm text-slate-300">Practice Session</p>
                  <p className="mt-1 text-xl font-semibold text-white">{practiceQuestion.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPracticeQuestionId(null)}
                  className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <form onSubmit={submitPractice} className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <label className="block text-sm font-semibold text-white">Time Taken (minutes)</label>
                  <input
                    type="number"
                    name="timeTaken"
                    required
                    min="1"
                    value={practiceTimeTaken}
                    onChange={(e) => setPracticeTimeTaken(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-white/20"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <label className="flex items-center gap-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      name="solvedWithoutHelp"
                      checked={practiceSolvedWithoutHelp}
                      onChange={(e) => setPracticeSolvedWithoutHelp(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-black/30"
                    />
                    <span className="font-semibold text-white">Solved Without Help</span>
                  </label>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <label className="block text-sm font-semibold text-white">Notes</label>
                  <textarea
                    name="notes"
                    rows="4"
                    value={practiceNotes}
                    onChange={(e) => setPracticeNotes(e.target.value)}
                    className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-white/20"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Save Practice Session
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {notifications.map((n) => (
        <div key={n.id} className={`notification ${n.type}`}>
          <i className={`fas ${n.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span>{n.message}</span>
        </div>
      ))}

      {loading || showOverlay ? (
        <div className="loading-overlay" id="loadingOverlay" style={{ display: 'flex' }}>
          <div className="loading-spinner"></div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
