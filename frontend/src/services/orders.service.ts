import { apiClient } from './api';
import type { Order, OrderListItem, BankDetails } from '../types';

export const ordersService = {
  async place(data: {
    shipping_address_id: number;
    coupon_code?: string;
    notes?: string;
  }) {
    const res = await apiClient.post('/api/orders', data);
    return res.data;
  },

  async list(params?: {
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<OrderListItem[]> {
    const res = await apiClient.get<OrderListItem[]>('/api/orders', { params });
    return res.data;
  },

  async history(page = 1, page_size = 10) {
    const res = await apiClient.get('/api/orders/history', {
      params: { page, page_size },
    });
    return res.data;
  },

  async get(id: number): Promise<Order> {
    const res = await apiClient.get<Order>(`/api/orders/${id}`);
    return res.data;
  },

  async getBankDetails(orderId: number): Promise<BankDetails> {
    const res = await apiClient.get<BankDetails>(`/api/orders/${orderId}/bank-details`);
    return res.data;
  },

  async submitDepositPayment(orderId: number, data: {
    amount: number;
    reference: string;
    payment_date?: string;
    notes?: string;
  }) {
    const res = await apiClient.post(`/api/orders/${orderId}/payments/deposit`, data);
    return res.data;
  },

  async submitBalancePayment(orderId: number, data: {
    amount: number;
    reference: string;
    payment_date?: string;
    notes?: string;
  }) {
    const res = await apiClient.post(`/api/orders/${orderId}/payments/balance`, data);
    return res.data;
  },

  async cancel(orderId: number) {
    const res = await apiClient.post(`/api/orders/${orderId}/cancel`);
    return res.data;
  },

  async updateStatus(orderId: number, new_status: string, notes?: string) {
    const res = await apiClient.patch(`/api/orders/${orderId}/status`, { new_status, notes });
    return res.data;
  },

  async requestReturn(data: { order_id: number; reason: string; notes?: string }) {
    const res = await apiClient.post('/api/returns', data);
    return res.data;
  },
};

export const paymentsService = {
  async listPending() {
    const res = await apiClient.get('/api/payments/pending');
    return res.data;
  },

  async listAll(params?: {
    status?: string;
    payment_type?: string;
    order_id?: number;
    page?: number;
    page_size?: number;
  }) {
    const res = await apiClient.get('/api/admin/payments', { params });
    return res.data;
  },

  async get(paymentId: number) {
    const res = await apiClient.get(`/api/payments/${paymentId}`);
    return res.data;
  },

  async verify(paymentId: number, notes?: string) {
    const res = await apiClient.post(`/api/payments/${paymentId}/verify`, { notes });
    return res.data;
  },

  async reject(paymentId: number, notes: string) {
    const res = await apiClient.post(`/api/payments/${paymentId}/reject`, { notes });
    return res.data;
  },
};
