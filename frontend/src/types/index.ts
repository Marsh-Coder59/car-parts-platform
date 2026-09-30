// ─────────────────────────────────────────────
// All types derived from actual main.py responses
// ─────────────────────────────────────────────

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role: Role;
  status: UserStatus;
  email_verified: boolean;
  created_at: string;
  last_login_at?: string;
}

export interface AuthUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  message: string;
  user: AuthUser;
  token: string;
}

// Products
export type ProductCondition = 'NEW' | 'USED' | 'REFURBISHED';
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED';

export interface ProductListItem {
  id: number;
  name: string;
  slug?: string;
  sku?: string;
  part_number?: string;
  price: number;
  compare_at_price?: number;
  condition: ProductCondition;
  status: ProductStatus;
  is_featured: boolean;
  created_at: string;
  category?: string;
  brand?: string;
  available_stock: number;
  primary_image?: string;
}

export interface ProductDetail extends ProductListItem {
  description?: string;
  weight?: number;
  updated_at: string;
  category: { id: number; name: string } | string;
  brand: { id: number; name: string } | string;
  inventory: { quantity: number; reserved: number; available: number };
  images: ProductImage[];
  compatible_vehicles: Vehicle[];
}

export interface ProductImage {
  id: number;
  image_url: string;
  alt_text?: string;
  sort_order: number;
  is_primary: boolean;
}

export interface ProductListResponse {
  count: number;
  page: number;
  page_size: number;
  products: ProductListItem[];
}

// Categories
export interface Category {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  image_url?: string;
  parent_id?: number;
  is_active: boolean;
}

// Brands
export interface Brand {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  logo_url?: string;
  is_active: boolean;
}

// Vehicles
export interface Vehicle {
  id: number;
  make: string;
  model: string;
  generation?: string;
  year_from?: number;
  year_to?: number;
  engine?: string;
  fuel_type?: string;
  transmission?: string;
}

// Addresses
export interface Address {
  id: number;
  label?: string;
  full_name: string;
  phone?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  county?: string;
  country: string;
  postal_code?: string;
  is_default: boolean;
}

// Cart
export interface CartItem {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string;
  part_number?: string;
  unit_price: number;
  product_status: ProductStatus;
  quantity: number;
  item_total: number;
  available_stock: number;
  in_stock: boolean;
}

export interface Cart {
  cart_id: number;
  items: CartItem[];
  item_count: number;
  subtotal: number;
}

// Orders
export type OrderStatus =
  | 'PENDING' | 'AWAITING_DEPOSIT' | 'DEPOSIT_VERIFICATION'
  | 'PROCESSING' | 'READY_FOR_DISPATCH' | 'DISPATCHED'
  | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'AWAITING_BALANCE'
  | 'COMPLETED' | 'CANCELLED' | 'RETURN_REQUESTED'
  | 'RETURNED' | 'REFUNDED';

export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'FAILED';

