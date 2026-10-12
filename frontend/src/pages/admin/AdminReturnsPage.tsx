import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatDate } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Select, Textarea } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { Return } from '../../types';
import toast from 'react-hot-toast';

export default function AdminReturnsPage() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: number; order_number: string; reason: string; status: string; customer?: { email: string } } | null>(null);
  const [actionModal, setActionModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset } = useForm<{ status: string; notes: string }>();

  const load = () => adminService.listReturns().then(setReturns).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openAction = (r: Return) => {
    setSelected(r as unknown as { id: number; order_number: string; reason: string; status: string; customer?: { email: string } });
    reset({ status: r.status });
    setActionModal(true);
  };

  const onSubmit = async (data: { status: string; notes: string }) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await adminService.updateReturn(selected.id, data);
      toast.success('Return updated');
      setActionModal(false);
      setSelected(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const STATUS_COLORS: Record<string, string> = {
    PENDING: 'bg-yellow-50 text-yellow-700',
    APPROVED: 'bg-green-50 text-green-700',
    REJECTED: 'bg-red-50 dark:bg-red-900/20 text-red-700',
    RETURNED: 'bg-blue-50 text-blue-700',
    REFUNDED: 'bg-purple-50 text-purple-700',
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50 mb-6">Returns</h1>

      {loading ? <SkeletonTable rows={6} cols={5} /> : returns.length === 0 ? (
        <EmptyState title="No return requests" description="Customer return requests will appear here." />
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-dark-700">
                <tr>
                  {['Order', 'Customer', 'Reason', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
                {returns.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-50">{r.order_number}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.customer_email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[180px]">
                      <p className="truncate">{r.reason}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || 'bg-gray-50 dark:bg-dark-900 text-gray-600 dark:text-gray-300'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openAction(r)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={actionModal} onClose={() => { setActionModal(false); setSelected(null); }}
        title="Update Return">
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {selected && (
            <div className="p-3 bg-gray-50 dark:bg-dark-900 rounded-lg text-sm">
              <p className="font-semibold text-gray-900 dark:text-gray-50">Order: {selected.order_number}</p>
              <p className="text-gray-600 dark:text-gray-300 mt-1">{selected.reason}</p>
            </div>
          )}
          <Select label="New Status" {...register('status', { required: 'Required' })}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="RETURNED">Returned</option>
            <option value="REFUNDED">Refunded</option>
          </Select>
          <Textarea label="Notes" rows={3} {...register('notes')}
            placeholder="Internal notes or reason for decision…" />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth
              onClick={() => { setActionModal(false); setSelected(null); }}>
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={submitting}>Update Return</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
