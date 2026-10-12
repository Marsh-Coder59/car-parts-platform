import { apiClient } from './api';
import type { LoginResponse, User } from '../types';

export const authService = {
  async register(data: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    password: string;
  }) {
    const res = await apiClient.post('/api/auth/register', data);
    return res.data;
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await apiClient.post<LoginResponse>('/api/auth/login', { email, password });
    // Store Bearer token fallback in sessionStorage (cookie is set by server)
    if (res.data.token) {
      sessionStorage.setItem('partora_token', res.data.token);
    }
    return res.data;
  },

  async logout() {
    await apiClient.post('/api/auth/logout');
    sessionStorage.removeItem('partora_token');
  },

  async me(): Promise<User> {
    const res = await apiClient.get<User>('/api/auth/me');
    return res.data;
  },

  async forgotPassword(email: string) {
    const res = await apiClient.post('/api/auth/forgot-password', { email });
    return res.data;
  },

  async resetPassword(token: string, new_password: string) {
    const res = await apiClient.post('/api/auth/reset-password', { token, new_password });
    return res.data;
  },

  async verifyEmail(token: string) {
    const res = await apiClient.post(`/api/auth/verify-email?token=${token}`);
    return res.data;
  },

  async resendVerification(email: string) {
    const res = await apiClient.post('/api/auth/resend-verification', { email });
    return res.data;
  },

  // Real-time availability check used while the user is still typing on the
  // registration form. `available` is `null` when the address isn't a
  // complete, well-formed email yet (nothing to check) or if the check
  // itself failed — callers should treat `null` as "unknown", not "taken".
  async checkEmail(email: string): Promise<{ available: boolean | null }> {
    const res = await apiClient.get('/api/auth/check-email', { params: { email } });
    return res.data;
  },

  async changePassword(current_password: string, new_password: string) {
    const res = await apiClient.post('/api/auth/change-password', {
      current_password,
      new_password,
    });
    return res.data;
  },
};
