/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

const LAST_VISIT_KEY = 'dsaTracker.auth.lastVisitAtMs';
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  const isLoggedIn = Boolean(token);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setLoading(false);
    safeWriteToken(null);
  }, []);

  const setSession = useCallback((nextToken, nextUser) => {
    setToken(nextToken || null);
    setUser(nextUser || null);
    setLoading(false);
    safeWriteToken(nextToken || null);
  }, []);

  const refreshMe = useCallback(async () => {
    const t = safeReadToken();
    if (!t) {
      setUser(null);
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

  useEffect(() => {
    // on first load (and whenever token changes), fetch /me
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    refreshMe().catch(() => {
      // refreshMe handles logout on 401/403
    });
  }, [token, refreshMe]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isLoggedIn,
      setSession,
      logout,
      refreshMe,
    }),
    [token, user, loading, isLoggedIn, setSession, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
