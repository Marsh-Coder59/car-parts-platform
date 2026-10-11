import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authService } from '../services/auth.service';
import type { User } from '../types';

// Session expires after 24h (matches backend SESSION_EXPIRE_HOURS)
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const SESSION_KEY = 'partora_token';
const SESSION_EXPIRY_KEY = 'partora_session_expiry';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isStaffOrAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the expiry timer
  const clearExpiryTimer = () => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  };

  // Schedule auto-logout at session expiry time
  const scheduleExpiry = useCallback((expiresAt: number) => {
    clearExpiryTimer();
    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry <= 0) return;
    expiryTimerRef.current = setTimeout(async () => {
      // Session expired — log out. The cart is owned server-side by the
      // user's account, so nothing needs to be preserved client-side; the
      // cart will simply be re-fetched from the server on next login.
      try { await authService.logout(); } catch { /* ignore */ }
      setUser(null);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
      window.dispatchEvent(new Event('session-expired'));
    }, msUntilExpiry);
  }, []);

  const refresh = useCallback(async () => {
    try {
      // Check local expiry before hitting API
      const expiryStr = localStorage.getItem(SESSION_EXPIRY_KEY);
      if (expiryStr && Date.now() > parseInt(expiryStr, 10)) {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_EXPIRY_KEY);
        setUser(null);
        return;
      }
      const me = await authService.me();
      setUser(me);
    } catch {
      setUser(null);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));

    // Resume expiry timer if session was persisted
    const expiryStr = localStorage.getItem(SESSION_EXPIRY_KEY);
    if (expiryStr) scheduleExpiry(parseInt(expiryStr, 10));

    // Listen for session-expired event to show toast
    const handleExpired = () => {
      // Toast is shown by the api.ts interceptor redirect
    };
    window.addEventListener('session-expired', handleExpired);
    return () => {
      clearExpiryTimer();
      window.removeEventListener('session-expired', handleExpired);
    };
  }, [refresh, scheduleExpiry]);

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password);
    setUser(res.user as User);
    // Record expiry in localStorage so timer survives page refreshes
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAt));
    scheduleExpiry(expiresAt);
  };

  const logout = async () => {
    clearExpiryTimer();
    try { await authService.logout(); } finally {
      setUser(null);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
      // Also clean up the legacy shared cart snapshot key if it exists
      // from a previous build, so it can never leak into the next
      // account that logs in on this browser.
      try { localStorage.removeItem('partora_cart_snapshot'); } catch { /* ignore */ }
    }
  };

  const value: AuthContextValue = {
    user, loading, login, logout, refresh,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'ADMIN',
    isStaff: user?.role === 'STAFF',
    isStaffOrAdmin: user?.role === 'STAFF' || user?.role === 'ADMIN',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
