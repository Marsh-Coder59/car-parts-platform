import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageSearch, ChevronDown } from 'lucide-react';
import { ordersService } from '../../services/orders.service';
import { SkeletonLines } from '../../components/ui/Skeleton';
import { OrderStatusBadge } from '../../components/ui/Badge';
import OrderTrackingTimeline from '../../components/shared/OrderTrackingTimeline';
import { formatDate } from '../../utils/format';
import type { Order, OrderListItem } from '../../types';

const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'RETURNED'];

export default function TrackingPage() {
  const [allOrders, setAllOrders] = useState<OrderListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Load the customer's orders, newest first (that's how the API already
  // returns them), and default the selection to the most recent order
  // that's still actively moving — falling back to the most recent order
  // overall (e.g. already delivered/completed) if none are active.
  useEffect(() => {
    ordersService.list({ page_size: 50 })
      .then(orders => {
        setAllOrders(orders);
        const active = orders.find(o => !TERMINAL_STATUSES.includes(o.order_status));
        const defaultOrder = active ?? orders[0] ?? null;
        setSelectedId(defaultOrder?.id ?? null);
      })
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setOrder(null); return; }
    setLoadingOrder(true);
    ordersService.get(selectedId)
      .then(setOrder)
      .finally(() => setLoadingOrder(false));
  }, [selectedId]);

  if (loadingList) {
    return <div className="max-w-2xl mx-auto px-4 py-10"><SkeletonLines lines={8} /></div>;
  }

  if (allOrders.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-dark-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <PackageSearch className="h-8 w-8 text-gray-400 dark:text-gray-500" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">There's no order here yet</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Once you place an order, you'll be able to track its progress here — from payment through delivery.
        </p>
        <Link to="/products" className="inline-block px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition-colors">
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-50 mb-1">Track Your Order</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Live-ish status of your order as it moves from payment to delivery.
      </p>

      {allOrders.length > 1 && (
        <div className="relative mb-5">
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(parseInt(e.target.value))}
            className="w-full appearance-none px-4 py-2.5 pr-9 border border-gray-200 dark:border-dark-600 rounded-lg text-sm bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {allOrders.map(o => (
              <option key={o.id} value={o.id}>
                {o.order_number} — {o.order_status.replace(/_/g, ' ')} ({formatDate(o.created_at)})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      )}

      {loadingOrder || !order ? (
        <SkeletonLines lines={6} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{order.order_number}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(order.created_at)}</p>
            </div>
            <OrderStatusBadge status={order.order_status} />
          </div>

          <OrderTrackingTimeline order={order} />

          <div className="mt-4 text-center">
            <Link to={`/orders/${order.id}`} className="text-sm text-brand-600 hover:underline font-medium">
              View full order details →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
