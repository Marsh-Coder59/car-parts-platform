import { apiClient } from './api';

export const adminService = {
  async getDashboard() {
    const res = await apiClient.get('/api/admin/dashboard');
    return res.data;
  },

  async getCustomers(params?: { search?: string; page?: number; page_size?: number }) {
    const res = await apiClient.get('/api/admin/customers', { params });
    return res.data;
  },

  async getCustomer(id: number) {
    const res = await apiClient.get(`/api/admin/customers/${id}`);
    return res.data;
  },

  async updateUserStatus(userId: number, status: string) {
    const res = await apiClient.patch(`/api/admin/users/${userId}/status`, null, {
      params: { status },
    });
    return res.data;
  },

  async getStaff() {
    const res = await apiClient.get('/api/admin/staff');
    return res.data;
  },

  async createStaff(data: {
    first_name: string; last_name: string; email: string;
    phone?: string; password: string; role: string;
  }) {
    const res = await apiClient.post('/api/admin/staff', data);
    return res.data;
  },

  async updateStaff(id: number, data: {
    first_name?: string; last_name?: string; phone?: string; role?: string;
  }) {
    const res = await apiClient.patch(`/api/admin/staff/${id}`, data);
    return res.data;
  },

  async deleteStaff(id: number) {
    const res = await apiClient.delete(`/api/admin/staff/${id}`);
    return res.data;
  },

  async getSettings() {
    const res = await apiClient.get('/api/admin/settings');
    return res.data;
  },

  async updateSettings(data: Record<string, unknown>) {
    const res = await apiClient.patch('/api/admin/settings', data);
    return res.data;
  },

  async updateSettingsExtended(data: Record<string, unknown>) {
    const res = await apiClient.patch('/api/admin/settings/extended', data);
    return res.data;
  },

  async getAuditLogs(params?: {
    entity_type?: string; user_id?: number; page?: number; page_size?: number;
  }) {
    const res = await apiClient.get('/api/admin/audit-logs', { params });
    return res.data;
  },

  // Reports
  async getSalesReport(params?: { date_from?: string; date_to?: string }) {
    const res = await apiClient.get('/api/admin/reports/sales', { params });
    return res.data;
  },

  async getTopProducts(limit = 10) {
    const res = await apiClient.get('/api/admin/reports/top-products', { params: { limit } });
    return res.data;
  },

  async getOutstandingBalances() {
    const res = await apiClient.get('/api/admin/reports/outstanding-balances');
    return res.data;
  },

  async getOrderStatusCounts() {
    const res = await apiClient.get('/api/admin/reports/order-status-counts');
    return res.data;
  },

  async getPaymentStatusCounts() {
    const res = await apiClient.get('/api/admin/reports/payment-status-counts');
    return res.data;
  },

  async getCategoryPerformance(params?: { date_from?: string; date_to?: string }) {
    const res = await apiClient.get('/api/admin/reports/category-performance', { params });
    return res.data;
  },

  // Deliveries
  async listDeliveries() {
    const res = await apiClient.get('/api/deliveries');
    return res.data;
  },

  async createDelivery(data: {
    order_id: number; method?: string; courier?: string;
    tracking_number?: string; estimated_date?: string; notes?: string;
  }) {
    const res = await apiClient.post('/api/deliveries', data);
    return res.data;
  },

  async updateDelivery(id: number, data: {
    status?: string; courier?: string;
    tracking_number?: string; estimated_date?: string; notes?: string;
  }) {
    const res = await apiClient.patch(`/api/deliveries/${id}`, data);
    return res.data;
  },

  // Returns
  async listReturns() {
    const res = await apiClient.get('/api/admin/returns');
    return res.data;
  },

  async getReturn(id: number) {
    const res = await apiClient.get(`/api/admin/returns/${id}`);
    return res.data;
  },

  async updateReturn(id: number, data: { status: string; notes?: string }) {
    const res = await apiClient.patch(`/api/admin/returns/${id}`, data);
    return res.data;
  },

  // Refunds
  async listRefunds(params?: { status?: string }) {
    const res = await apiClient.get('/api/admin/refunds', { params });
    return res.data;
  },

  async createRefund(data: {
    order_id: number; return_id?: number; amount: number; reason: string; notes?: string;
  }) {
    const res = await apiClient.post('/api/admin/refunds', data);
    return res.data;
  },

  async updateRefund(id: number, data: { status: string; notes?: string }) {
    const res = await apiClient.patch(`/api/admin/refunds/${id}`, data);
    return res.data;
  },

  // Reviews moderation
  async approveReview(id: number) {
    const res = await apiClient.patch(`/api/reviews/${id}/approve`);
    return res.data;
  },

  async deleteReview(id: number) {
    const res = await apiClient.delete(`/api/reviews/${id}`);
    return res.data;
  },

  // Coupons
  async listCoupons() {
    const res = await apiClient.get('/api/admin/coupons');
    return res.data;
  },

  async createCoupon(data: {
    code: string; discount_type: string; discount_value: number;
    min_order_amount?: number; max_uses?: number; expires_at?: string; is_active: boolean;
  }) {
    const res = await apiClient.post('/api/admin/coupons', data);
    return res.data;
  },

  async updateCoupon(id: number, data: Record<string, unknown>) {
    const res = await apiClient.patch(`/api/admin/coupons/${id}`, data);
    return res.data;
  },

  async deactivateCoupon(id: number) {
    const res = await apiClient.delete(`/api/admin/coupons/${id}`);
    return res.data;
  },

  // Inventory
  async listInventory() {
    const res = await apiClient.get('/api/inventory');
    return res.data;
  },

  async getLowStock() {
    const res = await apiClient.get('/api/inventory/low-stock');
    return res.data;
  },

  async listInventoryTransactions(product_id?: number) {
    const res = await apiClient.get('/api/inventory/transactions', {
      params: product_id ? { product_id } : undefined,
    });
    return res.data;
  },

  async stockIn(data: { product_id: number; quantity: number; reorder_level?: number; notes?: string }) {
    const res = await apiClient.post('/api/inventory/stock-in', data);
    return res.data;
  },

  async stockOut(data: { product_id: number; quantity: number; notes?: string }) {
    const res = await apiClient.post('/api/inventory/stock-out', data);
    return res.data;
  },

  async adjustInventory(data: { product_id: number; new_quantity: number; notes: string }) {
    const res = await apiClient.post('/api/inventory/adjustment', data);
    return res.data;
  },
};

  async getReviews(): Promise<any[]> {
    const res = await apiClient.get('/api/admin/reviews');
    return res.data;
  },

  async deleteReview(id: number) {
    const res = await apiClient.delete(`/api/admin/reviews/${id}`);
    return res.data;
  },

  async getPublicSettings() {
    const res = await apiClient.get('/api/settings/public');
    return res.data;
  },

  async uploadSettingsImage(formData: FormData): Promise<{ url: string }> {
    const res = await apiClient.post<{ url: string }>('/api/admin/settings/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

export const publicSettingsService = {
  async get() {
    const res = await apiClient.get('/api/settings/public');
    return res.data;
  },
};
