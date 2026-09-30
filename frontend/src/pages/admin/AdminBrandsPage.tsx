import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { brandsService } from '../../services/products.service';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { Brand } from '../../types';
import toast from 'react-hot-toast';

interface FormValues { name: string; slug: string; description: string; logo_url: string; is_active: boolean; }

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ defaultValues: { is_active: true } });

  const load = () => brandsService.list().then(setBrands).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openEdit = (b: Brand) => {
    reset({ name: b.name, slug: b.slug || '', description: b.description || '', logo_url: b.logo_url || '', is_active: b.is_active });
    setModal(b.id);
  };

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = { ...data, slug: data.slug || undefined, description: data.description || undefined, logo_url: data.logo_url || undefined };
      if (modal === 'create') {
        await brandsService.create(payload);
        toast.success('Brand created');
      } else if (typeof modal === 'number') {
        await brandsService.update(modal, payload);
        toast.success('Brand updated');
      }
      setModal(null); reset(); load();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const deleteBrand = async (id: number, name: string) => {
    if (!confirm(`Delete brand "${name}"?`)) return;
    try {
      await brandsService.delete(id);
      toast.success('Brand deleted');
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Brands</h1>
        <Button size="sm" onClick={() => { reset({ is_active: true }); setModal('create'); }} leftIcon={<Plus className="h-4 w-4" />}>
          Add Brand
        </Button>
      </div>

      {loading ? <SkeletonTable rows={6} cols={4} /> : brands.length === 0 ? (
        <EmptyState title="No brands" description="Create brands for your products."
          action={<Button onClick={() => setModal('create')}>Add Brand</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Brand', 'Slug', 'Active', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {brands.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {b.logo_url && <img src={b.logo_url} alt="" className="w-8 h-8 object-contain rounded" />}
                      <span className="font-semibold text-gray-900">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{b.slug || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${b.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteBrand(b.id, b.name)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => { setModal(null); reset(); }}
        title={modal === 'create' ? 'Add Brand' : 'Edit Brand'}>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Input label="Name *" error={errors.name?.message} {...register('name', { required: 'Required' })} />
          <Input label="Slug" {...register('slug')} />
          <Input label="Logo URL" {...register('logo_url')} />
          <Textarea label="Description" rows={2} {...register('description')} />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('is_active')} className="rounded" /> Active
          </label>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setModal(null); reset(); }}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}>{modal === 'create' ? 'Create' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
