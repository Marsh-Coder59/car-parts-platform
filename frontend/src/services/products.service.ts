import { apiClient } from './api';
import type {
  ProductListResponse, ProductDetail, ProductImage,
  Category, Brand, Vehicle
} from '../types';

export interface ProductFilters {
  search?: string;
  category_id?: number;
  brand_id?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: number;
  condition?: string;
  status?: string;
  min_price?: number;
  max_price?: number;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}

export const productsService = {
  async list(filters: ProductFilters = {}): Promise<ProductListResponse> {
    const res = await apiClient.get<ProductListResponse>('/api/products', { params: filters });
    return res.data;
  },

  async get(id: number): Promise<ProductDetail> {
    const res = await apiClient.get<ProductDetail>(`/api/products/${id}`);
    return res.data;
  },

  async create(data: Record<string, unknown>) {
    const res = await apiClient.post('/api/products', data);
    return res.data;
  },

  async update(id: number, data: Record<string, unknown>) {
    const res = await apiClient.patch(`/api/products/${id}`, data);
    return res.data;
  },

  async archive(id: number) {
    const res = await apiClient.delete(`/api/products/${id}`);
    return res.data;
  },

  async addImage(productId: number, data: {
    image_url: string;
    alt_text?: string;
    sort_order?: number;
    is_primary?: boolean;
  }) {
    const res = await apiClient.post(`/api/products/${productId}/images`, data);
    return res.data;
  },

  async deleteImage(productId: number, imageId: number) {
    const res = await apiClient.delete(`/api/products/${productId}/images/${imageId}`);
    return res.data;
  },

  async getCompatibility(productId: number): Promise<Vehicle[]> {
    const res = await apiClient.get<Vehicle[]>(`/api/products/${productId}/compatibility`);
    return res.data;
  },

  async addCompatibility(productId: number, vehicle_id: number) {
    const res = await apiClient.post(`/api/products/${productId}/compatibility`, { vehicle_id });
    return res.data;
  },

  async removeCompatibility(productId: number, vehicleId: number) {
    const res = await apiClient.delete(`/api/products/${productId}/compatibility/${vehicleId}`);
    return res.data;
  },

  async getReviews(productId: number) {
    const res = await apiClient.get(`/api/products/${productId}/reviews`);
    return res.data;
  },
};

export const categoriesService = {
  async list(): Promise<Category[]> {
    const res = await apiClient.get<Category[]>('/api/categories');
    return res.data;
  },
  async get(id: number): Promise<Category> {
    const res = await apiClient.get<Category>(`/api/categories/${id}`);
    return res.data;
  },
  async create(data: Partial<Category>) {
    const res = await apiClient.post('/api/categories', data);
    return res.data;
  },
  async update(id: number, data: Partial<Category>) {
    const res = await apiClient.patch(`/api/categories/${id}`, data);
    return res.data;
  },
  async delete(id: number) {
    const res = await apiClient.delete(`/api/categories/${id}`);
    return res.data;
  },
};

export const brandsService = {
  async list(): Promise<Brand[]> {
    const res = await apiClient.get<Brand[]>('/api/brands');
    return res.data;
  },
  async create(data: Partial<Brand>) {
    const res = await apiClient.post('/api/brands', data);
    return res.data;
  },
  async update(id: number, data: Partial<Brand>) {
    const res = await apiClient.patch(`/api/brands/${id}`, data);
    return res.data;
  },
  async delete(id: number) {
    const res = await apiClient.delete(`/api/brands/${id}`);
    return res.data;
  },
};

export const vehiclesService = {
  async list(params?: {
    make?: string; model?: string; year?: number;
    fuel_type?: string; transmission?: string;
  }): Promise<Vehicle[]> {
    const res = await apiClient.get<Vehicle[]>('/api/vehicles', { params });
    return res.data;
  },
  async get(id: number): Promise<Vehicle> {
    const res = await apiClient.get<Vehicle>(`/api/vehicles/${id}`);
    return res.data;
  },
  async getProducts(vehicleId: number, page = 1) {
    const res = await apiClient.get(`/api/vehicles/${vehicleId}/products`, {
      params: { page, page_size: 20 },
    });
    return res.data;
  },
  async create(data: Partial<Vehicle>) {
    const res = await apiClient.post('/api/vehicles', data);
    return res.data;
  },
  async update(id: number, data: Partial<Vehicle>) {
    const res = await apiClient.patch(`/api/vehicles/${id}`, data);
    return res.data;
  },
  async delete(id: number) {
    const res = await apiClient.delete(`/api/vehicles/${id}`);
    return res.data;
  },
};
