import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, ShieldCheck, PackageCheck, Truck, Home, ClipboardList } from 'lucide-react';
import type { Order } from '../../types';

interface Props {
  order: Order;
}

type StepState = 'done' | 'current' | 'upcoming';

const STEP_ORDER = [
  'PLACED',
  'PAYMENT_VERIFICATION',
  'PROCESSING',
  'READY_FOR_DISPATCH',
  'DISPATCHED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

type StepKey = (typeof STEP_ORDER)[number];

const STEP_META: Record<StepKey, { label: string; sub: string; icon: typeof CheckCircle2 }> = {
  PLACED: { label: 'Order Placed', sub: 'Awaiting your deposit payment', icon: ClipboardList },
  PAYMENT_VERIFICATION: { label: 'Payment Verification', sub: 'Our team is confirming your deposit', icon: ShieldCheck },
  PROCESSING: { label: 'Payment Confirmed', sub: 'Your order is being prepared', icon: CreditCard },
  READY_FOR_DISPATCH: { label: 'Added to Dispatch', sub: 'Packed and ready to leave the warehouse', icon: PackageCheck },
  DISPATCHED: { label: 'Dispatched', sub: 'On its way to the courier', icon: Truck },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', sub: 'Heading to you now', icon: Truck },
  DELIVERED: { label: 'Delivered', sub: 'Order received', icon: Home },
};

// Every real backend order_status maps onto exactly one step in the
// 7-step tracker above, so there's always something meaningful to show
// regardless of how early or late the order is in its lifecycle —
// previously this only started rendering after payment was confirmed,
// so an order still awaiting deposit showed nothing that looked like a
// tracker at all.
const STATUS_TO_STEP_INDEX: Record<string, number> = {
  PENDING: 0,
  AWAITING_DEPOSIT: 0,
  DEPOSIT_VERIFICATION: 1,
  PROCESSING: 2,
  READY_FOR_DISPATCH: 3,
  DISPATCHED: 4,
  OUT_FOR_DELIVERY: 5,
  DELIVERED: 6,
  AWAITING_BALANCE: 6,
  COMPLETED: 6,
};

function useAnimatedDeliveryProgress(order: Order): number {
  const delivery = order.delivery;
  const [displayPct, setDisplayPct] = useState(0);
  const targetRef = useRef(0);

  useEffect(() => {
    if (order.order_status === 'DELIVERED' || order.order_status === 'AWAITING_BALANCE' || order.order_status === 'COMPLETED') {
      targetRef.current = 100;
      setDisplayPct(100);
      return;
    }
    if (order.order_status !== 'OUT_FOR_DELIVERY' && order.order_status !== 'DISPATCHED') {
      targetRef.current = 0;
      setDisplayPct(0);
      return;
    }

    // Mock progress — explicitly NOT real GPS/geolocation. We estimate how
    // "close" the delivery is purely from elapsed time between when it was
    // dispatched and when it's estimated to arrive, so the number moves
    // smoothly and believably without pretending to track a real vehicle.
    const dispatchedAt = delivery?.dispatched_at ? new Date(delivery.dispatched_at).getTime() : null;
    const estimatedAt = delivery?.estimated_date ? new Date(delivery.estimated_date).getTime() : null;
    const DEFAULT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days, used when no estimate was set

    function computeTarget(): number {
      if (!dispatchedAt) return order.order_status === 'OUT_FOR_DELIVERY' ? 60 : 10;
      const windowMs = estimatedAt && estimatedAt > dispatchedAt ? estimatedAt - dispatchedAt : DEFAULT_WINDOW_MS;
      const elapsed = Date.now() - dispatchedAt;
      const raw = (elapsed / windowMs) * 100;
      return Math.max(4, Math.min(97, raw));
    }

    targetRef.current = computeTarget();
    setDisplayPct(targetRef.current);

    const tick = setInterval(() => {
      targetRef.current = computeTarget();
      setDisplayPct(prev => {
        const jitter = (Math.random() - 0.3) * 0.6; // gentle forward drift
        const next = prev + (targetRef.current - prev) * 0.15 + jitter;
        return Math.max(2, Math.min(97, next));
      });
    }, 2500);

    return () => clearInterval(tick);
  }, [order.order_status, delivery?.dispatched_at, delivery?.estimated_date]);

  return displayPct;
}

export default function OrderTrackingTimeline({ order }: Props) {
  const currentStepIndex = STATUS_TO_STEP_INDEX[order.order_status] ?? 0;
  const progress = useAnimatedDeliveryProgress(order);
  const isCancelledOrReturned = ['CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'].includes(order.order_status);

  if (isCancelledOrReturned) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-2">Order Tracking</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          This order's status is <strong>{order.order_status.replace(/_/g, ' ')}</strong> — tracking isn't applicable.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-5">Order Tracking</h2>

      <div className="relative pl-1">
        {STEP_ORDER.map((key, idx) => {
          const meta = STEP_META[key];
          const Icon = meta.icon;
          const state: StepState = idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'current' : 'upcoming';
          const isLast = idx === STEP_ORDER.length - 1;
          const showDeliveryAnimation = key === 'OUT_FOR_DELIVERY' && state === 'current';

          return (
            <div key={key} className="relative flex gap-3 pb-6 last:pb-0">
              {!isLast && (
                <div
                  className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${
                    idx < currentStepIndex ? 'bg-brand-500' : 'bg-gray-200 dark:bg-dark-600'
                  }`}
                />
              )}
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                  state === 'done'
                    ? 'bg-brand-500 text-white'
                    : state === 'current'
                    ? 'bg-brand-500 text-white ring-4 ring-brand-100 dark:ring-brand-900/40'
                    : 'bg-gray-100 dark:bg-dark-700 text-gray-400 dark:text-gray-500'
                }`}
              >
                {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="pt-1 flex-1 min-w-0">
                <p className={`text-sm font-semibold ${state === 'upcoming' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-50'}`}>
                  {meta.label}
                </p>
                {state !== 'upcoming' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{meta.sub}</p>
                )}

                {showDeliveryAnimation && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Estimated progress</span>
                      <span className="text-xs font-bold text-brand-600">{Math.round(progress)}% of the way</span>
                    </div>
                    <div className="relative h-2 bg-gray-100 dark:bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-400 to-brand-500 rounded-full transition-all duration-[2500ms] ease-linear"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                      Estimated, live GPS tracking.
                    </p>
                    {order.delivery?.courier && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
                        Courier: <span className="font-medium">{order.delivery.courier}</span>
                        {order.delivery.tracking_number && <> · Tracking #: <span className="font-mono">{order.delivery.tracking_number}</span></>}
                      </p>
                    )}
                  </div>
                )}

                {key === 'DELIVERED' && state === 'current' && order.delivery?.delivered_at && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(order.delivery.delivered_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
