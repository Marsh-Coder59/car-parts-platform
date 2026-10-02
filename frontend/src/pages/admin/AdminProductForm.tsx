import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2, Upload, X, ImageIcon } from 'lucide-react';
import { productsService, categoriesService, brandsService } from '../../services/products.service';
import { Input, Select, Textarea } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { getErrorMessage, apiClient } from '../../services/api';
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
  weight: string; stock_quantity: string; is_featured: boolean;
  category_id: string; brand_id: string;
}

// Auto-generate slug from name
function toSlug(str: string) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Auto-generate SKU: uppercase letters + timestamp suffix
function toSku(str: string) {
  const base = str.toUpperCase().trim().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
  const suffix = Date.now().toString(36).toUpperCase().slice(-4);
  return `${base}-${suffix}`;
}

// Image upload field component
function ImageUploadField({
  productId,
  images,
  onImagesChange,
}: {
  productId?: number;
  images: ProductDetail['images'];
  onImagesChange: (imgs: ProductDetail['images']) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !productId) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) { toast.error(`${file.name} is not an image`); continue; }
        if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name} exceeds 8 MB`); continue; }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('is_primary', String(images.length === 0));
        const res = await apiClient.post<{ id: number; image_url: string; is_primary: boolean }>(
          `/api/products/${productId}/images/upload`, fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        onImagesChange([...images, { id: res.data.id, image_url: res.data.image_url, is_primary: res.data.is_primary, alt_text: '', sort_order: images.length }]);
        toast.success('Image uploaded');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const deleteImage = async (imgId: number) => {
    if (!productId) return;
    try {
      await productsService.deleteImage(productId, imgId);
      onImagesChange(images.filter(i => i.id !== imgId));
      toast.success('Image removed');
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-xl">
      <p className="text-sm font-semibold text-gray-900 mb-3">Product Images</p>

      {!productId && (
        <p className="text-xs text-gray-400 mb-3">Save the product first, then you can upload images.</p>
      )}

      {productId && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {images.map(img => (
              <div key={img.id} className="relative group">
                <img src={img.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                {img.is_primary && (
                  <span className="absolute -top-1 -left-1 text-[9px] bg-brand-500 text-white px-1 rounded">Primary</span>
                )}
                <button type="button" onClick={() => deleteImage(img.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}

            {images.length === 0 && (
              <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                <ImageIcon className="h-5 w-5 text-gray-300" />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-white disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading…' : 'Upload Images'}
          </button>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · Max 8 MB each · Multiple allowed</p>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
        </>
      )}
    </div>
  );
}

export default function AdminProductForm({ productId, onSuccess, onCancel }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [images, setImages] = useState<ProductDetail['images']>([]);
  const [loading, setLoading] = useState(!!productId);
  const [submitting, setSubmitting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>();
  const watchedName = watch('name', '');

  // Auto-generate slug and SKU from name (only if not manually edited)
  useEffect(() => {
    if (!productId && watchedName) {
      if (!slugManuallyEdited) setValue('slug', toSlug(watchedName));
      if (!skuManuallyEdited) setValue('sku', toSku(watchedName));
    }
  }, [watchedName, productId, slugManuallyEdited, skuManuallyEdited, setValue]);

  useEffect(() => {
    Promise.all([categoriesService.list(), brandsService.list()]).then(([c, b]) => {
      setCategories(c);
      setBrands(b);
    });
    if (productId) {
      productsService.get(productId).then(p => {
        setProduct(p);
        setImages(p.images || []);
        const cat = typeof p.category === 'object' ? p.category?.id : '';
        const brand = typeof p.brand === 'object' ? p.brand?.id : '';
        reset({
          name: p.name, slug: p.slug || '', sku: p.sku || '',
          part_number: p.part_number || '', description: p.description || '',
          price: String(p.price), compare_at_price: String(p.compare_at_price || ''),
          condition: p.condition, status: p.status,
          weight: String(p.weight || ''),
          stock_quantity: String((p as any).stock_quantity ?? 0),
          is_featured: p.is_featured,
          category_id: String(cat || ''), brand_id: String(brand || ''),
        });
        setSlugManuallyEdited(true);
        setSkuManuallyEdited(true);
      }).finally(() => setLoading(false));
    }
  }, [productId, reset]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        name: data.name,
        slug: data.slug || toSlug(data.name),
        sku: data.sku || toSku(data.name),
        part_number: data.part_number || undefined,
        description: data.description || undefined,
        price: parseFloat(data.price),
        compare_at_price: data.compare_at_price ? parseFloat(data.compare_at_price) : undefined,
        condition: data.condition, status: data.status,
        weight: data.weight ? parseFloat(data.weight) : undefined,
        stock_quantity: data.stock_quantity ? parseInt(data.stock_quantity) : 0,
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

  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Input label="Product Name *" error={errors.name?.message}
          {...register('name', { required: 'Name is required' })} />

        <Input label="Slug" {...register('slug')}
          hint="Auto-generated from name"
          onChange={e => { setSlugManuallyEdited(true); setValue('slug', e.target.value); }} />

        <Input label="SKU" {...register('sku')}
          hint="Auto-generated — edit to customise"
          onChange={e => { setSkuManuallyEdited(true); setValue('sku', e.target.value); }} />

        <Input label="Part Number" {...register('part_number')} />

        <Input label="Price (USD) *" type="number" step="0.01"
          error={errors.price?.message}
          {...register('price', { required: 'Price is required' })} />

        <Input label="Compare At Price (USD)" type="number" step="0.01" {...register('compare_at_price')} />

        <Input label="Stock Quantity" type="number" min="0"
          hint="Total units available"
          {...register('stock_quantity')} />

        <Input label="Weight (kg)" type="number" step="0.001" {...register('weight')} />

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

        <div className="flex items-center gap-2 pt-7">
          <input type="checkbox" id="is_featured" {...register('is_featured')} className="rounded" />
          <label htmlFor="is_featured" className="text-sm font-medium text-gray-700">Featured product</label>
        </div>
      </div>

      <Textarea label="Description" {...register('description')} rows={4} className="mb-4" />

      <ImageUploadField productId={productId} images={images} onImagesChange={setImages} />

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="button" variant="ghost" fullWidth onClick={onCancel}>Cancel</Button>
        <Button type="submit" fullWidth loading={submitting}>
          {productId ? 'Save Changes' : 'Create Product'}
        </Button>
      </div>
    </form>
  );
}
