import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, DollarSign, Clock, Truck, Users, AlertTriangle } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatCurrency, formatDate } from '../../utils/format';
import { OrderStatusBadge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import type { DashboardData } from '../../types';

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

  useEffect(() => {
    adminService.getDashboard().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </div>
  );

  if (!data) return <div className="text-gray-500 text-sm">Could not load dashboard.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of your store</p>
        </div>
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

      <div className="grid lg:grid-cols-2 gap-6">
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
