import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle, XCircle, Eye } from 'lucide-react';
import { paymentsService } from '../../services/orders.service';
import { adminService } from '../../services/admin.service';
import { formatCurrency, formatDateTime, getPaymentStatusColor } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Select, Textarea } from '../../components/ui/Input';
import { PaymentStatusBadge } from '../../components/ui/Badge';
import { getErrorMessage } from '../../services/api';
import type { AdminPayment } from '../../types';
import toast from 'react-hot-toast';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<AdminPayment | null>(null);
  const [action, setAction] = useState<'verify' | 'reject' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rejectForm = useForm<{ notes: string }>();
  const verifyForm = useForm<{ notes: string }>();

  const load = () => {
    setLoading(true);
    paymentsService.listAll({
      status: statusFilter || undefined,
      payment_type: typeFilter || undefined,
    }).then(setPayments).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter, typeFilter]);

  const openAction = (payment: AdminPayment, act: 'verify' | 'reject') => {
    setSelected(payment);
    setAction(act);
    rejectForm.reset();
    verifyForm.reset();
  };

  const onVerify = async (data: { notes: string }) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await paymentsService.verify(selected.id, data.notes);
      toast.success(`Payment verified. Order now: ${res.new_order_status}`);
      setAction(null);
      setSelected(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onReject = async (data: { notes: string }) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await paymentsService.reject(selected.id, data.notes);
      toast.success('Payment rejected');
      setAction(null);
      setSelected(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 flex-1">Payments</h1>
        <div className="flex gap-3">
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </Select>
          <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="DEPOSIT">Deposit</option>
            <option value="BALANCE">Balance</option>
          </Select>
        </div>
      </div>

      {/* Pending alert */}
      {statusFilter === 'PENDING' && payments.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>{payments.length} payment{payments.length > 1 ? 's' : ''}</strong> awaiting verification.
          Review each one and verify or reject based on your bank records.
        </div>
      )}

      {loading ? <SkeletonTable rows={6} cols={6} /> : payments.length === 0 ? (
        <EmptyState title="No payments found" description="No payments match the selected filters." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['ID', 'Order', 'Customer', 'Type', 'Amount', 'Reference', 'Submitted', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">#{p.id}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900">{p.order_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.customer}</p>
                      <p className="text-xs text-gray-400">{p.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${p.type === 'DEPOSIT' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-600">{p.reference || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {p.submitted_at ? formatDateTime(p.submitted_at) : '—'}
                    </td>
                    <td className="px-4 py-3"><PaymentStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {p.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => openAction(p, 'verify')}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Verify
                            </button>
                            <button
                              onClick={() => openAction(p, 'reject')}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </button>
                          </>
                        )}
                        <button onClick={() => { setSelected(p); setAction(null); }}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment detail modal */}
      <Modal isOpen={!!selected && !action} onClose={() => setSelected(null)} title="Payment Details" size="md">
        {selected && (
          <div className="p-6 space-y-3 text-sm">
            {[
              ['Payment ID', `#${selected.id}`],
              ['Order', selected.order_number],
              ['Customer', `${selected.customer} (${selected.email})`],
              ['Type', selected.type],
              ['Method', selected.method],
              ['Amount', formatCurrency(selected.amount)],
              ['Currency', selected.currency],
              ['Reference', selected.reference || '—'],
              ['Status', selected.status],
              ['Submitted', selected.submitted_at ? formatDateTime(selected.submitted_at) : '—'],
              ['Verified', selected.verified_at ? formatDateTime(selected.verified_at) : '—'],
              ['Notes', selected.notes || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <span className="text-gray-500 w-28 flex-shrink-0">{label}</span>
                <span className="font-medium text-gray-900">{value}</span>
              </div>
            ))}
            {selected.status === 'PENDING' && (
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <Button size="sm" onClick={() => { setAction('verify'); }} leftIcon={<CheckCircle className="h-4 w-4" />}>
                  Verify
                </Button>
                <Button size="sm" variant="danger" onClick={() => { setAction('reject'); }} leftIcon={<XCircle className="h-4 w-4" />}>
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Verify modal */}
      <Modal isOpen={action === 'verify'} onClose={() => setAction(null)} title="Verify Payment">
        <form onSubmit={verifyForm.handleSubmit(onVerify)} className="p-6 space-y-4">
          {selected && (
            <div className="p-3 bg-green-50 rounded-lg text-sm text-green-800">
              <p>Confirming <strong>{selected.type}</strong> payment of <strong>{formatCurrency(selected.amount)}</strong></p>
              <p className="text-xs mt-1">Reference: <span className="font-mono">{selected.reference || 'N/A'}</span></p>
              <p className="mt-2 text-xs font-semibold">⚠ Only verify if you have confirmed receipt of this payment in your bank account.</p>
            </div>
          )}
          <Textarea label="Notes (optional)" rows={2} {...verifyForm.register('notes')}
            placeholder="Internal verification notes…" />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => setAction(null)}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}
              className="bg-green-600 hover:bg-green-700 text-white">
              Confirm Verification
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reject modal */}
      <Modal isOpen={action === 'reject'} onClose={() => setAction(null)} title="Reject Payment">
        <form onSubmit={rejectForm.handleSubmit(onReject)} className="p-6 space-y-4">
          {selected && (
            <div className="p-3 bg-red-50 rounded-lg text-sm text-red-800">
              <p>Rejecting <strong>{selected.type}</strong> of <strong>{formatCurrency(selected.amount)}</strong></p>
              <p className="text-xs mt-1">The customer will be notified to resubmit.</p>
            </div>
          )}
          <Textarea label="Reason for rejection (required)" rows={3} {...rejectForm.register('notes', { required: 'Please provide a reason' })}
            error={rejectForm.formState.errors.notes?.message}
            placeholder="e.g. Reference number not found, amount mismatch…" />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => setAction(null)}>Cancel</Button>
            <Button type="submit" variant="danger" fullWidth loading={submitting}>Reject Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
