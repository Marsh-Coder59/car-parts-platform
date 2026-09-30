import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { categoriesService } from '../../services/products.service';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { Category } from '../../types';
import toast from 'react-hot-toast';

interface FormValues { name: string; slug: string; description: string; image_url: string; is_active: boolean; }

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ defaultValues: { is_active: true } });

  const load = () => categoriesService.list().then(setCategories).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openEdit = (c: Category) => {
    reset({ name: c.name, slug: c.slug || '', description: c.description || '', image_url: c.image_url || '', is_active: c.is_active });
    setModal(c.id);
  };

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = { ...data, slug: data.slug || undefined, description: data.description || undefined, image_url: data.image_url || undefined };
      if (modal === 'create') {
        await categoriesService.create(payload);
        toast.success('Category created');
      } else if (typeof modal === 'number') {
        await categoriesService.update(modal, payload);
        toast.success('Category updated');
      }
      setModal(null); reset(); load();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const deleteCategory = async (id: number, name: string) => {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    try {
      await categoriesService.delete(id);
      toast.success('Category deleted');
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Categories</h1>
        <Button size="sm" onClick={() => { reset({ is_active: true }); setModal('create'); }} leftIcon={<Plus className="h-4 w-4" />}>
          Add Category
        </Button>
      </div>

      {loading ? <SkeletonTable rows={6} cols={4} /> : categories.length === 0 ? (
        <EmptyState title="No categories" description="Create product categories."
          action={<Button onClick={() => setModal('create')}>Add Category</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Name', 'Slug', 'Active', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categories.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{c.slug || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${c.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteCategory(c.id, c.name)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
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
        title={modal === 'create' ? 'Add Category' : 'Edit Category'}>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Input label="Name *" error={errors.name?.message} {...register('name', { required: 'Required' })} />
          <Input label="Slug" hint="URL-friendly identifier (auto-generated if blank)" {...register('slug')} />
          <Textarea label="Description" rows={2} {...register('description')} />
          <Input label="Image URL" {...register('image_url')} />
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
