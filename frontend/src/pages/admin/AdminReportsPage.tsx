import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service';
import { formatCurrency, formatDate } from '../../utils/format';
import { SkeletonLines } from '../../components/ui/Skeleton';
import { Input } from '../../components/ui/Input';

export default function AdminReportsPage() {
  const [sales, setSales] = useState<{ date: string; order_count: number; revenue: number; deposit_collected: number; balance_outstanding: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ product_name: string; sku: string; total_quantity: number; total_revenue: number }[]>([]);
  const [outstanding, setOutstanding] = useState<{ order_number: string; customer: string; balance_due: number; status: string }[]>([]);
  const [orderStatusCounts, setOrderStatusCounts] = useState<{ status: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      adminService.getSalesReport({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
      adminService.getTopProducts(10),
      adminService.getOutstandingBalances(),
      adminService.getOrderStatusCounts(),
    ]).then(([s, tp, ob, osc]) => {
      setSales(s);
      setTopProducts(tp);
      setOutstanding(ob);
      setOrderStatusCounts(osc);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const totalRevenue = sales.reduce((s, r) => s + Number(r.revenue), 0);
  const totalOrders = sales.reduce((s, r) => s + r.order_count, 0);

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900 mb-6">Reports</h1>

      {/* Date filter */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 flex flex-wrap gap-4 items-end">
        <Input label="From Date" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-44" />
        <Input label="To Date" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-44" />
        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-sm text-gray-500 hover:text-gray-700 mb-0.5">
          Clear
        </button>
      </div>

      {loading ? <SkeletonLines lines={10} /> : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: 'text-green-700' },
              { label: 'Total Orders', value: String(totalOrders) },
              { label: 'Outstanding Balances', value: String(outstanding.length) },
              { label: 'Top Product Revenue', value: topProducts[0] ? formatCurrency(topProducts[0].total_revenue) : '—' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-xl font-extrabold ${s.color || 'text-gray-900'}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Sales by day */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Sales by Day</h2>
              {sales.length === 0 ? <p className="text-sm text-gray-400">No sales in selected period.</p> : (
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-gray-500">
                      <th className="text-left pb-2">Date</th>
                      <th className="text-right pb-2">Orders</th>
                      <th className="text-right pb-2">Revenue</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {sales.slice(0, 30).map(row => (
                        <tr key={row.date}>
                          <td className="py-1.5 text-gray-600">{formatDate(row.date)}</td>
                          <td className="py-1.5 text-right text-gray-900 font-medium">{row.order_count}</td>
                          <td className="py-1.5 text-right font-semibold text-gray-900">{formatCurrency(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Top Products</h2>
              {topProducts.length === 0 ? <p className="text-sm text-gray-400">No sales data.</p> : (
                <div className="space-y-2">
                  {topProducts.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-5 text-xs text-gray-400 font-semibold">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-900 line-clamp-1">{p.product_name}</p>
                        <p className="text-xs text-gray-400">{p.total_quantity} units sold</p>
                      </div>
                      <span className="text-xs font-bold text-gray-900">{formatCurrency(p.total_revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Order status breakdown */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Orders by Status</h2>
            <div className="flex flex-wrap gap-3">
              {orderStatusCounts.map(s => (
                <div key={s.status} className="px-3 py-2 bg-gray-50 rounded-lg text-center">
                  <p className="text-lg font-bold text-gray-900">{s.count}</p>
                  <p className="text-xs text-gray-500">{s.status.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Outstanding balances */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Outstanding Balances ({outstanding.length})</h2>
            {outstanding.length === 0 ? <p className="text-sm text-gray-400">No outstanding balances.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left pb-2">Order</th>
                    <th className="text-left pb-2">Customer</th>
                    <th className="text-right pb-2">Balance Due</th>
                    <th className="text-left pb-2">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {outstanding.map(o => (
                      <tr key={o.order_number}>
                        <td className="py-2 font-mono text-xs font-semibold">{o.order_number}</td>
                        <td className="py-2 text-gray-600">{o.customer}</td>
                        <td className="py-2 text-right font-bold text-gray-900">{formatCurrency(o.balance_due)}</td>
                        <td className="py-2 text-xs text-gray-500">{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
