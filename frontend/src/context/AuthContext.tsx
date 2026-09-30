import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/auth.service';
import type { User } from '../types';

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

  const refresh = useCallback(async () => {
    try {
      const me = await authService.me();
      setUser(me);
    } catch {
      setUser(null);
      sessionStorage.removeItem('partora_token');
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password);
    setUser(res.user as User);
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      sessionStorage.removeItem('partora_token');
    }
  };

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    refresh,
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