export interface OrderItem {
  id: number;
  product_id?: number;
  product_name: string;
  sku?: string;
  part_number?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface OrderEvent {
  id: number;
  event_type: string;
  description?: string;
  old_status?: string;
  new_status?: string;
  created_at: string;
}

export interface Payment {
  id: number;
  type: 'DEPOSIT' | 'BALANCE' | 'REFUND';
  method: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reference?: string;
  submitted_at?: string;
  verified_at?: string;
  notes?: string;
}

export interface Delivery {
  id: number;
  method?: string;
  courier?: string;
  tracking_number?: string;
  status: string;
  estimated_date?: string;
  dispatched_at?: string;
  delivered_at?: string;
}

export interface Order {
  id: number;
  order_number: string;
  user_id: number;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  deposit_percentage: number;
  deposit_amount: number;
  deposit_paid: boolean;
  balance_percentage: number;
  balance_amount: number;
  balance_paid: boolean;
  payment_status: string;
  order_status: OrderStatus;
  shipping_address_id?: number;
  created_at: string;
  updated_at: string;
  customer?: { first_name: string; last_name: string; email: string };
  items: OrderItem[];
  events: OrderEvent[];
  payments: Payment[];
  delivery?: Delivery;
}

export interface OrderListItem {
  id: number;
  order_number: string;
  total_amount: number;
  deposit_amount: number;
  balance_amount: number;
  deposit_paid: boolean;
  balance_paid: boolean;
  payment_status: string;
  order_status: OrderStatus;
  created_at: string;
  customer?: string;
  email?: string;
}

// Bank details
export interface BankDetails {
  order_number: string;
  total_amount: number;
  deposit_amount: number;
  balance_amount: number;
  deposit_paid: boolean;
  balance_paid: boolean;
  order_status: OrderStatus;
  bank: {
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    branch?: string;
  };
  reference: string;
}

// Payments (admin)
export interface AdminPayment {
  id: number;
  order_id: number;
  order_number: string;
  type: string;
  method: string;
  amount: number;
  currency: string;
  reference?: string;
  status: PaymentStatus;
  submitted_at?: string;
  verified_at?: string;
  customer: string;
  email: string;
  notes?: string;
}

// Reviews
export interface Review {
  id: number;
  rating: number;
  title?: string;
  comment?: string;
  status: string;
  created_at: string;
  reviewer: string;
}

// Wishlist
export interface WishlistItem {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string;
  price: number;
  status: ProductStatus;
  image?: string;
}

export interface Wishlist {
  wishlist_id: number;
  items: WishlistItem[];
}

// Notifications
export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  channel: string;
  status: 'UNREAD' | 'READ';
  read_at?: string;
  created_at: string;
}

// Inventory
export interface InventoryItem {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  reorder_level: number;
  updated_at: string;
}

// Coupons
export interface Coupon {
  id: number;
  code: string;
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: number;
  min_order_amount?: number;
  max_uses?: number;
  expires_at?: string;
  is_active: boolean;
}

// Site settings
export interface PublicSettings {
  business_name?: string;
  business_email?: string;
  business_phone?: string;
  whatsapp_number?: string;
  facebook_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
  x_url?: string;
  logo_url?: string;
  favicon_url?: string;
  banner_url?: string;
}

export interface AdminSettings extends PublicSettings {
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_branch?: string;
  default_deposit_percentage?: number;
  default_balance_percentage?: number;
  default_delivery_fee?: number;
  free_delivery_threshold?: number;
}

// Dashboard
export interface DashboardData {
  total_orders: number;
  total_sales: number;
  recent_orders_30d: number;
  pending_payments: number;
  pending_deliveries: number;
  customer_count: number;
  low_stock_products: Array<{
    product_id: number;
    name: string;
    sku?: string;
    available: number;
    reorder_level: number;
  }>;
  recent_orders: Array<{
    id: number;
    order_number: string;
    customer: string;
    total: number;
    status: string;
    created_at: string;
  }>;
}

// Returns
export interface Return {
  id: number;
  order_id: number;
  order_number: string;
  reason: string;
  notes?: string;
  status: string;
  created_at: string;
  customer_email?: string;
  customer?: { first_name: string; last_name: string; email: string };
}

// Refunds
export interface Refund {
  id: number;
  order_id: number;
  order_number: string;
  amount?: number;
  reason?: string;
  status: string;
  created_at: string;
  customer_email: string;
  notes?: string;
}

// Delivery admin list
export interface DeliveryListItem {
  id: number;
  order_id: number;
  order_number: string;
  method?: string;
  courier?: string;
  tracking_number?: string;
  status: string;
  estimated_date?: string;
  dispatched_at?: string;
  delivered_at?: string;
}

// Customer detail
export interface CustomerDetail {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  status: UserStatus;
  email_verified: boolean;
  created_at: string;
  last_login_at?: string;
  stats: {
    total_orders: number;
    total_spent: number;
    outstanding_balance: number;
  };
  recent_orders: Array<{
    id: number;
    order_number: string;
    total: number;
    status: string;
    created_at: string;
  }>;
}

// API error
export interface ApiError {
  detail: string | { errors?: string[] };
  status?: number;
}
