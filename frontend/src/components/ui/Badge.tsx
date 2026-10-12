import clsx from 'clsx';
import { formatOrderStatus, getOrderStatusColor, getPaymentStatusColor } from '../../utils/format';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', className)}>
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={getOrderStatusColor(status)}>
      {formatOrderStatus(status)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={getPaymentStatusColor(status)}>
      {status}
    </Badge>
  );
}

export function StockBadge({ available }: { available: number }) {
  if (available <= 0) return <Badge className="text-red-700 bg-red-50 dark:bg-red-900/20">Out of Stock</Badge>;
  if (available <= 5) return <Badge className="text-orange-700 bg-orange-50">Low Stock ({available})</Badge>;
  return <Badge className="text-green-700 bg-green-50">In Stock</Badge>;
}
