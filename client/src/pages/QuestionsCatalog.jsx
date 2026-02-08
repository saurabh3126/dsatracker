import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import questionsCss from '../legacy/questions.css?raw';
import { useLegacyStyle } from '../legacy/useLegacyStyle';
import { useAuth } from '../auth/AuthContext.jsx';
import { useStarred } from '../auth/StarredContext.jsx';
import LoadingIndicator from '../components/LoadingIndicator.jsx';

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

function hoverGlowClassesByDifficulty(difficulty) {
  const d = String(difficulty || '').trim();
  if (d === 'Easy') {
    return {
      card: 'hover:border-emerald-500/40 hover:ring-2 hover:ring-emerald-500/15',
      overlay: 'from-emerald-500/10',
    };
  }
  if (d === 'Hard') {
    return {
      card: 'hover:border-rose-500/40 hover:ring-2 hover:ring-rose-500/15',
      overlay: 'from-rose-500/10',
    };
  }
  // Default: Medium (and unknown)
  return {
    card: 'hover:border-amber-500/40 hover:ring-2 hover:ring-amber-500/15',
    overlay: 'from-amber-500/10',
  };
}

export default function QuestionsCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isLoggedIn } = useAuth();
  const { isStarred, toggleStar } = useStarred();

  // Removed legacy style to use premium dark mode Tailwind UI
  // useLegacyStyle('questions', questionsCss);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('leetcode'); // leetcode | your

  const [topics, setTopics] = useState([]);

  const [selectedTopicKey, setSelectedTopicKey] = useState('arrays');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Dropdown States
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);
  const [isDifficultyDropdownOpen, setIsDifficultyDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  
  const topicRef = useRef(null);
  const difficultyRef = useRef(null);
  const sortRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (topicRef.current && !topicRef.current.contains(event.target)) setIsTopicDropdownOpen(false);
      if (difficultyRef.current && !difficultyRef.current.contains(event.target)) setIsDifficultyDropdownOpen(false);
      if (sortRef.current && !sortRef.current.contains(event.target)) setIsSortDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [leetcodeItems, setLeetcodeItems] = useState([]);
  const [leetcodeTotal, setLeetcodeTotal] = useState(0);
  const [leetcodeSkip, setLeetcodeSkip] = useState(0);
  const [leetcodeHasMore, setLeetcodeHasMore] = useState(false);
  const [leetcodeError, setLeetcodeError] = useState('');

  const [yourQuestions, setYourQuestions] = useState([]);
  const [yourSelectedTopic, setYourSelectedTopic] = useState('');

  const [selectedItem, setSelectedItem] = useState(null);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [selectedDetails, setSelectedDetails] = useState(null);

  const [quizItem, setQuizItem] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [quizData, setQuizData] = useState(null);
  const [quizSelections, setQuizSelections] = useState({});

  const [notifications, setNotifications] = useState([]);
  const [showOverlay, setShowOverlay] = useState(false);

  function setTab(nextTab) {
    const tab = nextTab === 'your' ? 'your' : 'leetcode';
    setActiveTab(tab);
    setSelectedItem(null);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', tab);
        return p;
      },
      { replace: true }
    );
  }

  function notify(message, type = 'info') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotifications((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 3000);
  }

  function starPayloadFor(item) {
    const isLeetCode = item?.__source === 'LeetCode';
    const source = isLeetCode ? 'leetcode' : 'custom';
    const ref = item?.slug;
    const link = item?.link || (isLeetCode && item?.slug ? `https://leetcode.com/problems/${item.slug}/` : '');
    return {
      source,
      ref,
      title: item?.title || '',
      difficulty: item?.difficulty || null,
      link,
    };
  }

  async function generateQuizFor(item) {
    if (!isLoggedIn) {
      setQuizError('Please log in to load quiz questions.');
      return;
    }

    const slug = String(item?.slug || '').trim();
    if (!slug) {
      setQuizError('Missing question slug for this item.');
      return;
    }

    setQuizLoading(true);
    setQuizError('');
    setQuizData(null);
    setQuizSelections({});

    try {
      const json = await apiPost('/api/ai/quiz', { slug, title: item?.title || '' });
      setQuizData(json);
    } catch (e) {
      setQuizError(e?.message || 'Failed to load quiz');
    } finally {
      setQuizLoading(false);
    }
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

    if (!isLoggedIn) {
      setYourQuestions([]);
      setShowOverlay(false);
      return;
    }

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
  }, [activeTab, isLoggedIn]);

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
      setLeetcodeError('');
      const json = await apiGet(`${base}?${params.toString()}`);
      const nextItems = Array.isArray(json?.items) ? json.items : [];

      if (reset) setLeetcodeItems(nextItems);
      else setLeetcodeItems((prev) => [...prev, ...nextItems]);

      setLeetcodeTotal(Number(json?.total || 0));
      setLeetcodeHasMore(Boolean(json?.hasMore));
      setLeetcodeSkip(nextSkip + nextItems.length);
    } catch (e) {
      const msg = e?.message || 'Error loading LeetCode questions';
      setLeetcodeError(msg);
      notify(msg, 'error');
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
        setLeetcodeError('');

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
    <div className="flex flex-col min-h-screen p-4 sm:p-8">
      <div className="max-w-[1400px] mx-auto flex-1">
        {/* Modern Tabs Header */}
        <div className="flex justify-center mb-8">
          <div className="bg-[#1C1C2E] p-1.5 rounded-2xl flex gap-1 shadow-lg">
            <button
              onClick={() => {
                setTab('leetcode');
              }}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'leetcode'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <i className={`fas fa-code ${activeTab === 'leetcode' ? 'text-black' : 'text-amber-500'}`}></i>
              LeetCode
            </button>
            <button
              onClick={() => {
                setTab('your');
              }}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'your'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <i className={`fas fa-book ${activeTab === 'your' ? 'text-black' : 'text-amber-500'}`}></i>
              Your Questions
            </button>
          </div>
        </div>

        {/* Search & Filters Bar */}
        <div className="bg-[#1C1C2E]/50 border border-white/5 p-4 rounded-2xl mb-8 flex flex-wrap items-center gap-4 shadow-xl backdrop-blur-sm relative z-30">
          <div className="flex-1 min-w-0 w-full sm:min-w-[240px] relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
            <input
              type="text"
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-full py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-bold placeholder:font-normal"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <style>{`
              .custom-dropdown-option { 
                padding: 10px 16px; 
                margin: 2px 8px;
                border-radius: 12px;
                cursor: pointer; 
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 12px;
                color: rgba(255,255,255,0.6) !important;
                font-size: 13px;
                white-space: nowrap;
                position: relative;
              }
              .custom-dropdown-option:hover { 
                background: rgba(255, 255, 255, 0.08); 
                color: white !important;
              }
              .custom-dropdown-option.selected {
                background: rgba(245, 158, 11, 0.2);
                color: white !important;
                font-weight: 600;
              }
              .custom-dropdown-container {
                position: absolute;
                top: 100%;
                left: -1px;
                width: calc(100% + 2px);
                background: #0d0e14;
                border: 1px solid #f59e0b;
                border-top: none;
                border-radius: 0 0 1.5rem 1.5rem;
                overflow: hidden;
                z-index: 1000;
                box-shadow: 0 20px 40px rgba(0,0,0,0.8);
                backdrop-filter: blur(25px);
                animation: dropdownFadeIn 0.2s ease-out;
                padding: 6px 0;
              }
              @keyframes dropdownFadeIn {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .custom-scrollbar::-webkit-scrollbar {
                width: 4px;
              }
              .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.1);
                border-radius: 10px;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: rgba(255,255,255,0.2);
              }
            `}</style>

            {/* Topic Dropdown */}
            <div className="relative w-full sm:w-auto" ref={topicRef}>
              <div 
                onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
                className={`w-full bg-[#0A0A0B] border border-white/10 px-5 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-3 transition-all duration-200 ${isTopicDropdownOpen ? 'rounded-t-[1.5rem] rounded-b-none border-amber-500 ring-1 ring-amber-500/30' : 'rounded-full hover:border-white/20'}`}
              >
                <span className="truncate text-white font-medium">
                  {activeTab === 'your' 
                    ? (yourSelectedTopic || (yourTopics.length ? yourTopics[0] : 'No topic'))
                    : (topics.find(t => t.key === selectedTopicKey)?.name || 'Default Topic')}
                </span>
                <i className={`fas fa-chevron-down text-[10px] transition-transform duration-300 ${isTopicDropdownOpen ? 'rotate-180' : ''}`} style={{ color: isTopicDropdownOpen ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}></i>
              </div>
              
              {isTopicDropdownOpen && (
                <div className="custom-dropdown-container">
                  <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                    {activeTab === 'your' ? (
                      yourTopics.length ? (
                        yourTopics.map((name) => (
                          <div 
                            key={name}
                            className={`custom-dropdown-option ${yourSelectedTopic === name ? 'selected' : ''}`}
                            onClick={() => { setYourSelectedTopic(name); setIsTopicDropdownOpen(false); }}
                          >
                            {name}
                          </div>
                        ))
                      ) : (
                        <div className="custom-dropdown-option">No topics</div>
                      )
                    ) : (
                      topics.map((t) => (
                        <div 
                          key={t.key}
                          className={`custom-dropdown-option ${selectedTopicKey === t.key ? 'selected' : ''}`}
                          onClick={() => { setSelectedTopicKey(t.key); setIsTopicDropdownOpen(false); }}
                        >
                          {t.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Difficulty Dropdown */}
            <div className="relative w-full sm:w-auto" ref={difficultyRef}>
              <div 
                onClick={() => setIsDifficultyDropdownOpen(!isDifficultyDropdownOpen)}
                className={`w-full bg-[#0A0A0B] border border-white/10 px-5 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-3 transition-all duration-200 ${isDifficultyDropdownOpen ? 'rounded-t-[1.5rem] rounded-b-none border-amber-500 ring-1 ring-amber-500/30' : 'rounded-full hover:border-white/20'}`}
              >
                <span className="font-medium text-white">
                  {difficulty || 'Difficulty'}
                </span>
                <i className={`fas fa-chevron-down text-[10px] transition-transform duration-300 ${isDifficultyDropdownOpen ? 'rotate-180' : ''}`} style={{ color: isDifficultyDropdownOpen ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}></i>
              </div>
              
              {isDifficultyDropdownOpen && (
                <div className="custom-dropdown-container">
                  <div 
                    className={`custom-dropdown-option ${difficulty === '' ? 'selected' : ''}`}
                    onClick={() => { setDifficulty(''); setIsDifficultyDropdownOpen(false); }}
                  >
                    All Difficulties
                  </div>
                  <div 
                    className={`custom-dropdown-option ${difficulty === 'Easy' ? 'selected' : ''}`}
                    onClick={() => { setDifficulty('Easy'); setIsDifficultyDropdownOpen(false); }}
                  >
                    Easy
                  </div>
                  <div 
                    className={`custom-dropdown-option ${difficulty === 'Medium' ? 'selected' : ''}`}
                    onClick={() => { setDifficulty('Medium'); setIsDifficultyDropdownOpen(false); }}
                  >
                    Medium
                  </div>
                  <div 
                    className={`custom-dropdown-option ${difficulty === 'Hard' ? 'selected' : ''}`}
                    onClick={() => { setDifficulty('Hard'); setIsDifficultyDropdownOpen(false); }}
                  >
                    Hard
                  </div>
                </div>
              )}
            </div>

            {/* Sort Dropdown (only leetcode tab) */}
            {activeTab === 'leetcode' && (
              <div className="relative w-full sm:w-auto" ref={sortRef}>
                <div 
                  onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                  className={`w-full bg-[#0A0A0B] border border-white/10 px-5 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-3 transition-all duration-200 ${isSortDropdownOpen ? 'rounded-t-[1.5rem] rounded-b-none border-amber-500 ring-1 ring-amber-500/30' : 'rounded-full hover:border-white/20'}`}
                >
                  <span className="font-medium text-white">
                    {sort === 'ac_desc' ? 'AC: High → Low' : sort === 'ac_asc' ? 'AC: Low → High' : 'Sort By'}
                  </span>
                  <i className={`fas fa-chevron-down text-[10px] transition-transform duration-300 ${isSortDropdownOpen ? 'rotate-180' : ''}`} style={{ color: isSortDropdownOpen ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}></i>
                </div>
                
                {isSortDropdownOpen && (
                  <div className="custom-dropdown-container">
                    <div 
                      className={`custom-dropdown-option ${sort === '' ? 'selected' : ''}`}
                      onClick={() => { setSort(''); setIsSortDropdownOpen(false); }}
                    >
                      Default
                    </div>
                    <div 
                      className={`custom-dropdown-option ${sort === 'ac_desc' ? 'selected' : ''}`}
                      onClick={() => { setSort('ac_desc'); setIsSortDropdownOpen(false); }}
                    >
                      AC: High → Low
                    </div>
                    <div 
                      className={`custom-dropdown-option ${sort === 'ac_asc' ? 'selected' : ''}`}
                      onClick={() => { setSort('ac_asc'); setIsSortDropdownOpen(false); }}
                    >
                      AC: Low → High
                    </div>
                  </div>
                )}
              </div>
            )}

            {isLoggedIn && (
              <Link 
                to="/add" 
                className="bg-amber-500 hover:bg-amber-400 text-black px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95"
              >
                <i className="fas fa-plus"></i> Add Question
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-20 opacity-80">
            <LoadingIndicator label="Loading questions..." size="lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {resolvedViewItems.map((q) => (
                (() => {
                  const glow = hoverGlowClassesByDifficulty(q?.difficulty);
                  return (
                <div
                  key={`${q.__source}-${q.slug}`}
                  onClick={() => setSelectedItem(q)}
                  className={`group relative bg-[#1C1C2E]/40 border border-white/5 rounded-[2rem] p-5 sm:p-7 transition-all duration-500 hover:bg-[#1C1C2E] ${glow.card} hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] flex flex-col justify-between cursor-pointer overflow-hidden min-h-[280px] sm:min-h-[320px]`}
                >
                  {/* Glass Reflection Effect */}
                  <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg] z-20"></div>

                  {/* Premium Gradient Overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${glow.overlay} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

                  <div className="relative z-10 font-sans">
                    <div className="flex justify-between items-start gap-3 mb-5">
                      <h3 className="text-xl font-bold text-white/90 leading-[1.3] group-hover:text-amber-500 transition-colors line-clamp-2 italic">
                        {q.title}
                      </h3>
                      <div className="shrink-0 flex items-start gap-2">
                        <span 
                          className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg ${
                            q.difficulty === 'Easy' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            q.difficulty === 'Medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {q.difficulty}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isLoggedIn) {
                              notify('Please log in to star questions.', 'error');
                              return;
                            }
                            void toggleStar(starPayloadFor(q)).catch((err) => notify(err?.message || 'Failed to update star', 'error'));
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
                          title={isStarred(q.__source === 'LeetCode' ? 'leetcode' : 'custom', q.slug) ? 'Unstar' : 'Star'}
                        >
                          <i
                            className={`${isStarred(q.__source === 'LeetCode' ? 'leetcode' : 'custom', q.slug) ? 'fas' : 'far'} fa-star ${
                              isStarred(q.__source === 'LeetCode' ? 'leetcode' : 'custom', q.slug) ? 'text-amber-500' : 'text-slate-400'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Metadata Pill Row */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-[11px] text-slate-300 font-bold flex items-center gap-2 italic">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        {q.__source}
                      </div>
                      {q.__source === 'LeetCode' && formatAcceptanceRate(q.acceptanceRate) && (
                        <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-[11px] text-slate-300 font-bold flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          AC: {formatAcceptanceRate(q.acceptanceRate)}
                        </div>
                      )}
                      {q.topic && (
                        <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-[11px] text-amber-500 font-bold flex items-center gap-2 italic uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          {q.topic}
                        </div>
                      )}
                    </div>

                    {/* Tag Badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {Array.isArray(q.tags) && q.tags.slice(0, 3).map((t) => (
                        <span key={t.slug} className="bg-white/5 border border-white/5 px-2.5 py-1 rounded-lg text-[10px] text-slate-500 font-bold hover:text-slate-300 transition-colors">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="relative z-10 w-full">
                    <a
                      href={q.link || `https://leetcode.com/problems/${q.slug}/`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-black py-3.5 sm:py-4 rounded-2xl text-[13px] font-black tracking-widest transition-all flex items-center justify-center gap-3 shadow-2xl shadow-amber-500/20 active:scale-95 group-hover:shadow-amber-500/40 transform hover:-translate-y-0.5"
                    >
                      <i className="fas fa-play text-[10px]"></i>
                      OPEN PROBLEM
                    </a>
                  </div>
                </div>
                  );
                })()
              ))}

              {!resolvedViewItems.length && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-40 bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <i className="fas fa-inbox text-5xl mb-4"></i>
                  <p className="text-lg font-medium">No questions found</p>
                  {activeTab === 'your' && !isLoggedIn ? (
                    <p className="mt-2 text-sm font-semibold text-slate-300">
                      Please <Link to="/login" className="text-amber-400 hover:text-amber-300">log in</Link> to view your questions.
                    </p>
                  ) : activeTab === 'leetcode' && leetcodeError ? (
                    <p className="mt-2 text-sm font-semibold text-slate-300">{leetcodeError}</p>
                  ) : null}
                </div>
              )}
            </div>

            {activeTab === 'leetcode' && leetcodeHasMore && (
              <div className="mt-12 flex justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    setShowOverlay(true);
                    try { await loadLeetCode({ reset: false }); } 
                    finally { setShowOverlay(false); }
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-black px-6 py-3 sm:px-10 sm:py-4 rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-95 flex items-center gap-3"
                >
                  <i className="fas fa-plus-circle text-sm"></i> Load More Questions
                </button>
              </div>
            )}

            <div className="mt-10 py-4 border-t border-white/5 text-center text-xs text-slate-500 font-medium uppercase tracking-widest">
              Showing {resolvedViewItems.length} of {resolvedViewTotal || resolvedViewItems.length} questions
            </div>
          </>
        )}
      </div>

      {selectedItem ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-20 sm:pt-24 backdrop-blur"
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isLoggedIn) {
                        notify('Please log in to star questions.', 'error');
                        return;
                      }
                      void toggleStar(starPayloadFor(selectedItem)).catch((err) => notify(err?.message || 'Failed to update star', 'error'));
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                    title={isStarred(selectedItem.__source === 'LeetCode' ? 'leetcode' : 'custom', selectedItem.slug) ? 'Unstar' : 'Star'}
                  >
                    <i
                      className={`${isStarred(selectedItem.__source === 'LeetCode' ? 'leetcode' : 'custom', selectedItem.slug) ? 'fas' : 'far'} fa-star ${
                        isStarred(selectedItem.__source === 'LeetCode' ? 'leetcode' : 'custom', selectedItem.slug) ? 'text-amber-500' : 'text-slate-400'
                      }`}
                    />
                    Star
                  </button>

                  {selectedItem.__source === 'LeetCode' && selectedItem.slug ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuizItem({ title: selectedItem.title, slug: selectedItem.slug });
                        setQuizError('');
                        setQuizData(null);
                        setQuizSelections({});
                        generateQuizFor(selectedItem);
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                    >
                      Quiz
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
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

      {quizItem ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-20 sm:pt-24 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuizItem(null);
          }}
        >
          <div className="w-[min(980px,calc(100vw-2rem))]">
            <div className="max-h-[85vh] overflow-y-auto rounded-[2.5rem] border border-white/10 bg-[#0b0f1a]/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-10">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-6">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">AI Assessment</div>
                  <h2 className="mt-2 truncate text-2xl font-black text-white">{quizItem.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://leetcode.com/problems/${encodeURIComponent(String(quizItem.slug || '').trim())}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Open Problem
                  </a>
                  <button
                    type="button"
                    onClick={() => setQuizItem(null)}
                    className="rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-6">
                {quizLoading ? (
                  <div className="py-10 opacity-80">
                    <LoadingIndicator label="Loading quiz..." size="md" />
                  </div>
                ) : quizError ? (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-200">{quizError}</div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Multiple choice</div>
                    <button
                      type="button"
                      onClick={() => generateQuizFor({ slug: quizItem.slug, title: quizItem.title })}
                      className="rounded-2xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-300 ring-1 ring-white/10 transition-all hover:bg-white/10"
                    >
                      Reload
                    </button>
                  </div>
                )}

                {!quizLoading && !quizError ? (
                  Array.isArray(quizData?.questions) && quizData.questions.length ? (
                    <div className="mt-6 grid gap-6">
                      {quizData.questions.map((q, idx) => (
                        <div key={`${idx}-${String(q?.question || '').slice(0, 20)}`} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/80">Question {idx + 1}</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Pick one</div>
                          </div>
                          <div className="mt-3 text-sm font-bold text-white leading-relaxed">{q.question}</div>

                          <div className="mt-4 grid grid-cols-1 gap-2">
                            {(Array.isArray(q.options) ? q.options : []).map((opt, oi) => {
                              const selectedIndex = quizSelections[idx];
                              const answered = selectedIndex !== undefined;
                              const isCorrect = oi === q.correctIndex;
                              const isSelected = oi === selectedIndex;

                              const base = 'w-full text-left rounded-2xl border px-4 py-3 text-sm font-bold transition-all';
                              const state = !answered
                                ? 'border-white/10 bg-black/20 text-slate-200 hover:bg-white/5'
                                : isCorrect
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                  : isSelected
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                    : 'border-white/10 bg-black/20 text-slate-400';

                              return (
                                <button
                                  key={`${idx}-${oi}`}
                                  type="button"
                                  className={`${base} ${state}`}
                                  onClick={() => {
                                    if (!answered) setQuizSelections((prev) => ({ ...prev, [idx]: oi }));
                                  }}
                                >
                                  <span className="mr-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                    {String.fromCharCode(65 + oi)}.
                                  </span>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>

                          {quizSelections[idx] !== undefined ? (
                            <div className="mt-4 rounded-2xl bg-white/5 p-4 border border-white/10">
                              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/80 mb-2">Perspective Analysis</div>
                              {typeof q?.correctIndex === 'number' && Array.isArray(q?.options) && q.options[q.correctIndex] ? (
                                <div className="text-sm font-bold text-white mb-2">
                                  Correct Answer: {String.fromCharCode(65 + q.correctIndex)}. {q.options[q.correctIndex]}
                                </div>
                              ) : null}
                              {q.explanation ? <p className="text-xs font-medium leading-relaxed text-slate-400">{q.explanation}</p> : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                      No quiz content returned.
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
        {notifications.map((n) => (
          <div 
            key={n.id} 
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl animate-in fade-in slide-in-from-right-10 duration-300 ${
              n.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            <i className={`fas ${n.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
            <span className="text-sm font-semibold">{n.message}</span>
          </div>
        ))}
      </div>

      {loading || showOverlay ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <LoadingIndicator label="" size="lg" />
        </div>
      ) : null}
    </div>
  );
}
