import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user || user.role !== 'CUSTOMER') {
      setCart(null);
      return;
    }
    setLoading(true);
    try {
      const data = await cartService.get();
      setCart(data);
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
