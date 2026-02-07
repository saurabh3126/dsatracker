import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus, 
  Minus, 
  ChevronDown, 
  Code2, 
  Link as LinkIcon, 
  BookOpen, 
  Clock, 
  Layout, 
  AlertCircle,
  FileCode,
  Zap,
  CheckCircle2,
  XCircle
} from 'lucide-react';

export default function AddQuestion() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [coreConcept, setCoreConcept] = useState('');
  const [approach, setApproach] = useState(['']);
  const [pitfalls, setPitfalls] = useState(['']);
  const [codeTemplate, setCodeTemplate] = useState('');
  const [timeComplexity, setTimeComplexity] = useState('');
  const [spaceComplexity, setSpaceComplexity] = useState('');

  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  // Dropdown States
  const [isTopicOpen, setIsTopicOpen] = useState(false);
  const [isWhenOpen, setIsWhenOpen] = useState(false);
  const topicRef = useRef(null);
  const whenRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (topicRef.current && !topicRef.current.contains(event.target)) setIsTopicOpen(false);
      if (whenRef.current && !whenRef.current.contains(event.target)) setIsWhenOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const topics = [
    "Sorting Techniques", "Arrays", "Binary Search", "Strings", 
    "Linked List", "Recursion", "Bit Manipulation", "Stack & Queue", 
    "Trees", "Graphs", "Dynamic Programming"
  ];

  const priorities = [
    { value: 'today', label: 'Daily' },
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' }
  ];

  function showNotification(message, type = 'success') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotification({ id, message, type });
    window.setTimeout(() => {
      setNotification((n) => (n?.id === id ? null : n));
    }, 3000);
  }

  function addApproachStep() { setApproach((prev) => [...prev, '']); }
  function addPitfall() { setPitfalls((prev) => [...prev, '']); }
  function removeApproachStep(index) { setApproach((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)); }
  function removePitfall(index) { setPitfalls((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)); }

  async function onSubmit(e) {
    e.preventDefault();
    if (!topic || !difficulty) {
      showNotification('Please select Topic and Timing', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title, link, topic, difficulty, coreConcept,
        approach: approach.map(s => String(s || '').trim()).filter(Boolean),
        commonPitfalls: pitfalls.map(s => String(s || '').trim()).filter(Boolean),
        codeTemplate, timeComplexity, spaceComplexity,
      };
      await apiPost('/api/questions', payload);
      showNotification('Question added successfully!', 'success');
      window.setTimeout(() => navigate('/questions'), 2000);
    } catch (error) {
      showNotification(error?.message || 'Failed to add question', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-6 sm:py-12 font-sans">
      <div className="max-w-4xl mx-auto">
        <Link 
          to="/questions" 
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-amber-500 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all duration-300 mb-10 group"
        >
          <ArrowLeft className="w-3 h-3 transition-transform group-hover:-translate-x-1" />
          Back to Questions
        </Link>

        <div className="mb-10">
          <h1 className="text-4xl font-black text-white italic tracking-tight mb-2 uppercase">
            Add New <span className="text-amber-500">Task</span>
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px]">Initialize a new problem-solving strategy</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-8">
          {/* Section 1: Core Identity */}
          <div className="bg-[#1a1b26]/60 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[80px] group-hover:bg-amber-500/10 transition-colors"></div>
            
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white/50">Core Identity</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 pl-1">Question Title</label>
                <div className="relative">
                  <Layout className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    required value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Merge Intervals"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 pl-1">Source Link</label>
                <div className="relative">
                  <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="url" required value={link} onChange={e => setLink(e.target.value)}
                    placeholder="https://leetcode.com/..."
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 pl-1">Primary Topic</label>
                <div className="relative" ref={topicRef}>
                  <div 
                    onClick={() => setIsTopicOpen(!isTopicOpen)}
                    className={`bg-black/40 border border-white/10 px-5 py-4 text-sm cursor-pointer flex items-center justify-between transition-all duration-200 ${isTopicOpen ? 'rounded-t-[1.5rem] border-amber-500 ring-1 ring-amber-500/30' : 'rounded-2xl hover:border-white/20'}`}
                  >
                    <span className={`font-bold italic ${topic ? 'text-white' : 'text-slate-600'}`}>{topic || 'Select Domain'}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isTopicOpen ? 'rotate-180 text-amber-500' : 'text-slate-500'}`} />
                  </div>
                  {isTopicOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 overflow-hidden rounded-b-[1.5rem] border border-t-0 border-amber-500 bg-[#0d0e14] shadow-2xl">
                      <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                        {topics.map(t => (
                          <div key={t} onClick={() => { setTopic(t); setIsTopicOpen(false); }} className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors hover:bg-amber-500/10 ${topic === t ? 'text-amber-500 bg-amber-500/5' : 'text-slate-400'}`}>
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 pl-1">Target Timing</label>
                <div className="relative" ref={whenRef}>
                  <div 
                    onClick={() => setIsWhenOpen(!isWhenOpen)}
                    className={`bg-black/40 border border-white/10 px-5 py-4 text-sm cursor-pointer flex items-center justify-between transition-all duration-200 ${isWhenOpen ? 'rounded-t-[1.5rem] border-amber-500 ring-1 ring-amber-500/30' : 'rounded-2xl hover:border-white/20'}`}
                  >
                    <span className={`font-bold italic ${difficulty ? 'text-white' : 'text-slate-600'}`}>{priorities.find(p => p.value === difficulty)?.label || 'Select Priority'}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isWhenOpen ? 'rotate-180 text-amber-500' : 'text-slate-500'}`} />
                  </div>
                  {isWhenOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 overflow-hidden rounded-b-[1.5rem] border border-t-0 border-amber-500 bg-[#0d0e14] shadow-2xl">
                      {priorities.map(p => (
                        <div key={p.value} onClick={() => { setDifficulty(p.value); setIsWhenOpen(false); }} className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors hover:bg-amber-500/10 ${difficulty === p.value ? 'text-amber-500 bg-amber-500/5' : 'text-slate-400'}`}>
                          {p.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Strategy Breakdown */}
          <div className="bg-[#1a1b26]/60 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <Zap className="w-5 h-5 text-amber-500" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white/50">Strategy Breakdown</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 pl-1">Core Concept</label>
                <textarea 
                  required value={coreConcept} onChange={e => setCoreConcept(e.target.value)}
                  placeholder="What is the fundamental idea behind this problem?"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-bold min-h-[100px]"
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-500">Logical Steps</label>
                    <button type="button" onClick={addApproachStep} className="text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
                        <Plus className="w-3 h-3" /> Add Step
                    </button>
                </div>
                <div className="space-y-3">
                  {approach.map((val, idx) => (
                    <div key={idx} className="relative group/step">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-amber-500/40">{String(idx + 1).padStart(2, '0')}</div>
                      <input 
                        required value={val} onChange={e => setApproach(prev => prev.map((p, i) => i === idx ? e.target.value : p))}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-bold placeholder:font-normal"
                        placeholder={`Phase ${idx + 1} execution...`}
                      />
                      {approach.length > 1 && (
                        <button type="button" onClick={() => removeApproachStep(idx)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-rose-500 transition-colors">
                          <Minus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-500">Critical Pitfalls</label>
                    <button type="button" onClick={addPitfall} className="text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
                        <Plus className="w-3 h-3" /> Add Warning
                    </button>
                </div>
                <div className="space-y-3">
                  {pitfalls.map((val, idx) => (
                    <div key={idx} className="relative group/step">
                      <AlertCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500/40" />
                      <input 
                        required value={val} onChange={e => setPitfalls(prev => prev.map((p, i) => i === idx ? e.target.value : p))}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 transition-all font-bold placeholder:font-normal"
                        placeholder="Potential edge case or mistake..."
                      />
                      {pitfalls.length > 1 && (
                        <button type="button" onClick={() => removePitfall(idx)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-rose-500 transition-colors">
                          <Minus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Technical Specs */}
          <div className="bg-[#1a1b26]/60 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <FileCode className="w-5 h-5 text-amber-500" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white/50">Technical Specs</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 pl-1">Execution Template</label>
                <div className="relative">
                    <div className="absolute top-4 right-4 text-[10px] font-black uppercase text-slate-700 tracking-widest select-none">Code</div>
                    <textarea 
                      required value={codeTemplate} onChange={e => setCodeTemplate(e.target.value)}
                      placeholder="// Implement your optimized solution here..."
                      className="w-full bg-black/60 border border-white/10 rounded-2xl py-6 px-6 text-sm text-amber-500/90 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all min-h-[300px] leading-relaxed"
                    />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 pl-1">Time Complexity</label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      required value={timeComplexity} onChange={e => setTimeComplexity(e.target.value)}
                      placeholder="e.g. O(N log N)"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 pl-1">Space Complexity</label>
                  <div className="relative">
                    <Code2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      required value={spaceComplexity} onChange={e => setSpaceComplexity(e.target.value)}
                      placeholder="e.g. O(1)"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button 
              disabled={saving}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black py-6 rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] transition-all shadow-2xl shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden relative"
            >
              <div className="absolute inset-0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]"></div>
              <div className="relative flex items-center justify-center gap-3">
                {saving ? (
                    <Clock className="w-4 h-4 animate-spin" />
                ) : (
                    <Plus className="w-5 h-5" />
                )}
                {saving ? 'Processing...' : 'Provision Task'}
              </div>
            </button>
          </div>
        </form>
      </div>

      {notification && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-6 py-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-500 animate-in fade-in slide-in-from-bottom-5 ${
            notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            <span className="text-sm font-bold italic">{notification.message}</span>
        </div>
      )}

      {saving && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                  <p className="text-amber-500 font-black uppercase tracking-widest text-[10px] animate-pulse">Syncing with system...</p>
              </div>
          </div>
      )}
    </div>
  );
}
