/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

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
