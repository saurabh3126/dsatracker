/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

const LAST_VISIT_KEY = 'dsaTracker.auth.lastVisitAtMs';
const USER_DATA_KEY = 'dsaTracker.auth.userData';
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function safeReadToken() {
  try {
    return window.localStorage.getItem('token');
  } catch {
    return null;
  }
}

function safeWriteToken(token) {
  try {
    if (!token) window.localStorage.removeItem('token');
    else window.localStorage.setItem('token', token);
  } catch {
    // ignore
  }
}

function safeReadUser() {
  try {
    const raw = window.localStorage.getItem(USER_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWriteUser(user) {
  try {
    if (!user) window.localStorage.removeItem(USER_DATA_KEY);
    else window.localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

function safeReadLastVisitAtMs() {
  try {
    const raw = window.localStorage.getItem(LAST_VISIT_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function safeWriteLastVisitAtMs(ms) {
  try {
    if (!Number.isFinite(ms)) return;
    window.localStorage.setItem(LAST_VISIT_KEY, String(ms));
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => safeReadToken());
  const [user, setUser] = useState(() => safeReadUser());
  const [loading, setLoading] = useState(Boolean(token) && !user); // If we have token AND cached user, not loading.

  const isLoggedIn = Boolean(token);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setLoading(false);
    safeWriteToken(null);
    safeWriteUser(null);
  }, []);

  const setSession = useCallback((nextToken, nextUser) => {
    setToken(nextToken || null);
    setUser(nextUser || null);
    setLoading(false);
    safeWriteToken(nextToken || null);
    safeWriteUser(nextUser || null);
  }, []);

  const refreshMe = useCallback(async (force = false) => {
    const t = safeReadToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }

    const cachedUser = safeReadUser();
    // If not forced, and we have valid cache, use it and STOP.
    if (!force && cachedUser && cachedUser._id) {
       setUser(cachedUser);
       // Ensure loading is false immediately if we cache-hit
       setLoading(false);
       return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${t}`,
          accept: 'application/json',
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          logout();
          return;
        }
        throw new Error(json?.error || `Request failed: ${res.status}`);
      }

      setToken(t);
      setUser(json?.user || null);
      safeWriteUser(json?.user || null);
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    // Auto-logout if the user returns after being away for 2+ days.
    // Note: we can't log out while the site is closed; this runs on next visit.
    if (typeof window === 'undefined') return;

    const now = Date.now();
    const last = safeReadLastVisitAtMs();
    const storedToken = safeReadToken();

    if (storedToken && Number.isFinite(last) && now - last >= TWO_DAYS_MS) {
      logout();
    }

    safeWriteLastVisitAtMs(now);

    function onVisibility() {
      if (document.visibilityState !== 'visible') return;
      safeWriteLastVisitAtMs(Date.now());
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [logout]);

  useEffect(() => {
    // keep auth state in sync across tabs
    function onStorage(e) {
      if (e.key !== 'token') return;
      const next = e.newValue || null;
      setToken(next);
      if (!next) setUser(null);
    }

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isLoggedIn,
      setSession,
      logout,
      refreshMe, // Expose with (force) arg
    }),
    [token, user, loading, isLoggedIn, setSession, logout, refreshMe],
  );

  useEffect(() => {
    // on first load (and whenever token changes), try to use cache first
    refreshMe(false).catch(() => {});
  }, [token, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
