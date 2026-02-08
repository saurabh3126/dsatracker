/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { useAuth } from './AuthContext.jsx';

const StarredContext = createContext(null);

function normalizeSource(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRef(value) {
  return String(value || '').trim();
}

export function makeStarKey(source, ref) {
  const s = normalizeSource(source);
  const r = String(normalizeRef(ref)).toLowerCase();
  return s && r ? `${s}:${r}` : '';
}

export function StarredProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshInFlight = useRef(null);

  const starredKeys = useMemo(() => {
    const set = new Set();
    for (const it of items || []) {
      const key = makeStarKey(it?.source, it?.ref);
      if (key) set.add(key);
    }
    return set;
  }, [items]);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setItems([]);
      setError('');
      setLoading(false);
      return;
    }

    if (refreshInFlight.current) return refreshInFlight.current;

    setLoading(true);
    setError('');

    const p = (async () => {
      try {
        const json = await apiGet('/api/starred');
        const next = Array.isArray(json?.items) ? json.items : [];
        setItems(next);
      } catch (e) {
        setError(e?.message || 'Failed to load starred questions');
      } finally {
        setLoading(false);
        refreshInFlight.current = null;
      }
    })();

    refreshInFlight.current = p;
    return p;
  }, [isLoggedIn]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const toggleStar = useCallback(
    async ({ source, ref, title, difficulty, link }) => {
      const s = normalizeSource(source);
      const r = normalizeRef(ref);
      const key = makeStarKey(s, r);
      if (!key) throw new Error('Missing source/ref');

      // Optimistic toggle
      const wasStarred = starredKeys.has(key);
      if (wasStarred) {
        setItems((prev) => (Array.isArray(prev) ? prev.filter((x) => makeStarKey(x?.source, x?.ref) !== key) : []));
      } else {
        const optimistic = {
          id: `optimistic-${Date.now()}`,
          source: s,
          ref: r,
          title: String(title || '').trim() || String(ref || '').trim(),
          difficulty: difficulty || null,
          link: link || '',
          starredAt: new Date().toISOString(),
        };
        setItems((prev) => [optimistic, ...(Array.isArray(prev) ? prev : [])]);
      }

      try {
        const json = await apiPost('/api/starred/toggle', {
          source: s,
          ref: r,
          title: String(title || '').trim(),
          difficulty: difficulty || null,
          link: link || '',
        });

        // Reconcile with server response
        if (json?.starred && json?.item) {
          setItems((prev) => {
            const rest = (Array.isArray(prev) ? prev : []).filter((x) => makeStarKey(x?.source, x?.ref) !== key);
            return [json.item, ...rest];
          });
        } else if (json?.starred === false) {
          setItems((prev) => (Array.isArray(prev) ? prev.filter((x) => makeStarKey(x?.source, x?.ref) !== key) : []));
        }

        return json;
      } catch (e) {
        // Rollback by refreshing from server
        await refresh();
        throw e;
      }
    },
    [refresh, starredKeys]
  );

  const updateNotes = useCallback(
    async ({ source, ref, notes }) => {
      if (!isLoggedIn) throw new Error('Please log in again.');

      const s = normalizeSource(source);
      const r = normalizeRef(ref);
      const key = makeStarKey(s, r);
      if (!key) throw new Error('Missing source/ref');

      const nextNotes = String(notes ?? '').slice(0, 1000);

      // Optimistic update
      setItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((x) => (makeStarKey(x?.source, x?.ref) === key ? { ...x, notes: nextNotes } : x))
      );

      try {
        const json = await apiPatch('/api/starred/note', { source: s, ref: r, notes: nextNotes });
        if (json?.item) {
          setItems((prev) => {
            const arr = Array.isArray(prev) ? prev : [];
            return arr.map((x) => (makeStarKey(x?.source, x?.ref) === key ? json.item : x));
          });
        }
        return json;
      } catch (e) {
        await refresh();
        throw e;
      }
    },
    [isLoggedIn, refresh]
  );

  const value = useMemo(
    () => ({
      items,
      starredKeys,
      loading,
      error,
      refresh,
      toggleStar,
      updateNotes,
      isStarred: (source, ref) => starredKeys.has(makeStarKey(source, ref)),
    }),
    [items, starredKeys, loading, error, refresh, toggleStar, updateNotes]
  );

  return <StarredContext.Provider value={value}>{children}</StarredContext.Provider>;
}

export function useStarred() {
  const ctx = useContext(StarredContext);
  if (!ctx) throw new Error('useStarred must be used within StarredProvider');
  return ctx;
}
