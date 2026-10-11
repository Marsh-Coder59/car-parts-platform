import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { cartService } from '../services/cart.service';
import { useAuth } from './AuthContext';
import type { Cart } from '../types';

interface CartContextValue {
  cart: Cart | null;
  cartCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  // Cart state lives ONLY in memory for the lifetime of the authenticated
  // session. The backend (user_sessions -> cart owned by user_id) is the
  // single source of truth.
  //
  // Root cause of the cross-account cart leak this replaces: the previous
  // implementation cached the cart under one unkeyed localStorage key
  // ("partora_cart_snapshot") shared by every account that ever logged in
  // on that browser, initialized React state synchronously from that key
  // on mount, and explicitly skipped clearing it on logout. The next
  // person to log in on the same browser would see the previous account's
  // cart items for a moment (or indefinitely, if the background refresh
  // failed). There is no safe way to key a *shared* storage slot by
  // account without just re-fetching from the server, so we no longer
  // persist cart data in browser storage at all.
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  // Tracks which user_id the current `cart` state belongs to, so a stale
  // response from a request started under a previous account can never be
  // applied after an account switch.
  const activeUserIdRef = useRef<number | string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user || user.role !== 'CUSTOMER') {
      activeUserIdRef.current = null;
      setCart(null);
      return;
    }
    const requestedUserId = user.id;
    activeUserIdRef.current = requestedUserId;
    setLoading(true);
    try {
      const data = await cartService.get();
      // Only apply the result if we're still the most recent request for
      // the same account (guards against a race during rapid account
      // switching / logout-login).
      if (activeUserIdRef.current === requestedUserId) {
        setCart(data);
      }
    } catch {
      if (activeUserIdRef.current === requestedUserId) {
        setCart(null);
      }
    } finally {
      if (activeUserIdRef.current === requestedUserId) {
        setLoading(false);
      }
    }
  }, [isAuthenticated, user]);

  // Re-fetch (or clear) the cart whenever auth state changes: login,
  // logout, or switching to a different account.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Clear cart state immediately on logout/session-expiry, before the
  // next account can possibly render anything.
  useEffect(() => {
    const handleExpired = () => {
      activeUserIdRef.current = null;
      setCart(null);
    };
    window.addEventListener('session-expired', handleExpired);
    return () => window.removeEventListener('session-expired', handleExpired);
  }, []);

  const cartCount = cart?.item_count ?? 0;

  return (
    <CartContext.Provider value={{ cart, cartCount, loading, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
