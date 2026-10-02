export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatOrderStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getOrderStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'text-yellow-600 bg-yellow-50',
    AWAITING_DEPOSIT: 'text-orange-600 bg-orange-50',
    DEPOSIT_VERIFICATION: 'text-blue-600 bg-blue-50',
    PROCESSING: 'text-indigo-600 bg-indigo-50',
    READY_FOR_DISPATCH: 'text-purple-600 bg-purple-50',
    DISPATCHED: 'text-cyan-600 bg-cyan-50',
    OUT_FOR_DELIVERY: 'text-teal-600 bg-teal-50',
    DELIVERED: 'text-green-600 bg-green-50',
    AWAITING_BALANCE: 'text-orange-600 bg-orange-50',
    COMPLETED: 'text-green-700 bg-green-100',
    CANCELLED: 'text-red-600 bg-red-50',
    RETURN_REQUESTED: 'text-yellow-700 bg-yellow-50',
    RETURNED: 'text-gray-600 bg-gray-50',
    REFUNDED: 'text-gray-700 bg-gray-100',
  };
  return map[status] || 'text-gray-600 bg-gray-50';
}

export function getPaymentStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'text-yellow-700 bg-yellow-50',
    VERIFIED: 'text-green-700 bg-green-100',
    REJECTED: 'text-red-700 bg-red-50',
    FAILED: 'text-red-600 bg-red-50',
  };
  return map[status] || 'text-gray-600 bg-gray-50';
}

export function truncate(str: string, max = 60): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
