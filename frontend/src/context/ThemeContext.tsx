import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { userService } from '../services/user.service';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'partora_theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function readCachedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Instant paint from whatever the browser last saw (also applied
  // synchronously by the inline script in index.html, before React
  // mounts, to avoid a flash on refresh).
  const [theme, setThemeState] = useState<Theme>(readCachedTheme);
  const { user } = useAuth();
  // Tracks the last user id we synced the theme FROM, so we only pull the
  // server's saved value once per login (not on every render), and so a
  // local toggle right after login doesn't get immediately overwritten by
  // a stale closure re-applying the same user's preference.
  const syncedForUserId = useRef<number | null>(null);

  // Apply + cache whenever the theme state changes, for any reason.
  useEffect(() => {
    applyThemeToDocument(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  // Once we know who's signed in, their saved preference is the source of
  // truth for this account — apply it immediately (this is what makes the
  // preference "take effect right after sign in" rather than only after a
  // manual toggle).
  useEffect(() => {
    if (user && user.theme_preference && syncedForUserId.current !== user.id) {
      syncedForUserId.current = user.id;
      setThemeState(user.theme_preference);
    }
    if (!user) {
      // Signed out: stop treating any previous account's preference as
      // authoritative. The locally-cached theme (whatever it currently is)
      // keeps applying for anonymous browsing / the login screen.
      syncedForUserId.current = null;
    }
  }, [user]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    // Persist to the account if signed in, so it's there on the next
    // sign-in from any device. Best-effort: the theme already applied
    // locally regardless of whether this call succeeds.
    if (user) {
      userService.updateTheme(t).catch(() => { /* non-critical; local state already applied */ });
    }
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
