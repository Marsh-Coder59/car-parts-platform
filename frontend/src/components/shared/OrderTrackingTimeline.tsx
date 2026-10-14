import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, PackageCheck, Truck, Home, Circle } from 'lucide-react';
import type { Order } from '../../types';

interface Props {
  order: Order;
}

type StepState = 'done' | 'current' | 'upcoming';

const STEP_ORDER = [
  'PAYMENT_CONFIRMED',
  'READY_FOR_DISPATCH',
  'DISPATCHED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

const STEP_META: Record<(typeof STEP_ORDER)[number], { label: string; icon: typeof CheckCircle2 }> = {
  PAYMENT_CONFIRMED: { label: 'Payment Confirmed', icon: CreditCard },
  READY_FOR_DISPATCH: { label: 'Added to Dispatch', icon: PackageCheck },
  DISPATCHED: { label: 'Dispatched', icon: Truck },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', icon: Truck },
  DELIVERED: { label: 'Delivered', icon: Home },
};

// Maps the order's real backend status onto how far along our 5-step
// tracker it is. Anything before PROCESSING (payment not yet confirmed)
// means step 0 hasn't happened yet — this tracker starts once the
// deposit is verified, matching what was asked ("from confirmation of
// the payment onward").
const STATUS_TO_STEP_INDEX: Record<string, number> = {
  PENDING: -1,
  AWAITING_DEPOSIT: -1,
  DEPOSIT_VERIFICATION: -1,
  PROCESSING: 0,
  READY_FOR_DISPATCH: 1,
  DISPATCHED: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  AWAITING_BALANCE: 4,
  COMPLETED: 4,
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
    // Default assumed transit window when no estimate was set by the admin.
    const DEFAULT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

    function computeTarget(): number {
      if (!dispatchedAt) return order.order_status === 'OUT_FOR_DELIVERY' ? 60 : 10;
      const windowMs = estimatedAt && estimatedAt > dispatchedAt ? estimatedAt - dispatchedAt : DEFAULT_WINDOW_MS;
      const elapsed = Date.now() - dispatchedAt;
      const raw = (elapsed / windowMs) * 100;
      // Cap below 100 — only an explicit DELIVERED status (handled above)
      // is allowed to show 100%, so it never looks "arrived" prematurely.
      return Math.max(4, Math.min(97, raw));
    }

    targetRef.current = computeTarget();

    // Animate toward the target with a small continuous drift so the bar
    // feels alive rather than static, re-settling toward the real
    // time-based estimate periodically.
    const tick = setInterval(() => {
      targetRef.current = computeTarget();
      setDisplayPct(prev => {
        const jitter = (Math.random() - 0.3) * 0.6; // gentle forward drift
        const next = prev + (targetRef.current - prev) * 0.15 + jitter;
        return Math.max(2, Math.min(97, next));
      });
    }, 2500);

    setDisplayPct(targetRef.current);
    return () => clearInterval(tick);
  }, [order.order_status, delivery?.dispatched_at, delivery?.estimated_date]);

  return displayPct;
}

export default function OrderTrackingTimeline({ order }: Props) {
  const currentStepIndex = STATUS_TO_STEP_INDEX[order.order_status] ?? -1;
  const progress = useAnimatedDeliveryProgress(order);
  const isCancelledOrReturned = ['CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'].includes(order.order_status);

  if (isCancelledOrReturned) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          This order's tracking isn't applicable — current status: {order.order_status.replace(/_/g, ' ')}.
        </p>
      </div>
    );
  }

  if (currentStepIndex < 0) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Tracking will appear here once your payment is confirmed.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-5">Order Tracking</h2>

      {/* Step row */}
      <div className="flex items-start">
        {STEP_ORDER.map((key, idx) => {
          const meta = STEP_META[key];
          const Icon = meta.icon;
          const state: StepState = idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'current' : 'upcoming';
          const isLast = idx === STEP_ORDER.length - 1;
          return (
            <div key={key} className="flex-1 flex flex-col items-center relative">
              {!isLast && (
                <div
                  className={`absolute top-4 left-1/2 w-full h-0.5 ${
                    idx < currentStepIndex ? 'bg-brand-500' : 'bg-gray-200 dark:bg-dark-600'
                  }`}
                  style={{ zIndex: 0 }}
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
              <p
                className={`mt-2 text-[11px] text-center leading-tight px-1 ${
                  state === 'upcoming' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-50 font-medium'
                }`}
              >
                {meta.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Animated "closeness" bar — only while out for delivery or dispatched */}
      {(order.order_status === 'OUT_FOR_DELIVERY' || order.order_status === 'DISPATCHED') && (
        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-dark-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              {order.order_status === 'OUT_FOR_DELIVERY' ? 'On its way to you' : 'Preparing for the road'}
            </p>
            <p className="text-xs font-bold text-brand-600">{Math.round(progress)}% of the way</p>
          </div>
          <div className="relative h-2 bg-gray-100 dark:bg-dark-700 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-400 to-brand-500 rounded-full transition-all duration-[2500ms] ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="relative h-0 mt-1" aria-hidden="true">
            <Truck
              className="h-4 w-4 text-brand-500 absolute -top-[1.65rem] transition-all duration-[2500ms] ease-linear"
              style={{ left: `calc(${progress}% - 8px)` }}
            />
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
            This is an estimated progress indicator, not live GPS tracking.
          </p>
          {order.delivery?.courier && (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
              Courier: <span className="font-medium">{order.delivery.courier}</span>
              {order.delivery.tracking_number && <> · Tracking #: <span className="font-mono">{order.delivery.tracking_number}</span></>}
            </p>
          )}
        </div>
      )}

      {order.order_status === 'DELIVERED' && order.delivery?.delivered_at && (
        <p className="mt-5 pt-4 border-t border-gray-100 dark:border-dark-700 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <Circle className="h-2 w-2 fill-green-500 text-green-500" /> Delivered on {new Date(order.delivery.delivered_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
