import { apiClient } from './api';
import type { Cart } from '../types';

export const cartService = {
  async get(): Promise<Cart> {
    const res = await apiClient.get<Cart>('/api/cart');
    return res.data;
  },

  async addItem(product_id: number, quantity: number) {
    const res = await apiClient.post('/api/cart/items', { product_id, quantity });
    return res.data;
  },

  async updateItem(item_id: number, quantity: number) {
    const res = await apiClient.patch(`/api/cart/items/${item_id}`, { quantity });
    return res.data;
  },

  async removeItem(item_id: number) {
    const res = await apiClient.delete(`/api/cart/items/${item_id}`);
    return res.data;
  },

  async clear() {
    const res = await apiClient.delete('/api/cart');
    return res.data;
  },

  async validateCheckout(data: {
    shipping_address_id: number;
    coupon_code?: string;
    notes?: string;
  }) {
    const res = await apiClient.post('/api/checkout/validate', data);
    return res.data;
  },

  async validateCoupon(coupon_code: string) {
    const res = await apiClient.post(`/api/checkout/validate-coupon?coupon_code=${encodeURIComponent(coupon_code)}`);
    return res.data;
  },
};
