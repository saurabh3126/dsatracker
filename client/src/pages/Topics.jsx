import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../lib/api';

export default function Topics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const json = await apiGet('/api/data');
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const topics = useMemo(() => {
    const t = data?.topics || {};
    return Object.values(t);
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 text-slate-100">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Topics</h1>
      <p className="mt-2 text-sm text-slate-300/90">Explore curated DSA topic areas.</p>

      {error && (
        <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && (
          <div className="col-span-full rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
            Loading…
          </div>
        )}

        {!loading && topics.length === 0 && !error && (
          <div className="col-span-full rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
            No topics found.
          </div>
        )}

        {!loading &&
          topics.map((t) => (
            <div key={t.name} className="dsa-topic-card">
              <h3 className="text-base font-semibold text-white">{t.name}</h3>
              <p className="mt-2 text-sm text-slate-300/90">{t.description}</p>
              {Array.isArray(t.subTopics) && t.subTopics.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {t.subTopics.slice(0, 4).map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-200 ring-1 ring-white/10"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
