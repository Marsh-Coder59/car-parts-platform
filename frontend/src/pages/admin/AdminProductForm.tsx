import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { productsService, categoriesService, brandsService } from '../../services/products.service';
import { Input, Select, Textarea } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { getErrorMessage } from '../../services/api';
import type { Category, Brand, ProductDetail } from '../../types';
import toast from 'react-hot-toast';

interface Props {
  productId?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormValues {
  name: string; slug: string; sku: string; part_number: string; description: string;
  price: string; compare_at_price: string; condition: string; status: string;
  weight: string; is_featured: boolean; category_id: string; brand_id: string;
}

export default function AdminProductForm({ productId, onSuccess, onCancel }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(!!productId);
  const [submitting, setSubmitting] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [addingImage, setAddingImage] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  useEffect(() => {
    Promise.all([categoriesService.list(), brandsService.list()]).then(([c, b]) => {
      setCategories(c);
      setBrands(b);
    });
    if (productId) {
      productsService.get(productId).then(p => {
        setProduct(p);
        const cat = typeof p.category === 'object' ? p.category?.id : '';
        const brand = typeof p.brand === 'object' ? p.brand?.id : '';
        reset({
          name: p.name, slug: p.slug || '', sku: p.sku || '',
          part_number: p.part_number || '', description: p.description || '',
          price: String(p.price), compare_at_price: String(p.compare_at_price || ''),
          condition: p.condition, status: p.status,
          weight: String(p.weight || ''), is_featured: p.is_featured,
          category_id: String(cat || ''), brand_id: String(brand || ''),
        });
      }).finally(() => setLoading(false));
    }
  }, [productId, reset]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        name: data.name, slug: data.slug || undefined, sku: data.sku || undefined,
        part_number: data.part_number || undefined, description: data.description || undefined,
        price: parseFloat(data.price),
        compare_at_price: data.compare_at_price ? parseFloat(data.compare_at_price) : undefined,
        condition: data.condition, status: data.status,
        weight: data.weight ? parseFloat(data.weight) : undefined,
        is_featured: data.is_featured,
        category_id: data.category_id ? parseInt(data.category_id) : undefined,
        brand_id: data.brand_id ? parseInt(data.brand_id) : undefined,
      };
      if (productId) {
        await productsService.update(productId, payload);
        toast.success('Product updated');
      } else {
        await productsService.create(payload);
        toast.success('Product created');
      }
      onSuccess();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const addImage = async () => {
    if (!productId || !newImageUrl.trim()) return;
    setAddingImage(true);
    try {
      await productsService.addImage(productId, { image_url: newImageUrl.trim(), is_primary: product?.images.length === 0 });
      const updated = await productsService.get(productId);
      setProduct(updated);
      setNewImageUrl('');
      toast.success('Image added');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setAddingImage(false); }
  };

  const deleteImage = async (imgId: number) => {
    if (!productId) return;
    try {
      await productsService.deleteImage(productId, imgId);
      setProduct(p => p ? { ...p, images: p.images.filter(i => i.id !== imgId) } : p);
      toast.success('Image removed');
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Input label="Product Name *" error={errors.name?.message}
          {...register('name', { required: 'Name is required' })} />
        <Input label="Slug" {...register('slug')} hint="Leave blank to auto-generate" />
        <Input label="SKU" {...register('sku')} />
        <Input label="Part Number" {...register('part_number')} />
        <Input label="Price (KES) *" type="number" step="0.01"
          error={errors.price?.message}
          {...register('price', { required: 'Price is required' })} />
        <Input label="Compare At Price (KES)" type="number" step="0.01" {...register('compare_at_price')} />
        <Select label="Category" {...register('category_id')}>
          <option value="">— No Category —</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Brand" {...register('brand_id')}>
          <option value="">— No Brand —</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select label="Condition" {...register('condition')}>
          <option value="NEW">New</option>
          <option value="USED">Used</option>
          <option value="REFURBISHED">Refurbished</option>
        </Select>
        <Select label="Status" {...register('status')}>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Input label="Weight (kg)" type="number" step="0.001" {...register('weight')} />
        <div className="flex items-center gap-2 pt-7">
          <input type="checkbox" id="is_featured" {...register('is_featured')} className="rounded" />
          <label htmlFor="is_featured" className="text-sm font-medium text-gray-700">Featured product</label>
        </div>
      </div>

      <Textarea label="Description" {...register('description')} rows={4} className="mb-4" />

      {/* Images (only for existing products) */}
      {productId && (
        <div className="mb-4 p-4 bg-gray-50 rounded-xl">
          <p className="text-sm font-semibold text-gray-900 mb-3">Product Images</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {product?.images.map(img => (
              <div key={img.id} className="relative group">
                <img src={img.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                {img.is_primary && (
                  <span className="absolute -top-1 -left-1 text-[9px] bg-brand-500 text-white px-1 rounded">Primary</span>
                )}
                <button type="button" onClick={() => deleteImage(img.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)}
              placeholder="Paste image URL…"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <Button type="button" size="sm" variant="outline" onClick={addImage} loading={addingImage}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="button" variant="ghost" fullWidth onClick={onCancel}>Cancel</Button>
        <Button type="submit" fullWidth loading={submitting}>
          {productId ? 'Save Changes' : 'Create Product'}
        </Button>
      </div>
    </form>
  );
}
