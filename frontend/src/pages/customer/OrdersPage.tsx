import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronRight } from 'lucide-react';
import { ordersService } from '../../services/orders.service';
import { formatCurrency, formatDate } from '../../utils/format';
import { OrderStatusBadge } from '../../components/ui/Badge';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const [orders, setOrders] = useState<{ orders: unknown[]; total: number } | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    ordersService.history(page, PAGE_SIZE)
      .then(data => setOrders(data))
      .finally(() => setLoading(false));
  }, [page]);

  const orderList = orders?.orders as Array<{
    id: number; order_number: string; total: number;
    deposit: number; balance: number; deposit_paid: boolean;
    balance_paid: boolean; payment_status: string; order_status: string; created_at: string;
  }> ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-6">My Orders</h1>

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : orderList.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No orders yet"
          description="Once you place an order, it will appear here."
          action={<Link to="/products" className="px-5 py-2 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 text-sm">Shop Now</Link>}
        />
      ) : (
        <>
          <div className="space-y-3">
            {orderList.map(order => (
              <Link key={order.id} to={`/orders/${order.id}`}
                className="block bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-4 hover:border-brand-200 hover:shadow-sm transition-all group">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-50">{order.order_number}</span>
                      <OrderStatusBadge status={order.order_status} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-50">{formatCurrency(order.total)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Deposit: {order.deposit_paid ? <span className="text-green-600">Paid</span> : <span className="text-orange-600">Pending</span>}
                        {' · '}
                        Balance: {order.balance_paid ? <span className="text-green-600">Paid</span> : <span className="text-gray-400 dark:text-gray-500">Due</span>}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-brand-500 transition-colors flex-shrink-0" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={orders?.total ?? 0} onChange={setPage} />
        </>
      )}
    </div>
  );
}
