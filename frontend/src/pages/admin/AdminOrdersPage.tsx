import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import { ordersService } from '../../services/orders.service';
import { formatCurrency, formatDate } from '../../utils/format';
import { OrderStatusBadge } from '../../components/ui/Badge';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { Select } from '../../components/ui/Input';
import Pagination from '../../components/ui/Pagination';
import type { OrderListItem } from '../../types';

const PAGE_SIZE = 20;
const STATUSES = ['', 'PENDING', 'AWAITING_DEPOSIT', 'DEPOSIT_VERIFICATION', 'PROCESSING',
  'READY_FOR_DISPATCH', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED',
  'AWAITING_BALANCE', 'COMPLETED', 'CANCELLED', 'REFUNDED'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    ordersService.list({ status: status || undefined, page, page_size: PAGE_SIZE })
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [status, page]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Orders</h1>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-56">
          {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </Select>
      </div>

      {loading ? <SkeletonTable rows={8} cols={5} /> : orders.length === 0 ? (
        <EmptyState title="No orders found" description="Orders will appear here." />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Order', 'Customer', 'Total', 'Deposit', 'Status', 'Date', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900">{order.order_number}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{order.email || order.customer}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(order.total_amount)}</td>
                      <td className="px-4 py-3">
                        {order.deposit_paid
                          ? <span className="text-green-600 font-medium text-xs">✓ Paid</span>
                          : <span className="text-orange-500 text-xs">Pending</span>}
                      </td>
                      <td className="px-4 py-3"><OrderStatusBadge status={order.order_status} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(order.created_at)}</td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/orders/${order.id}`} className="text-brand-600 hover:text-brand-700">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={orders.length < PAGE_SIZE ? (page - 1) * PAGE_SIZE + orders.length : page * PAGE_SIZE + 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}
