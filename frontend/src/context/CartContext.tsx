import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cartService } from '../services/cart.service';
import { useAuth } from './AuthContext';
import type { Cart } from '../types';

const CART_STORAGE_KEY = 'partora_cart_snapshot';

interface CartContextValue {
  cart: Cart | null;
  cartCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(() => {
    // Restore cart from localStorage immediately (pre-auth snapshot)
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user || user.role !== 'CUSTOMER') {
      // Not logged in — keep localStorage snapshot, clear live state
      setCart(prev => {
        // keep the snapshot from localStorage
        try {
          const saved = localStorage.getItem(CART_STORAGE_KEY);
          return saved ? JSON.parse(saved) : prev;
        } catch { return prev; }
      });
      return;
    }
    setLoading(true);
    try {
      const data = await cartService.get();
      setCart(data);
      // Persist to localStorage so cart survives session expiry
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(data));
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => { refresh(); }, [refresh]);

  // When session expires, cart stays in localStorage; on next login it reloads
  useEffect(() => {
    const handleExpired = () => {
      // Cart snapshot already in localStorage — just clear live state
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
