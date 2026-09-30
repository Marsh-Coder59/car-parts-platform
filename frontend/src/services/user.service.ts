import { apiClient } from './api';
import type { Address, Notification, Wishlist, Review } from '../types';

export const userService = {
  async getProfile() {
    const res = await apiClient.get('/api/users/profile');
    return res.data;
  },

  async updateProfile(data: { first_name?: string; last_name?: string; phone?: string }) {
    const res = await apiClient.patch('/api/users/profile', data);
    return res.data;
  },

  async uploadAvatar(formData: FormData) {
    const res = await apiClient.post('/api/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

export const addressService = {
  async list(): Promise<Address[]> {
    const res = await apiClient.get<Address[]>('/api/addresses');
    return res.data;
  },

  async create(data: Omit<Address, 'id'>) {
    const res = await apiClient.post('/api/addresses', data);
    return res.data;
  },

  async update(id: number, data: Omit<Address, 'id'>) {
    const res = await apiClient.patch(`/api/addresses/${id}`, data);
    return res.data;
  },

  async delete(id: number) {
    const res = await apiClient.delete(`/api/addresses/${id}`);
    return res.data;
  },
};

export const notificationsService = {
  async list(): Promise<Notification[]> {
    const res = await apiClient.get<Notification[]>('/api/notifications');
    return res.data;
  },

  async markRead(id: number) {
    const res = await apiClient.patch(`/api/notifications/${id}/read`);
    return res.data;
  },

  async markAllRead() {
    const res = await apiClient.patch('/api/notifications/read-all');
    return res.data;
  },
};

export const wishlistService = {
  async get(): Promise<Wishlist> {
    const res = await apiClient.get<Wishlist>('/api/wishlist');
    return res.data;
  },

  async add(productId: number) {
    const res = await apiClient.post(`/api/wishlist/items/${productId}`);
    return res.data;
  },

  async remove(productId: number) {
    const res = await apiClient.delete(`/api/wishlist/items/${productId}`);
    return res.data;
  },

  async clear() {
    const res = await apiClient.delete('/api/wishlist');
    return res.data;
  },
};

export const reviewsService = {
  async create(data: {
    order_item_id: number;
    rating: number;
    title?: string;
    comment?: string;
  }) {
    const res = await apiClient.post('/api/reviews', data);
    return res.data;
  },

  async update(id: number, data: { rating?: number; title?: string; comment?: string }) {
    const res = await apiClient.patch(`/api/reviews/${id}`, data);
    return res.data;
  },
};
