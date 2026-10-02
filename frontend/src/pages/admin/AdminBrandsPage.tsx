import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2, Upload, ImageIcon } from 'lucide-react';
import { brandsService } from '../../services/products.service';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { getErrorMessage, apiClient } from '../../services/api';
import type { Brand } from '../../types';
import toast from 'react-hot-toast';

interface FormValues { name: string; slug: string; description: string; is_active: boolean; }

function LogoUpload({ currentUrl, onUploaded }: { currentUrl?: string | null; onUploaded: (url: string) => void }) {
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
      <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo</label>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
          {preview ? <img src={preview} alt="logo" className="w-full h-full object-contain" /> : <ImageIcon className="h-6 w-6 text-gray-300" />}
        </div>
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <Upload className="h-4 w-4" />{uploading ? 'Uploading…' : preview ? 'Replace' : 'Upload Logo'}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
    </div>
  );
}

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ defaultValues: { is_active: true } });

  const load = () => brandsService.list().then(setBrands).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { reset({ is_active: true }); setLogoUrl(null); setModal('create'); };
  const openEdit = (b: Brand) => {
    reset({ name: b.name, slug: b.slug || '', description: b.description || '', is_active: b.is_active });
    setLogoUrl(b.logo_url ?? null);
    setModal(b.id);
  };

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = { ...data, slug: data.slug || undefined, description: data.description || undefined, logo_url: logoUrl || undefined };
      if (modal === 'create') { await brandsService.create(payload); toast.success('Brand created'); }
      else if (typeof modal === 'number') { await brandsService.update(modal, payload); toast.success('Brand updated'); }
      setModal(null); reset(); load();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const deleteBrand = async (id: number, name: string) => {
    if (!confirm(`Delete brand "${name}"?`)) return;
    try { await brandsService.delete(id); toast.success('Brand deleted'); load(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Brands</h1>
        <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>Add Brand</Button>
      </div>

      {loading ? <SkeletonTable rows={6} cols={4} /> : brands.length === 0 ? (
        <EmptyState title="No brands" description="Create brands for your products." action={<Button onClick={openCreate}>Add Brand</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Brand', 'Slug', 'Active', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {brands.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {b.logo_url
                        ? <img src={b.logo_url} alt="" className="w-8 h-8 rounded object-contain bg-gray-50" />
                        : <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">{b.name[0]}</div>}
                      <span className="font-medium text-gray-900">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{b.slug || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => deleteBrand(b.id, b.name)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal !== null} onClose={() => { setModal(null); reset(); }} title={modal === 'create' ? 'Add Brand' : 'Edit Brand'}>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Input label="Brand Name *" error={errors.name?.message} {...register('name', { required: 'Required' })} />
          <Input label="Slug" hint="Leave blank to auto-generate" {...register('slug')} />
          <Textarea label="Description" {...register('description')} rows={3} />
          <LogoUpload currentUrl={logoUrl} onUploaded={url => setLogoUrl(url)} />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('is_active')} className="rounded" />Active
          </label>
          <Button type="submit" fullWidth loading={submitting}>{modal === 'create' ? 'Create Brand' : 'Save Changes'}</Button>
        </form>
      </Modal>
    </div>
  );
}
