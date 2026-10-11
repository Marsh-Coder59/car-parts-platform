import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Upload, X, ImageIcon, RefreshCw } from 'lucide-react';
import { productsService, categoriesService, brandsService } from '../../services/products.service';
import { Input, Select, Textarea } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { getErrorMessage, apiClient } from '../../services/api';
import type { Category, Brand, ProductDetail } from '../../types';
import { resolveImageUrl, onImageError } from '../../utils/image';
import toast from 'react-hot-toast';

interface Props {
  productId?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormValues {
  name: string;
  slug: string;
  sku: string;
  part_number: string;
  description: string;
  price: string;
  compare_at_price: string;
  condition: string;
  status: string;
  weight: string;
  stock_quantity: string;
  is_featured: boolean;
  category_id: string;
  brand_id: string;
}

type ProductImage = { id: number; image_url: string; is_primary: boolean; alt_text?: string; sort_order?: number };

// ── helpers ──────────────────────────────────────────────────────────────────
function toSlug(str: string) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function toSku(str: string) {
  const base = str.toUpperCase().trim().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
  const suffix = Date.now().toString(36).toUpperCase().slice(-4);
  return `${base}-${suffix}`;
}

// ── image panel ───────────────────────────────────────────────────────────────
function ImagePanel({
  productId,
  images,
  onImagesChange,
}: {
  productId: number;
  images: ProductImage[];
  onImagesChange: (imgs: ProductImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const newImages = [...images];
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) { toast.error(`${file.name} is not an image`); continue; }
        if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name} exceeds 8 MB`); continue; }
        const fd = new FormData();
        fd.append('file', file);
        // First image for a product becomes primary automatically
        fd.append('is_primary', String(newImages.length === 0 ? 'true' : 'false'));
        const res = await apiClient.post<{ id: number; image_url: string; is_primary: boolean }>(
          `/api/products/${productId}/images/upload`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        newImages.push({
          id: res.data.id,
          image_url: res.data.image_url,
          is_primary: res.data.is_primary,
          alt_text: '',
          sort_order: newImages.length,
        });
        toast.success('Image uploaded');
      }
      onImagesChange(newImages);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeImage = async (imgId: number) => {
    try {
      await productsService.deleteImage(productId, imgId);
      onImagesChange(images.filter(i => i.id !== imgId));
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-xl mb-4">
      <p className="text-sm font-semibold text-gray-900 mb-3">Product Images</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {images.map(img => (
          <div key={img.id} className="relative group">
            <img
              src={resolveImageUrl(img.image_url)}
              alt=""
              onError={onImageError}
              className="w-16 h-16 rounded-lg object-cover border border-gray-200 bg-white"
            />
            {img.is_primary && (
              <span className="absolute -top-1 -left-1 text-[9px] bg-brand-500 text-white px-1 py-0.5 rounded font-semibold">
                Primary
              </span>
            )}
            <button
              type="button"
              onClick={() => removeImage(img.id)}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full items-center justify-center hidden group-hover:flex"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {images.length === 0 && (
          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-gray-300" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-white disabled:opacity-50 transition-colors"
      >
        {uploading
          ? <><RefreshCw className="h-4 w-4 animate-spin" />Uploading…</>
          : <><Upload className="h-4 w-4" />Upload Images</>}
      </button>
      <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · Max 8 MB · Multiple files allowed</p>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
    </div>
  );
}

// ── main form ─────────────────────────────────────────────────────────────────
export default function AdminProductForm({ productId, onSuccess, onCancel }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(!!productId);
  const [submitting, setSubmitting] = useState(false);
  // Track whether we've already saved (so image panel can show on create after first save)
  const [savedProductId, setSavedProductId] = useState<number | undefined>(productId);
  const [slugManual, setSlugManual] = useState(false);
  const [skuManual, setSkuManual] = useState(false);

  const {
    register, handleSubmit, reset, watch, setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      condition: 'NEW', status: 'DRAFT', is_featured: false, stock_quantity: '0',
    },
  });

  const watchedName = watch('name', '');

  // Auto-generate slug + SKU when typing name (edit mode: already set, don't override)
  useEffect(() => {
    if (!productId && watchedName) {
      if (!slugManual) setValue('slug', toSlug(watchedName));
      if (!skuManual) setValue('sku', toSku(watchedName));
    }
  }, [watchedName, productId, slugManual, skuManual, setValue]);

  // Load categories, brands, and product data
  useEffect(() => {
    Promise.all([categoriesService.list(), brandsService.list()]).then(([c, b]) => {
      setCategories(c);
      setBrands(b);
    });

    if (productId) {
      productsService.get(productId).then(p => {
        const catId = typeof p.category === 'object' ? String(p.category?.id ?? '') : '';
        const brandId = typeof p.brand === 'object' ? String(p.brand?.id ?? '') : '';
        // stock_quantity lives in inventory
        const qty = (p as any).inventory?.quantity ?? (p as any).stock_quantity ?? 0;
        reset({
          name: p.name,
          slug: p.slug || '',
          sku: p.sku || '',
          part_number: p.part_number || '',
          description: p.description || '',
          price: String(p.price),
          compare_at_price: String(p.compare_at_price || ''),
          condition: p.condition || 'NEW',
          status: p.status || 'DRAFT',
          weight: String(p.weight || ''),
          stock_quantity: String(qty),
          is_featured: p.is_featured,
          category_id: catId,
          brand_id: brandId,
        });
        setImages(p.images || []);
        setSlugManual(true);
        setSkuManual(true);
      }).finally(() => setLoading(false));
    }
  }, [productId, reset]);

  const buildPayload = (data: FormValues) => ({
    name: data.name,
    slug: data.slug || toSlug(data.name),
    sku: data.sku || toSku(data.name),
    part_number: data.part_number || undefined,
    description: data.description || undefined,
    price: parseFloat(data.price),
    compare_at_price: data.compare_at_price ? parseFloat(data.compare_at_price) : undefined,
    condition: data.condition,
    status: data.status,
    weight: data.weight ? parseFloat(data.weight) : undefined,
    stock_quantity: data.stock_quantity !== '' ? parseInt(data.stock_quantity, 10) : 0,
    is_featured: data.is_featured,
    category_id: data.category_id ? parseInt(data.category_id, 10) : undefined,
    brand_id: data.brand_id ? parseInt(data.brand_id, 10) : undefined,
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      if (savedProductId) {
        // UPDATE existing product
        await productsService.update(savedProductId, buildPayload(data));
        toast.success('Product saved');
        onSuccess();
      } else {
        // CREATE — save product first, then images can be uploaded
        const result = await productsService.create(buildPayload(data));
        const newId: number = result.id;
        setSavedProductId(newId);
        toast.success('Product created — you can now upload images');
        // If no images to upload, go back. Otherwise stay so user can upload images.
        if (images.length === 0) {
          // give a moment for the user to see the message
          setTimeout(onSuccess, 800);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDoneWithImages = () => onSuccess();

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* Name — full width */}
          <div className="md:col-span-2">
            <Input
              label="Product Name *"
              error={errors.name?.message}
              {...register('name', { required: 'Product name is required' })}
            />
          </div>

          <Input
            label="Slug"
            hint="Auto-generated — edit to customise"
            {...register('slug')}
            onChange={e => { setSlugManual(true); setValue('slug', e.target.value); }}
          />
          <Input
            label="SKU"
            hint="Auto-generated — edit to customise"
            {...register('sku')}
            onChange={e => { setSkuManual(true); setValue('sku', e.target.value); }}
          />

          <Input label="Part Number" {...register('part_number')} />

          <Input
            label="Stock Quantity"
            type="number"
            min="0"
            hint="Units available in inventory"
            {...register('stock_quantity')}
          />

          <Input
            label="Price (USD) *"
            type="number"
            step="0.01"
            min="0"
            error={errors.price?.message}
            {...register('price', {
              required: 'Price is required',
              validate: v => parseFloat(v) >= 0 || 'Price must be 0 or more',
            })}
          />
          <Input
            label="Compare At Price (USD)"
            type="number"
            step="0.01"
            min="0"
            hint="Original / crossed-out price"
            {...register('compare_at_price')}
          />

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

          <Input label="Weight (kg)" type="number" step="0.001" min="0" {...register('weight')} />

          <div className="flex items-center gap-2 pt-7">
            <input type="checkbox" id="is_featured" {...register('is_featured')} className="w-4 h-4 rounded" />
            <label htmlFor="is_featured" className="text-sm font-medium text-gray-700 cursor-pointer">Featured product</label>
          </div>
        </div>

        <Textarea label="Description" {...register('description')} rows={4} className="mb-4" />

        {/* Image upload — only shown once product exists */}
        {savedProductId ? (
          <ImagePanel
            productId={savedProductId}
            images={images}
            onImagesChange={setImages}
          />
        ) : (
          <div className="mb-4 p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-center">
            <ImageIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Save the product first, then upload images</p>
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button type="button" variant="ghost" fullWidth onClick={onCancel}>Cancel</Button>
          {savedProductId && !productId ? (
            // After creating, show a "Done" button alongside Save
            <>
              <Button type="submit" variant="secondary" loading={submitting}>
                Update & Finish
              </Button>
              <Button type="button" fullWidth onClick={handleDoneWithImages}>
                Done (Back to List)
              </Button>
            </>
          ) : (
            <Button type="submit" fullWidth loading={submitting}>
              {savedProductId ? 'Save Changes' : 'Create Product'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
