import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { ordersService } from '../../services/orders.service';
import { formatDate, formatCurrency, getOrderStatusColor } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';

export default function AdminDeliveriesPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Filter orders that are in delivery-related statuses
    ordersService.list({
      status: 'DISPATCHED,OUT_FOR_DELIVERY,READY_FOR_DISPATCH',
      page_size: 50,
    }).then((res: any) => {
      setOrders(res.orders ?? res);
    }).catch(() => setOrders([]))
    .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonTable rows={8} cols={5} />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Truck className="h-6 w-6 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">Deliveries</h1>
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No active deliveries" description="Orders in dispatched or out-for-delivery status will appear here." />
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-dark-700">
                <tr>
                  {['Order', 'Customer', 'Total', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
                {orders.map((o: any) => (
                  <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-200">#{o.order_number || o.id}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{o.customer_name || `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || '—'}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(o.total_amount)}</td>
                    <td className="px-4 py-3">
                      <Badge className={getOrderStatusColor(o.status)}>{o.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">{formatDate(o.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/orders/${o.id}`} className="text-xs text-brand-600 hover:underline font-medium">View Order</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
