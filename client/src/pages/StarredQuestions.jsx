import { useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useStarred } from '../auth/StarredContext.jsx';
import LoadingIndicator from '../components/LoadingIndicator.jsx';

function linkFor(item) {
  const link = String(item?.link || '').trim();
  if (link) return link;
  const source = String(item?.source || '').trim().toLowerCase();
  const ref = String(item?.ref || '').trim();
  if (source === 'leetcode' && ref) return `https://leetcode.com/problems/${ref}/`;
  return '';
}

export default function StarredQuestions() {
  const { isLoggedIn } = useAuth();
  const { items, loading, error, refresh, toggleStar, updateNotes } = useStarred();

  const [editingKey, setEditingKey] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const sorted = useMemo(() => {
    const arr = Array.isArray(items) ? [...items] : [];
    arr.sort((a, b) => new Date(b?.starredAt || 0).getTime() - new Date(a?.starredAt || 0).getTime());
    return arr;
  }, [items]);

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/80">Questions</div>
            <h1 className="mt-2 text-3xl font-black text-white">Starred Questions</h1>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-500">
              {isLoggedIn ? 'Saved for later' : 'Login required'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => refresh()}
            disabled={!isLoggedIn || loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-300 ring-1 ring-white/10 transition-all hover:bg-white/10 disabled:opacity-40"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-200">{error}</div>
        ) : null}

        {loading ? (
          <div className="mt-16 opacity-80">
            <LoadingIndicator label="Loading starred questions..." size="lg" />
          </div>
        ) : sorted.length ? (
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sorted.map((it) => {
              const href = linkFor(it);
              const key = String(it?.questionKey || it?.id || `${it?.source}:${it?.ref}`);
              const isEditing = editingKey === key;
              return (
                <div
                  key={key}
                  className="group relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#1C1C2E]/40 p-5 sm:p-6 backdrop-blur-xl transition-all duration-300 hover:border-amber-500/50 hover:bg-[#1C1C2E]/60"
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />

                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black text-white group-hover:text-amber-500 transition-colors">{it.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500/80">
                        <span>{String(it?.source || '').toUpperCase()}</span>
                        {it?.difficulty ? <span className="border-l border-white/5 pl-3">{it.difficulty}</span> : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-slate-400 transition-all hover:bg-white/10 hover:text-white border border-white/10"
                          title="Open Link"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          if (!isLoggedIn) return;
                          setEditingKey(key);
                          setNoteDraft(String(it?.notes || ''));
                        }}
                        disabled={!isLoggedIn}
                        className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-300 ring-1 ring-white/10 transition-all hover:bg-white/10 disabled:opacity-40"
                        title="Notes"
                      >
                        Notes
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleStar({ source: it.source, ref: it.ref, title: it.title, difficulty: it.difficulty, link: it.link })}
                        className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-500 transition-all hover:bg-amber-500 hover:text-black border border-amber-500/20"
                        title="Unstar"
                      >
                        <i className="fas fa-star"></i>
                        Starred
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="relative mt-4 rounded-3xl border border-white/10 bg-black/20 p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Notes</div>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-[#0b0f1a]/60 p-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500/40"
                        placeholder="Write a short note..."
                      />

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {String(noteDraft || '').length}/1000
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKey('');
                              setNoteDraft('');
                            }}
                            className="rounded-2xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={noteSaving}
                            onClick={async () => {
                              try {
                                setNoteSaving(true);
                                await updateNotes({ source: it.source, ref: it.ref, notes: noteDraft });
                                setEditingKey('');
                                setNoteDraft('');
                              } finally {
                                setNoteSaving(false);
                              }
                            }}
                            className="rounded-2xl bg-amber-500 px-4 py-2 text-xs font-black uppercase tracking-widest text-black hover:bg-amber-400 disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-16 rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 sm:p-10 text-center text-slate-400">
            <div className="text-sm font-bold">No starred questions yet.</div>
            <div className="mt-2 text-xs font-medium">Use the star button on any question to save it here.</div>
          </div>
        )}
      </div>
    </div>
  );
}
