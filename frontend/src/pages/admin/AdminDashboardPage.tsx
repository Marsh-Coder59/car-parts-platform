import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, PackageCheck, ShoppingBag, Clock3, Wallet, AlertTriangle,
  Users, RotateCcw, Plus, ClipboardList, Boxes, TrendingUp, TrendingDown,
  Calendar,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { adminService } from '../../services/admin.service';
import { formatCurrency } from '../../utils/format';
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

interface SalesDay {
  day: string;
  order_count: number;
  revenue: number;
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-4 py-3 bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 hover:border-brand-200 dark:hover:border-brand-500/40 hover:bg-brand-50/50 dark:hover:bg-brand-900/10 transition-colors text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-brand-700 dark:hover:text-brand-400"
    >
      <span className="p-1.5 bg-brand-50 dark:bg-brand-900/20 rounded-lg text-brand-600">{icon}</span>
      {label}
    </Link>
  );
}

function DeltaBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{pct}% <span className="text-gray-400 dark:text-gray-500 font-normal">from last month</span>
    </span>
  );
}

function StatCard({
  icon, iconBg, iconColor, label, value, delta, attentionLabel,
}: {
  icon: React.ReactNode; iconBg: string; iconColor: string; label: string; value: string | number;
  delta?: number; attentionLabel?: string;
}) {
  return (
    <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-4">
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconBg} ${iconColor}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-gray-50 leading-tight">{value}</p>
          <div className="mt-1">
            {attentionLabel ? (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{attentionLabel}</span>
            ) : delta !== undefined ? (
              <DeltaBadge pct={delta} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildLast7Days(rows: SalesDay[]) {
  const byDay = new Map(rows.map(r => [String(r.day).slice(0, 10), r]));
  const out: { label: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: row ? Number(row.revenue) : 0,
    });
  }
  return out;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [topProducts, setTopProducts] = useState<TopProduct[] | null>(null);
  const [salesTrend, setSalesTrend] = useState<{ label: string; revenue: number }[] | null>(null);

  useEffect(() => {
    adminService.getDashboard()
      .then(setData)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    adminService.getTopProducts(5).then(setTopProducts).catch(() => setTopProducts([]));

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    adminService.getSalesReport({
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
    }).then((rows: SalesDay[]) => setSalesTrend(buildLast7Days(rows || [])))
      .catch(() => setSalesTrend(buildLast7Days([])));
  }, []);

  if (loading) return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    </div>
  );

  if (loadError || !data) return (
    <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-gray-300 mx-auto mb-3" />
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">Could not load the dashboard</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Check your connection and try refreshing the page.</p>
    </div>
  );

  const todayLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Welcome back! Here's what's happening with your store today.</p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-dark-800 border border-gray-100 dark:border-dark-700 rounded-lg px-3 py-2 flex-shrink-0">
          <Calendar className="h-3.5 w-3.5" />
          {todayLabel}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <QuickAction to="/admin/products" icon={<Plus className="h-4 w-4" />} label="Add Product" />
        <QuickAction to="/admin/orders" icon={<ClipboardList className="h-4 w-4" />} label="View Orders" />
        <QuickAction to="/admin/inventory" icon={<Boxes className="h-4 w-4" />} label="Manage Inventory" />
      </div>

      {/* 8-card stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Package className="h-5 w-5" />} iconBg="bg-blue-50 dark:bg-blue-900/20" iconColor="text-blue-500"
          label="Total Products" value={data.total_products.toLocaleString()} delta={data.deltas_30d.total_products}
        />
        <StatCard
          icon={<PackageCheck className="h-5 w-5" />} iconBg="bg-emerald-50 dark:bg-emerald-900/20" iconColor="text-emerald-500"
          label="Active Products" value={data.active_products.toLocaleString()} delta={data.deltas_30d.active_products}
        />
        <StatCard
          icon={<ShoppingBag className="h-5 w-5" />} iconBg="bg-sky-50 dark:bg-sky-900/20" iconColor="text-sky-500"
          label="Total Orders" value={data.total_orders.toLocaleString()} delta={data.deltas_30d.total_orders}
        />
        <StatCard
          icon={<Clock3 className="h-5 w-5" />} iconBg="bg-rose-50 dark:bg-rose-900/20" iconColor="text-rose-500"
          label="Pending Orders" value={data.pending_orders.toLocaleString()} delta={data.deltas_30d.pending_orders}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />} iconBg="bg-violet-50 dark:bg-violet-900/20" iconColor="text-violet-500"
          label="Total Revenue" value={formatCurrency(data.total_sales)} delta={data.deltas_30d.total_sales}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />} iconBg="bg-amber-50 dark:bg-amber-900/20" iconColor="text-amber-500"
          label="Low Stock Items" value={data.low_stock_products.length} attentionLabel="Needs attention"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />} iconBg="bg-indigo-50 dark:bg-indigo-900/20" iconColor="text-indigo-500"
          label="Registered Customers" value={data.customer_count.toLocaleString()} delta={data.deltas_30d.customer_count}
        />
        <StatCard
          icon={<RotateCcw className="h-5 w-5" />} iconBg="bg-red-50 dark:bg-red-900/20" iconColor="text-red-500"
          label="Returns/Refunds" value={data.returns_refunds_count} attentionLabel="Needs review"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Sales overview chart */}
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50">Sales Overview</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">Last 7 days</span>
          </div>
          <div className="h-48 -ml-2">
            {salesTrend === null ? (
              <Skeleton className="h-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-dark-700" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={40}
                    tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}K` : String(v)} />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f3f4f6' }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: '#f97316' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top-selling products */}
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50">Top Selling Products</h2>
            <Link to="/admin/reports" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {topProducts === null ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : topProducts.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No sales yet</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.product_id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-dark-700 last:border-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-4 flex-shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 truncate">{p.product_name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{p.total_quantity} sold</p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 flex-shrink-0">{formatCurrency(p.total_revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50">Recent Orders</h2>
            <Link to="/admin/orders" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {data.recent_orders.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No recent orders</p>
          ) : (
            <div className="space-y-2">
              {data.recent_orders.slice(0, 5).map(order => (
                <Link key={order.id} to={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-dark-700 last:border-0 hover:bg-gray-50 dark:hover:bg-dark-700 -mx-2 px-2 rounded-lg transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 truncate">{order.order_number}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{order.customer}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-50">{formatCurrency(order.total)}</p>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low stock — secondary panel (not in the reference layout's main
          row, but kept since it's real, already-wired inventory data worth
          surfacing on the overview). */}
      {data.low_stock_products.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50">Low Stock Products</h2>
            <Link to="/admin/inventory" className="text-xs text-brand-600 hover:underline">View inventory</Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.low_stock_products.map(p => (
              <div key={p.product_id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-dark-900 rounded-lg">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">SKU: {p.sku || '—'}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">{p.available} left</span>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Reorder at {p.reorder_level}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
