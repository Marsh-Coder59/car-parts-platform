import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag, DollarSign, Clock, Truck, Users, AlertTriangle,
  Plus, ClipboardList, Boxes, TrendingUp,
} from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatCurrency, formatDate } from '../../utils/format';
import { OrderStatusBadge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import type { DashboardData } from '../../types';

interface TopProduct {
  product_id: number;
  product_name: string;
  sku: string;
  total_quantity: number;
  total_revenue: number;
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-4 py-3 bg-white rounded-xl border border-gray-100 hover:border-brand-200 hover:bg-brand-50/50 transition-colors text-sm font-semibold text-gray-700 hover:text-brand-700"
    >
      <span className="p-1.5 bg-brand-50 rounded-lg text-brand-600">{icon}</span>
      {label}
    </Link>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className={`text-2xl font-extrabold ${color || 'text-gray-900'}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className="p-2.5 bg-brand-50 rounded-lg text-brand-500">{icon}</div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [topProducts, setTopProducts] = useState<TopProduct[] | null>(null);

  useEffect(() => {
    adminService.getDashboard()
      .then(setData)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    adminService.getTopProducts(5).then(setTopProducts).catch(() => setTopProducts([]));
  }, []);

  if (loading) return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </div>
  );

  if (loadError || !data) return (
    <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-gray-300 mx-auto mb-3" />
      <p className="text-sm font-semibold text-gray-900">Could not load the dashboard</p>
      <p className="text-xs text-gray-500 mt-1">Check your connection and try refreshing the page.</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of your store</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <QuickAction to="/admin/products" icon={<Plus className="h-4 w-4" />} label="Add Product" />
        <QuickAction to="/admin/orders" icon={<ClipboardList className="h-4 w-4" />} label="View Orders" />
        <QuickAction to="/admin/inventory" icon={<Boxes className="h-4 w-4" />} label="Manage Inventory" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="Total Orders" value={data.total_orders} sub={`${data.recent_orders_30d} last 30 days`} />
        <StatCard icon={<DollarSign className="h-5 w-5" />} label="Total Sales" value={formatCurrency(data.total_sales)} color="text-green-700" />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Pending Payments" value={data.pending_payments} color={data.pending_payments > 0 ? 'text-orange-600' : 'text-gray-900'} />
        <StatCard icon={<Truck className="h-5 w-5" />} label="Pending Deliveries" value={data.pending_deliveries} />
        <StatCard icon={<Users className="h-5 w-5" />} label="Customers" value={data.customer_count} />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Low Stock" value={data.low_stock_products.length} color={data.low_stock_products.length > 0 ? 'text-red-600' : 'text-gray-900'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Top-selling products */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-brand-500" /> Top Selling Products
            </h2>
          </div>
          {topProducts === null ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : topProducts.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No sales yet</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.product_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{p.product_name}</p>
                      <p className="text-xs text-gray-400">{p.total_quantity} sold</p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-900 flex-shrink-0">{formatCurrency(p.total_revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900">Recent Orders</h2>
            <Link to="/admin/orders" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {data.recent_orders.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No recent orders</p>
          ) : (
            <div className="space-y-2">
              {data.recent_orders.map(order => (
                <Link key={order.id} to={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{order.order_number}</p>
                    <p className="text-xs text-gray-500">{order.customer} · {formatDate(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gray-900">{formatCurrency(order.total)}</p>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Low stock */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900">Low Stock Products</h2>
            <Link to="/admin/inventory" className="text-xs text-brand-600 hover:underline">View inventory</Link>
          </div>
          {data.low_stock_products.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">All products are well-stocked</p>
          ) : (
            <div className="space-y-2">
              {data.low_stock_products.map(p => (
                <div key={p.product_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">SKU: {p.sku || '—'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-red-600">{p.available} left</span>
                    <p className="text-xs text-gray-400">Reorder at {p.reorder_level}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
