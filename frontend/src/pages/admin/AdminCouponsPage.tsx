import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatDate, formatCurrency } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { Coupon } from '../../types';
import toast from 'react-hot-toast';

interface CouponFormValues {
  code: string; discount_type: string; discount_value: string;
  min_order_amount: string; max_uses: string; expires_at: string; is_active: boolean;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CouponFormValues>({
    defaultValues: { discount_type: 'PERCENTAGE', is_active: true },
  });

  const load = () => adminService.listCoupons().then(setCoupons).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openEdit = (c: Coupon) => {
    reset({
      code: c.code, discount_type: c.discount_type, discount_value: String(c.discount_value),
      min_order_amount: String(c.min_order_amount || ''), max_uses: String(c.max_uses || ''),
      expires_at: c.expires_at || '', is_active: c.is_active,
    });
    setModal(c.id);
  };

  const onSubmit = async (data: CouponFormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        code: data.code, discount_type: data.discount_type,
        discount_value: parseFloat(data.discount_value),
        min_order_amount: data.min_order_amount ? parseFloat(data.min_order_amount) : undefined,
        max_uses: data.max_uses ? parseInt(data.max_uses) : undefined,
        expires_at: data.expires_at || undefined, is_active: data.is_active,
      };
      if (modal === 'create') {
        await adminService.createCoupon(payload);
        toast.success('Coupon created');
      } else if (typeof modal === 'number') {
        await adminService.updateCoupon(modal, payload);
        toast.success('Coupon updated');
      }
      setModal(null); reset(); load();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const toggleActive = async (c: Coupon) => {
    try {
      if (c.is_active) {
        await adminService.deactivateCoupon(c.id);
        toast.success('Coupon deactivated');
      } else {
        await adminService.updateCoupon(c.id, { is_active: true });
        toast.success('Coupon activated');
      }
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Coupons</h1>
        <Button size="sm" onClick={() => { reset({ discount_type: 'PERCENTAGE', is_active: true }); setModal('create'); }}
          leftIcon={<Plus className="h-4 w-4" />}>
          Add Coupon
        </Button>
      </div>

      {loading ? <SkeletonTable rows={5} cols={6} /> : coupons.length === 0 ? (
        <EmptyState title="No coupons" description="Create discount coupons for your customers."
          action={<Button onClick={() => setModal('create')}>Create Coupon</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Code', 'Discount', 'Min Order', 'Max Uses', 'Expires', 'Active', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {coupons.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold text-gray-900">{c.code}</td>
                    <td className="px-4 py-3 font-semibold text-brand-600">
                      {c.discount_type === 'PERCENTAGE' ? `${c.discount_value}%` : formatCurrency(c.discount_value)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.min_order_amount ? formatCurrency(c.min_order_amount) : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.max_uses ?? 'Unlimited'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{c.expires_at ? formatDate(c.expires_at) : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(c)}>
                        {c.is_active
                          ? <ToggleRight className="h-5 w-5 text-green-600" />
                          : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => { setModal(null); reset(); }}
        title={modal === 'create' ? 'Create Coupon' : 'Edit Coupon'}>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Input label="Code *" placeholder="e.g. SAVE10" error={errors.code?.message}
            {...register('code', { required: 'Code is required' })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Discount Type" {...register('discount_type')}>
              <option value="PERCENTAGE">Percentage (%)</option>
              <option value="FIXED">Fixed Amount (USD)</option>
            </Select>
            <Input label="Discount Value *" type="number" step="0.01"
              error={errors.discount_value?.message}
              {...register('discount_value', { required: 'Required' })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Min Order Amount (USD)" type="number" step="0.01" {...register('min_order_amount')} />
            <Input label="Max Uses" type="number" {...register('max_uses')} hint="Leave blank for unlimited" />
          </div>
          <Input label="Expiry Date" type="date" {...register('expires_at')} />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('is_active')} className="rounded" />
            Active (can be applied at checkout)
          </label>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setModal(null); reset(); }}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}>
              {modal === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
