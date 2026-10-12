import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2, Upload, ImageIcon } from 'lucide-react';
import { categoriesService } from '../../services/products.service';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { getErrorMessage, apiClient } from '../../services/api';
import type { Category } from '../../types';
import { resolveImageUrl, onImageError } from '../../utils/image';
import toast from 'react-hot-toast';

interface FormValues { name: string; slug: string; description: string; is_active: boolean; }

function ImageUpload({ currentUrl, onUploaded }: { currentUrl?: string | null; onUploaded: (url: string) => void }) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setPreview(currentUrl ?? null); }, [currentUrl]);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post<{ url: string }>('/api/admin/settings/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUploaded(res.data.url);
    } catch (err) { toast.error(getErrorMessage(err)); setPreview(currentUrl ?? null); }
    finally { setUploading(false); if (ref.current) ref.current.value = ''; }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Category Image</label>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg border border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-900 flex items-center justify-center overflow-hidden">
          {preview ? <img src={preview} alt="category" className="w-full h-full object-cover" /> : <ImageIcon className="h-6 w-6 text-gray-300" />}
        </div>
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 disabled:opacity-50">
          <Upload className="h-4 w-4" />{uploading ? 'Uploading…' : preview ? 'Replace' : 'Upload Image'}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
    </div>
  );
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ defaultValues: { is_active: true } });

  const load = () => categoriesService.list().then(setCategories).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { reset({ is_active: true }); setImageUrl(null); setModal('create'); };
  const openEdit = (c: Category) => {
    reset({ name: c.name, slug: c.slug || '', description: c.description || '', is_active: c.is_active });
    setImageUrl(c.image_url ?? null);
    setModal(c.id);
  };

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = { ...data, slug: data.slug || undefined, description: data.description || undefined, image_url: imageUrl || undefined };
      if (modal === 'create') { await categoriesService.create(payload); toast.success('Category created'); }
      else if (typeof modal === 'number') { await categoriesService.update(modal, payload); toast.success('Category updated'); }
      setModal(null); reset(); load();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const deleteCategory = async (id: number, name: string) => {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    try { await categoriesService.delete(id); toast.success('Category deleted'); load(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">Categories</h1>
        <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>Add Category</Button>
      </div>

      {loading ? <SkeletonTable rows={6} cols={4} /> : categories.length === 0 ? (
        <EmptyState title="No categories" description="Create product categories." action={<Button onClick={openCreate}>Add Category</Button>} />
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-dark-700">
              <tr>{['Name', 'Slug', 'Active', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
              {categories.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {c.image_url
                        ? <img src={resolveImageUrl(c.image_url)} alt="" onError={onImageError} className="w-8 h-8 rounded object-cover" />
                        : <div className="w-8 h-8 rounded bg-gray-100 dark:bg-dark-700 flex items-center justify-center text-xs font-bold text-gray-400 dark:text-gray-500">{c.name[0]}</div>}
                      <span className="font-medium text-gray-900 dark:text-gray-50">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{c.slug || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-gray-400'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded transition-colors"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => deleteCategory(c.id, c.name)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal !== null} onClose={() => { setModal(null); reset(); }} title={modal === 'create' ? 'Add Category' : 'Edit Category'}>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Input label="Category Name *" error={errors.name?.message} {...register('name', { required: 'Required' })} />
          <Input label="Slug" hint="Leave blank to auto-generate" {...register('slug')} />
          <Textarea label="Description" {...register('description')} rows={3} />
          <ImageUpload currentUrl={imageUrl} onUploaded={url => setImageUrl(url)} />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('is_active')} className="rounded" />Active
          </label>
          <Button type="submit" fullWidth loading={submitting}>{modal === 'create' ? 'Create Category' : 'Save Changes'}</Button>
        </form>
      </Modal>
    </div>
  );
}
