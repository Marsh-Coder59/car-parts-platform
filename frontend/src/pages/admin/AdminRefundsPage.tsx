import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatCurrency, formatDate } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { Refund } from '../../types';
import toast from 'react-hot-toast';

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [updateModal, setUpdateModal] = useState<Refund | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createForm = useForm<{ order_id: string; amount: string; reason: string; notes: string }>();
  const updateForm = useForm<{ status: string; notes: string }>();

  const load = () => {
    adminService.listRefunds({ status: statusFilter || undefined })
      .then(setRefunds).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [statusFilter]);

  const onCreateRefund = async (data: { order_id: string; amount: string; reason: string; notes: string }) => {
    setSubmitting(true);
    try {
      await adminService.createRefund({
        order_id: parseInt(data.order_id),
        amount: parseFloat(data.amount),
        reason: data.reason,
        notes: data.notes || undefined,
      });
      toast.success('Refund record created');
      setCreateModal(false);
      createForm.reset();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onUpdateRefund = async (data: { status: string; notes: string }) => {
    if (!updateModal) return;
    setSubmitting(true);
    try {
      await adminService.updateRefund(updateModal.id, data);
      toast.success('Refund updated');
      setUpdateModal(null);
      updateForm.reset();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const STATUS_COLORS: Record<string, string> = {
    PENDING: 'bg-yellow-50 text-yellow-700',
    APPROVED: 'bg-blue-50 text-blue-700',
    COMPLETED: 'bg-green-50 text-green-700',
    REJECTED: 'bg-red-50 text-red-700',
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 flex-1">Refunds</h1>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-40">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <Button size="sm" onClick={() => setCreateModal(true)} leftIcon={<Plus className="h-4 w-4" />}>
          Create Refund
        </Button>
      </div>

      {loading ? <SkeletonTable rows={5} cols={5} /> : refunds.length === 0 ? (
        <EmptyState title="No refunds" description="Refund records will appear here." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Order', 'Customer', 'Amount', 'Reason', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {refunds.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.order_number}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.customer_email}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{r.amount ? formatCurrency(r.amount) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px]">
                      <p className="truncate text-xs">{r.reason || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || 'bg-gray-50 text-gray-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      {r.status !== 'COMPLETED' && r.status !== 'REJECTED' && (
                        <button
                          onClick={() => { updateForm.reset({ status: r.status }); setUpdateModal(r); }}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          Update
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create refund modal */}
      <Modal isOpen={createModal} onClose={() => { setCreateModal(false); createForm.reset(); }}
        title="Create Refund Record">
        <form onSubmit={createForm.handleSubmit(onCreateRefund)} className="p-6 space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
            Manual bank transfer refunds only. Record the refund details and mark as COMPLETED when payment is sent.
          </div>
          <Input label="Order ID *" type="number"
            error={createForm.formState.errors.order_id?.message}
            {...createForm.register('order_id', { required: 'Required' })} />
          <Input label="Refund Amount (KES) *" type="number" step="0.01"
            error={createForm.formState.errors.amount?.message}
            {...createForm.register('amount', { required: 'Required' })} />
          <Textarea label="Reason *" rows={2}
            error={createForm.formState.errors.reason?.message}
            {...createForm.register('reason', { required: 'Required' })} />
          <Textarea label="Notes" rows={2} {...createForm.register('notes')} />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setCreateModal(false); createForm.reset(); }}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}>Create Refund</Button>
          </div>
        </form>
      </Modal>

      {/* Update refund modal */}
      <Modal isOpen={!!updateModal} onClose={() => { setUpdateModal(null); updateForm.reset(); }}
        title="Update Refund">
        <form onSubmit={updateForm.handleSubmit(onUpdateRefund)} className="p-6 space-y-4">
          {updateModal && (
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <p>Order: <span className="font-semibold">{updateModal.order_number}</span></p>
              {updateModal.amount && <p>Amount: <span className="font-semibold">{formatCurrency(updateModal.amount)}</span></p>}
            </div>
          )}
          <Select label="Status" {...updateForm.register('status')}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="COMPLETED">Completed (paid out)</option>
            <option value="REJECTED">Rejected</option>
          </Select>
          <Textarea label="Notes" rows={2} {...updateForm.register('notes')} />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setUpdateModal(null); updateForm.reset(); }}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}>Update</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
