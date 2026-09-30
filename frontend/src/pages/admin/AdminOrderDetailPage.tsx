import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Truck, Building2 } from 'lucide-react';
import { ordersService } from '../../services/orders.service';
import { adminService } from '../../services/admin.service';
import { formatCurrency, formatDate, formatDateTime, formatOrderStatus } from '../../utils/format';
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/ui/Badge';
import { SkeletonLines } from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Select, Input, Textarea } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { Order } from '../../types';
import toast from 'react-hot-toast';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['AWAITING_DEPOSIT', 'CANCELLED'],
  AWAITING_DEPOSIT: ['DEPOSIT_VERIFICATION', 'CANCELLED'],
  DEPOSIT_VERIFICATION: ['PROCESSING', 'AWAITING_DEPOSIT'],
  PROCESSING: ['READY_FOR_DISPATCH', 'CANCELLED'],
  READY_FOR_DISPATCH: ['DISPATCHED'],
  DISPATCHED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['AWAITING_BALANCE', 'RETURN_REQUESTED'],
  AWAITING_BALANCE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  RETURN_REQUESTED: ['RETURNED'],
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusModal, setStatusModal] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const statusForm = useForm<{ new_status: string; notes: string }>();
  const deliveryForm = useForm<{
    method: string; courier: string; tracking_number: string;
    estimated_date: string; notes: string; status: string;
  }>();

  const load = () => {
    if (!id) return;
    ordersService.get(parseInt(id)).then(setOrder).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const onUpdateStatus = async (data: { new_status: string; notes: string }) => {
    if (!order) return;
    setSubmitting(true);
    try {
      await ordersService.updateStatus(order.id, data.new_status, data.notes);
      toast.success(`Order moved to ${formatOrderStatus(data.new_status)}`);
      setStatusModal(false);
      statusForm.reset();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onCreateDelivery = async (data: {
    method: string; courier: string; tracking_number: string;
    estimated_date: string; notes: string;
  }) => {
    if (!order) return;
    setSubmitting(true);
    try {
      if (order.delivery) {
        await adminService.updateDelivery(order.delivery.id, data);
        toast.success('Delivery updated');
      } else {
        await adminService.createDelivery({ order_id: order.id, ...data });
        toast.success('Delivery created');
      }
      setDeliveryModal(false);
      deliveryForm.reset();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="max-w-3xl"><SkeletonLines lines={10} /></div>;
  if (!order) return <div className="text-gray-500">Order not found.</div>;

  const allowedNext = ALLOWED_TRANSITIONS[order.order_status] || [];

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/orders" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-gray-900">{order.order_number}</h1>
          <p className="text-xs text-gray-500">{formatDateTime(order.created_at)}</p>
        </div>
        <OrderStatusBadge status={order.order_status} />
        {allowedNext.length > 0 && (
          <Button size="sm" onClick={() => setStatusModal(true)}>Update Status</Button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Order Items</h2>
            <div className="space-y-2">
              {order.items.map(item => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{item.product_name}</p>
                    <p className="text-xs text-gray-400">
                      {item.sku && `SKU: ${item.sku} · `}
                      Qty: {item.quantity} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <span className="font-semibold text-gray-900">{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payments */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Payments</h2>
            {order.payments.length === 0 ? (
              <p className="text-sm text-gray-400">No payments submitted yet.</p>
            ) : (
              <div className="space-y-2">
                {order.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{p.type}</span>
                        <PaymentStatusBadge status={p.status} />
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(p.amount)}
                        {p.reference && ` · Ref: ${p.reference}`}
                        {p.submitted_at && ` · ${formatDate(p.submitted_at)}`}
                      </p>
                      {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                    </div>
                    {p.status === 'PENDING' && (
                      <Link
                        to="/admin/payments"
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Verify →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Truck className="h-4 w-4 text-brand-500" /> Delivery
              </h2>
              {order.deposit_paid && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (order.delivery) deliveryForm.reset(order.delivery as Record<string, unknown>);
                  setDeliveryModal(true);
                }}>
                  {order.delivery ? 'Update' : 'Create'} Delivery
                </Button>
              )}
            </div>
            {!order.deposit_paid && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg">Deposit must be verified before creating delivery.</p>
            )}
            {order.delivery ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Status', order.delivery.status],
                  ['Courier', order.delivery.courier],
                  ['Tracking', order.delivery.tracking_number],
                  ['Est. Date', order.delivery.estimated_date ? formatDate(order.delivery.estimated_date) : null],
                  ['Dispatched', order.delivery.dispatched_at ? formatDateTime(order.delivery.dispatched_at) : null],
                  ['Delivered', order.delivery.delivered_at ? formatDateTime(order.delivery.delivered_at) : null],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="font-semibold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No delivery created yet.</p>
            )}
          </div>

          {/* Events */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Order Timeline</h2>
            <div className="relative pl-4">
              <div className="absolute left-1 top-2 bottom-2 w-0.5 bg-gray-100" />
              {order.events.map(ev => (
                <div key={ev.id} className="relative mb-3 last:mb-0">
                  <div className="absolute -left-2.5 w-2.5 h-2.5 rounded-full bg-brand-500 border-2 border-white mt-0.5" />
                  <p className="text-xs font-semibold text-gray-900">{ev.event_type.replace(/_/g, ' ')}</p>
                  {ev.description && <p className="text-xs text-gray-500">{ev.description}</p>}
                  <p className="text-xs text-gray-400">{formatDateTime(ev.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Customer */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Customer</h2>
            <p className="text-sm font-semibold text-gray-900">
              {order.customer?.first_name} {order.customer?.last_name}
            </p>
            <p className="text-xs text-gray-500">{order.customer?.email}</p>
          </div>

          {/* Totals */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Totals</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span>
              </div>
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span><span>{formatCurrency(order.delivery_fee)}</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Discount</span><span>−{formatCurrency(order.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 border-t pt-2">
                <span>Total</span><span>{formatCurrency(order.total_amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Deposit (75%)</span>
                <span className={order.deposit_paid ? 'text-green-600 font-semibold' : 'text-orange-600'}>
                  {formatCurrency(order.deposit_amount)} {order.deposit_paid ? '✓' : '⏳'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Balance (25%)</span>
                <span className={order.balance_paid ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                  {formatCurrency(order.balance_amount)} {order.balance_paid ? '✓' : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status modal */}
      <Modal isOpen={statusModal} onClose={() => { setStatusModal(false); statusForm.reset(); }} title="Update Order Status">
        <form onSubmit={statusForm.handleSubmit(onUpdateStatus)} className="p-6 space-y-4">
          <Select label="New Status"
            error={statusForm.formState.errors.new_status?.message}
            {...statusForm.register('new_status', { required: 'Select a status' })}
          >
            <option value="">Select status…</option>
            {allowedNext.map(s => (
              <option key={s} value={s}>{formatOrderStatus(s)}</option>
            ))}
          </Select>
          <Textarea label="Notes (optional)" rows={2}
            {...statusForm.register('notes')}
            placeholder="Reason for status change…"
          />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setStatusModal(false); statusForm.reset(); }}>
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={submitting}>Update</Button>
          </div>
        </form>
      </Modal>

      {/* Delivery modal */}
      <Modal isOpen={deliveryModal} onClose={() => { setDeliveryModal(false); deliveryForm.reset(); }}
        title={order.delivery ? 'Update Delivery' : 'Create Delivery'}>
        <form onSubmit={deliveryForm.handleSubmit(onCreateDelivery)} className="p-6 space-y-4">
          {order.delivery && (
            <Select label="Delivery Status" {...deliveryForm.register('status')}>
              {['PENDING','READY','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </Select>
          )}
          <Input label="Method (e.g. Road, Air)" {...deliveryForm.register('method')} />
          <Input label="Courier" {...deliveryForm.register('courier')} />
          <Input label="Tracking Number" {...deliveryForm.register('tracking_number')} />
          <Input label="Estimated Delivery Date" type="date" {...deliveryForm.register('estimated_date')} />
          <Textarea label="Notes" rows={2} {...deliveryForm.register('notes')} />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setDeliveryModal(false); deliveryForm.reset(); }}>
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={submitting}>
              {order.delivery ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
