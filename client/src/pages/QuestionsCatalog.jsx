import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/api';
import questionsCss from '../legacy/questions.css?raw';
import { useLegacyStyle } from '../legacy/useLegacyStyle';
import { useAuth } from '../auth/AuthContext.jsx';

function normalizeDifficulty(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (v === 'easy') return 'Easy';
  if (v === 'medium') return 'Medium';
  if (v === 'hard') return 'Hard';
  return '';
}

function formatAcceptanceRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  if (pct < 0 || pct > 1000) return '';
  return `${pct.toFixed(1)}%`;
}

export default function QuestionsCatalog() {
  const [searchParams] = useSearchParams();
  const { isLoggedIn } = useAuth();

  useLegacyStyle('questions', questionsCss);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('leetcode'); // leetcode | your

  const [topics, setTopics] = useState([]);

  const [selectedTopicKey, setSelectedTopicKey] = useState('arrays');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [leetcodeItems, setLeetcodeItems] = useState([]);
  const [leetcodeTotal, setLeetcodeTotal] = useState(0);
  const [leetcodeSkip, setLeetcodeSkip] = useState(0);
  const [leetcodeHasMore, setLeetcodeHasMore] = useState(false);

  const [yourQuestions, setYourQuestions] = useState([]);
  const [yourSelectedTopic, setYourSelectedTopic] = useState('');

  const [selectedItem, setSelectedItem] = useState(null);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [selectedDetails, setSelectedDetails] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [showOverlay, setShowOverlay] = useState(false);

  function notify(message, type = 'info') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotifications((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 3000);
  }

  const viewItems = useMemo(() => {
    const base = leetcodeItems.map((q) => ({ ...q, __source: 'LeetCode' }));
    if (!sort) return base;

    const dir = sort === 'ac_asc' ? 1 : sort === 'ac_desc' ? -1 : 0;
    if (!dir) return base;

    return [...base].sort((a, b) => {
      const av = Number.isFinite(Number(a?.acceptanceRate)) ? Number(a.acceptanceRate) : null;
      const bv = Number.isFinite(Number(b?.acceptanceRate)) ? Number(b.acceptanceRate) : null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * (av - bv);
    });
  }, [leetcodeItems, sort]);

  const viewTotal = useMemo(() => leetcodeTotal || leetcodeItems.length, [leetcodeItems.length, leetcodeTotal]);

  useEffect(() => {
    const tab = String(searchParams.get('tab') || '').toLowerCase();
    const topicParam = String(searchParams.get('topic') || '').toLowerCase();
    const diffParam = normalizeDifficulty(searchParams.get('difficulty'));

    if (tab === 'leetcode' || tab === 'your') setActiveTab(tab);
    if (topicParam) setSelectedTopicKey(topicParam);
    if (diffParam) setDifficulty(diffParam);
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== 'your') return;

    let cancelled = false;
    setShowOverlay(true);

    (async () => {
      try {
        const data = await apiGet('/api/data');
        if (cancelled) return;

        const list = Array.isArray(data?.questions) ? data.questions : [];
        setYourQuestions(list);

        const topicNames = Array.from(
          new Set(
            list
              .map((q) => String(q?.topic || '').trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));

        // Default to first topic only if none selected.
        if (!yourSelectedTopic && topicNames.length) {
          setYourSelectedTopic(topicNames[0]);
        }
      } catch (e) {
        if (!cancelled) notify(e?.message || 'Error loading your questions', 'error');
        if (!cancelled) setYourQuestions([]);
      } finally {
        if (!cancelled) setShowOverlay(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const t = await apiGet('/api/catalog/topics');

        if (cancelled) return;

        const list = Array.isArray(t?.topics) ? t.topics : [];
        setTopics(list);

        if (list.length && !list.some((x) => x.key === selectedTopicKey)) {
          setSelectedTopicKey(list[0].key);
        }
      } catch (e) {
        if (!cancelled) notify(e?.message || 'Error loading topics', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLeetCode({ reset }) {
    const base = '/api/catalog/leetcode/questions';
    const params = new URLSearchParams();
    params.set('topic', selectedTopicKey);
    if (difficulty) params.set('difficulty', difficulty);
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

    const nextSkip = reset ? 0 : leetcodeSkip;
    params.set('limit', '50');
    params.set('skip', String(nextSkip));

    try {
      const json = await apiGet(`${base}?${params.toString()}`);
      const nextItems = Array.isArray(json?.items) ? json.items : [];

      if (reset) setLeetcodeItems(nextItems);
      else setLeetcodeItems((prev) => [...prev, ...nextItems]);

      setLeetcodeTotal(Number(json?.total || 0));
      setLeetcodeHasMore(Boolean(json?.hasMore));
      setLeetcodeSkip(nextSkip + nextItems.length);
    } catch (e) {
      notify(e?.message || 'Error loading LeetCode questions', 'error');
      if (reset) {
        setLeetcodeItems([]);
        setLeetcodeTotal(0);
        setLeetcodeHasMore(false);
        setLeetcodeSkip(0);
      }
    }
  }

  useEffect(() => {
    if (!topics.length) return;
    if (!selectedTopicKey) return;

    const exists = topics.some((t) => t.key === selectedTopicKey);
    if (!exists) {
      setSelectedTopicKey(topics[0].key);
      return;
    }

    if (activeTab === 'your') return;

    setShowOverlay(true);
    (async () => {
      try {
        // reset
        setLeetcodeItems([]);
        setLeetcodeTotal(0);
        setLeetcodeHasMore(false);
        setLeetcodeSkip(0);

        await loadLeetCode({ reset: true });
      } finally {
        setShowOverlay(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedTopicKey, difficulty, debouncedSearch, topics.length]);

  const yourTopics = useMemo(() => {
    const names = Array.from(
      new Set(
        yourQuestions
          .map((q) => String(q?.topic || '').trim())
          .filter(Boolean)
      )
    );
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [yourQuestions]);

  const filteredYourItems = useMemo(() => {
    let items = Array.isArray(yourQuestions) ? yourQuestions : [];

    if (yourSelectedTopic) {
      items = items.filter((q) => String(q?.topic || '').trim() === yourSelectedTopic);
    }

    if (difficulty) {
      items = items.filter((q) => String(q?.difficulty || '').trim() === difficulty);
    }

    const q = String(debouncedSearch || '').trim().toLowerCase();
    if (q) {
      items = items.filter((x) => {
        const title = String(x?.title || '').toLowerCase();
        const link = String(x?.link || '').toLowerCase();
        return title.includes(q) || link.includes(q);
      });
    }

    // Normalize to the same shape the card renderer expects.
    return items.map((x) => ({
      __source: 'Your Questions',
      title: x?.title,
      slug: x?.slug || x?.id || x?.title,
      difficulty: x?.difficulty,
      link: x?.link,
      acceptanceRate: null,
      tags: Array.isArray(x?.tags) ? x.tags.map((t) => ({ slug: String(t), name: String(t) })) : [],
      status: x?.status,
      lastPracticed: x?.lastPracticed,
      topic: x?.topic,
    }));
  }, [yourQuestions, yourSelectedTopic, difficulty, debouncedSearch]);

  const resolvedViewItems = useMemo(() => (activeTab === 'your' ? filteredYourItems : viewItems), [activeTab, filteredYourItems, viewItems]);

  const resolvedViewTotal = useMemo(
    () => (activeTab === 'your' ? filteredYourItems.length : viewTotal),
    [activeTab, filteredYourItems.length, viewTotal]
  );

  useEffect(() => {
    if (!selectedItem) {
      setSelectedDetails(null);
      setDetailsLoading(false);
      setDetailsError('');
      return;
    }

    // Only LeetCode items have server-provided statement/testcases.
    if (selectedItem.__source !== 'LeetCode' || !selectedItem.slug) {
      setSelectedDetails(null);
      setDetailsLoading(false);
      setDetailsError('');
      return;
    }

    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError('');
    setSelectedDetails(null);

    (async () => {
      try {
        const json = await apiGet(`/api/catalog/leetcode/question/${encodeURIComponent(selectedItem.slug)}`);
        if (cancelled) return;
        setSelectedDetails(json);
      } catch (e) {
        if (cancelled) return;
        setDetailsError(e?.message || 'Failed to load problem details');
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  return (
    <div className="legacy-questions-root">
      <div className="container">
      <div className="content-tabs">
        <button
          className={`content-tab ${activeTab === 'leetcode' ? 'active' : ''}`}
          type="button"
          onClick={() => {
            setActiveTab('leetcode');
            setSelectedItem(null);
          }}
        >
          <i className="fas fa-code"></i> LeetCode
        </button>
        <button
          className={`content-tab ${activeTab === 'your' ? 'active' : ''}`}
          type="button"
          onClick={() => {
            setActiveTab('your');
            setSelectedItem(null);
          }}
        >
          <i className="fas fa-book"></i> Your Questions
        </button>
      </div>

      <div className="content-section active">
        <div className="controls">
          <div className="search-filters">
            <div className="filter-group">
              <i className="fas fa-search"></i>
              <input
                type="text"
                className="filter-input"
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {activeTab === 'your' ? (
              <select
                className="filter-select"
                value={yourSelectedTopic}
                onChange={(e) => setYourSelectedTopic(e.target.value)}
              >
                {yourTopics.length ? (
                  yourTopics.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                ) : (
                  <option value="">No topics</option>
                )}
              </select>
            ) : (
              <select className="filter-select" value={selectedTopicKey} onChange={(e) => setSelectedTopicKey(e.target.value)}>
                {topics.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            <select className="filter-select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>

            {activeTab === 'leetcode' ? (
              <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="">Default</option>
                <option value="ac_desc">Acceptance: High → Low</option>
                <option value="ac_asc">Acceptance: Low → High</option>
              </select>
            ) : null}

            {isLoggedIn ? (
              <Link to="/add" className="add-question-btn" style={{ textDecoration: 'none' }}>
                <i className="fas fa-plus"></i> Add Question
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="loading">
            <i className="fas fa-spinner fa-spin"></i>
            Loading...
          </div>
        ) : (
          <>
            <div className="questions-grid">
              {resolvedViewItems.map((q) => (
                <div
                  key={`${q.__source}-${q.slug}`}
                  className="question-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedItem(q)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelectedItem(q);
                  }}
                >
                  <div className="question-header">
                    <div className="question-title">{q.title}</div>
                    <span className={`difficulty-badge difficulty-${q.difficulty}`}>{q.difficulty}</span>
                  </div>

                  <div className="tags-container">
                    <span className="tag">{q.__source}</span>
                    {q.__source === 'LeetCode' && formatAcceptanceRate(q.acceptanceRate) ? (
                      <span className="tag">AC: {formatAcceptanceRate(q.acceptanceRate)}</span>
                    ) : null}
                    {activeTab === 'your' && q.topic ? <span className="tag">{q.topic}</span> : null}
                    {activeTab === 'your' && q.status ? <span className="tag">{q.status}</span> : null}
                    {Array.isArray(q.tags) && q.tags.length
                      ? q.tags.slice(0, 3).map((t) => (
                          <span key={t.slug} className="tag">
                            {t.name}
                          </span>
                        ))
                      : null}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
                    <a
                      className="add-question-btn"
                      href={q.link || `https://leetcode.com/problems/${q.slug}/`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ textDecoration: 'none' }}
                    >
                      <i className="fas fa-external-link-alt"></i> Open
                    </a>
                  </div>
                </div>
              ))}

              {!resolvedViewItems.length ? (
                <div className="empty-state">
                  <i className="fas fa-inbox"></i>
                  <p>No questions found</p>
                </div>
              ) : null}
            </div>

            {activeTab === 'leetcode' && leetcodeHasMore ? (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <button
                  className="add-question-btn"
                  type="button"
                  onClick={async () => {
                    setShowOverlay(true);
                    try {
                      await loadLeetCode({ reset: false });
                    } finally {
                      setShowOverlay(false);
                    }
                  }}
                >
                  Load more
                </button>
              </div>
            ) : null}

            <div style={{ marginTop: 12, textAlign: 'center', opacity: 0.8 }}>
              Showing {resolvedViewItems.length} of {resolvedViewTotal || resolvedViewItems.length}
            </div>
          </>
        )}
      </div>

      {selectedItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedItem(null);
          }}
        >
          <div className="w-[min(980px,calc(100vw-2rem))]">
            <div className="max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-8">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm text-slate-300">Question</p>
                  <p className="mt-1 text-xl font-semibold text-white">{selectedItem.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
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
                      <span className="text-slate-400">Source:</span>{' '}
                      <span className="font-semibold text-white">{selectedItem.__source}</span>
                    </div>
                    <div className="text-sm text-slate-200">
                      <span className="text-slate-400">Topic:</span>{' '}
                      <span className="font-semibold text-white">{selectedItem?.topic || selectedTopicKey}</span>
                    </div>
                    <div className="text-sm text-slate-200">
                      <span className="text-slate-400">Difficulty:</span>{' '}
                      <span className="font-semibold text-white">{selectedItem.difficulty}</span>
                    </div>
                    {selectedItem.__source === 'LeetCode' && formatAcceptanceRate(selectedItem.acceptanceRate) ? (
                      <div className="text-sm text-slate-200">
                        <span className="text-slate-400">Acceptance:</span>{' '}
                        <span className="font-semibold text-white">{formatAcceptanceRate(selectedItem.acceptanceRate)}</span>
                      </div>
                    ) : null}
                    <div className="text-sm text-slate-200">
                      <span className="text-slate-400">Slug:</span>{' '}
                      <span className="font-semibold text-white">{selectedItem.slug}</span>
                    </div>
                  </div>
                </div>

                {selectedItem.__source === 'LeetCode' ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">Problem Statement</p>

                    {detailsLoading ? (
                      <div className="mt-2 text-sm text-slate-200/90">Loading details…</div>
                    ) : detailsError ? (
                      <div className="mt-2 text-sm text-rose-200">{detailsError}</div>
                    ) : selectedDetails?.contentHtml ? (
                      <div
                        className="leetcode-content mt-3 text-sm text-slate-200/90"
                        // contentHtml is sanitized server-side
                        dangerouslySetInnerHTML={{ __html: selectedDetails.contentHtml }}
                      />
                    ) : (
                      <div className="mt-2 text-sm text-slate-200/90">No statement available.</div>
                    )}
                  </div>
                ) : null}

                {selectedItem.__source === 'LeetCode' && !detailsLoading && !detailsError ? (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold text-white">Constraints</p>
                      {Array.isArray(selectedDetails?.constraints) && selectedDetails.constraints.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200/90">
                          {selectedDetails.constraints.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-2 text-sm text-slate-200/90">No constraints found.</div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold text-white">Example Test Cases</p>
                      {selectedDetails?.exampleTestcases ? (
                        <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-100">
                          {String(selectedDetails.exampleTestcases).trim()}
                        </pre>
                      ) : (
                        <div className="mt-2 text-sm text-slate-200/90">No test cases available.</div>
                      )}
                    </div>
                  </>
                ) : null}

                {Array.isArray(selectedItem.tags) && selectedItem.tags.length ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">Tags</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedItem.tags.slice(0, 12).map((t) => (
                        <span
                          key={t.slug}
                          className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-200"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={selectedItem.link || `https://leetcode.com/problems/${selectedItem.slug}/`}
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

      {notifications.map((n) => (
        <div key={n.id} className={`notification ${n.type}`}>
          <i className={`fas ${n.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span>{n.message}</span>
        </div>
      ))}

      {loading || showOverlay ? (
        <div className="loading-overlay" style={{ display: 'flex' }}>
          <div className="loading-spinner"></div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
