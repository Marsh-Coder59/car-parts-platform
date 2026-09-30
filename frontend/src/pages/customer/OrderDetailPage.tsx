import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Building2, Clock, Truck, CheckCircle, XCircle } from 'lucide-react';
import { ordersService } from '../../services/orders.service';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/ui/Badge';
import { SkeletonLines } from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { Order, BankDetails } from '../../types';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface PaymentForm { amount: string; reference: string; payment_date: string; notes: string; }

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [payModal, setPayModal] = useState<'deposit' | 'balance' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PaymentForm>();

  const load = () => {
    if (!id) return;
    Promise.all([
      ordersService.get(parseInt(id)),
      ordersService.getBankDetails(parseInt(id)).catch(() => null),
    ]).then(([ord, bank]) => {
      setOrder(ord);
      setBankDetails(bank);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const onSubmitPayment = async (data: PaymentForm) => {
    if (!order || !payModal) return;
    setSubmitting(true);
    try {
      const payload = { amount: parseFloat(data.amount), reference: data.reference, payment_date: data.payment_date || undefined, notes: data.notes || undefined };
      if (payModal === 'deposit') {
        await ordersService.submitDepositPayment(order.id, payload);
      } else {
        await ordersService.submitBalancePayment(order.id, payload);
      }
      toast.success('Payment submitted for verification!');
      setPayModal(null);
      reset();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!order || !confirm('Cancel this order?')) return;
    try {
      await ordersService.cancel(order.id);
      toast.success('Order cancelled');
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-10"><SkeletonLines lines={8} /></div>;
  if (!order) return <div className="max-w-3xl mx-auto px-4 py-10 text-center text-gray-500">Order not found.</div>;

  const canSubmitDeposit = !order.deposit_paid && ['AWAITING_DEPOSIT', 'PENDING'].includes(order.order_status);
  const canSubmitBalance = order.deposit_paid && !order.balance_paid && ['AWAITING_BALANCE', 'DELIVERED'].includes(order.order_status);
  const canCancel = ['PENDING', 'AWAITING_DEPOSIT'].includes(order.order_status);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">{order.order_number}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(order.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.order_status} />
          {canCancel && (
            <button onClick={handleCancel} className="text-xs text-red-600 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* Payment CTA */}
      {canSubmitDeposit && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-semibold text-orange-900 mb-1">Deposit Required</p>
          <p className="text-sm text-orange-800 mb-3">
            Transfer <strong>{formatCurrency(order.deposit_amount)}</strong> to the bank account below and submit your reference.
          </p>
          <Button onClick={() => setPayModal('deposit')} variant="primary" size="sm" leftIcon={<Building2 className="h-4 w-4" />}>
            Submit Deposit Payment
          </Button>
        </div>
      )}

      {canSubmitBalance && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-semibold text-blue-900 mb-1">Balance Payment Due</p>
          <p className="text-sm text-blue-800 mb-3">
            Transfer <strong>{formatCurrency(order.balance_amount)}</strong> to complete your order.
          </p>
          <Button onClick={() => setPayModal('balance')} variant="primary" size="sm">
            Submit Balance Payment
          </Button>
        </div>
      )}

      {/* Bank details */}
      {bankDetails?.bank?.bank_name && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-brand-500" /> Bank Transfer Details
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Bank', bankDetails.bank?.bank_name],
              ['Account Name', bankDetails.bank?.account_name],
              ['Account Number', bankDetails.bank?.account_number],
              ['Branch', bankDetails.bank?.branch],
              ['Reference', bankDetails.reference],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Order Totals</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
          {order.delivery_fee > 0 && <div className="flex justify-between text-gray-600"><span>Delivery Fee</span><span>{formatCurrency(order.delivery_fee)}</span></div>}
          {order.discount_amount > 0 && <div className="flex justify-between text-green-700"><span>Discount</span><span>−{formatCurrency(order.discount_amount)}</span></div>}
          <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2"><span>Total</span><span>{formatCurrency(order.total_amount)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Deposit (75%)</span>
            <span className={clsx('font-semibold', order.deposit_paid ? 'text-green-600' : 'text-orange-600')}>
              {formatCurrency(order.deposit_amount)} {order.deposit_paid ? '✓ Paid' : '(Pending)'}
            </span>
          </div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Balance (25%)</span>
            <span className={clsx('font-semibold', order.balance_paid ? 'text-green-600' : 'text-gray-400')}>
              {formatCurrency(order.balance_amount)} {order.balance_paid ? '✓ Paid' : '(Due after delivery)'}
            </span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Items</h2>
        <div className="space-y-2">
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-medium text-gray-900">{item.product_name}</p>
                <p className="text-gray-400 text-xs">{item.sku && `SKU: ${item.sku} · `}Qty: {item.quantity} × {formatCurrency(item.unit_price)}</p>
              </div>
              <span className="font-semibold text-gray-900">{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payments */}
      {order.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Payment History</h2>
          <div className="space-y-2">
            {order.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{p.type} — {formatCurrency(p.amount)}</p>
                  <p className="text-gray-400 text-xs">
                    {p.reference && `Ref: ${p.reference} · `}
                    {p.submitted_at && formatDateTime(p.submitted_at)}
                  </p>
                </div>
                <PaymentStatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events timeline */}
      {order.events.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-500" /> Order Timeline
          </h2>
          <div className="relative pl-5">
            <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-gray-100" />
            {order.events.map(ev => (
              <div key={ev.id} className="relative flex items-start gap-3 mb-4 last:mb-0">
                <div className="absolute -left-3.5 w-3 h-3 rounded-full bg-brand-500 border-2 border-white" />
                <div>
                  <p className="text-xs font-semibold text-gray-900">{ev.event_type.replace(/_/g, ' ')}</p>
                  {ev.description && <p className="text-xs text-gray-500">{ev.description}</p>}
                  <p className="text-xs text-gray-400">{formatDateTime(ev.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery */}
      {order.delivery && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Truck className="h-4 w-4 text-brand-500" /> Delivery
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-gray-500">Status</p><p className="font-semibold">{order.delivery.status}</p></div>
            {order.delivery.courier && <div><p className="text-xs text-gray-500">Courier</p><p className="font-semibold">{order.delivery.courier}</p></div>}
            {order.delivery.tracking_number && <div><p className="text-xs text-gray-500">Tracking</p><p className="font-mono font-semibold">{order.delivery.tracking_number}</p></div>}
            {order.delivery.estimated_date && <div><p className="text-xs text-gray-500">Estimated</p><p className="font-semibold">{formatDate(order.delivery.estimated_date)}</p></div>}
          </div>
        </div>
      )}

      {/* Payment submission modal */}
      <Modal isOpen={!!payModal} onClose={() => { setPayModal(null); reset(); }}
        title={payModal === 'deposit' ? 'Submit Deposit Payment' : 'Submit Balance Payment'}>
        <form onSubmit={handleSubmit(onSubmitPayment)} className="p-6 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
            <p>Amount due: <strong>{formatCurrency(payModal === 'deposit' ? order.deposit_amount : order.balance_amount)}</strong></p>
          </div>
          <Input label="Amount Paid (KES)" type="number" step="0.01"
            error={errors.amount?.message}
            {...register('amount', { required: 'Enter the amount you transferred' })}
          />
          <Input label="Transaction Reference Number" placeholder="e.g. bank reference or confirmation number"
            error={errors.reference?.message}
            {...register('reference', { required: 'Reference is required' })}
          />
          <Input label="Payment Date (optional)" type="date" {...register('payment_date')} />
          <Textarea label="Notes (optional)" rows={2} placeholder="Any additional payment notes…" {...register('notes')} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setPayModal(null); reset(); }}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}>Submit Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
