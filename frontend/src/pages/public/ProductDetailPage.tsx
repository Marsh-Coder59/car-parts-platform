import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShoppingCart, Heart, Star, ChevronRight, Package, Car } from 'lucide-react';
import { productsService } from '../../services/products.service';
import { cartService } from '../../services/cart.service';
import { wishlistService, reviewsService } from '../../services/user.service';
import { formatCurrency, formatDate } from '../../utils/format';
import { StockBadge, Badge } from '../../components/ui/Badge';
import { SkeletonLines } from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import type { ProductDetail, Review } from '../../types';
import { resolveImageUrl, onImageError } from '../../utils/image';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const { isAuthenticated } = useAuth();
  const { refresh } = useCart();

  useEffect(() => {
    if (!id) return;
    Promise.all([
      productsService.get(parseInt(id)),
      productsService.getReviews(parseInt(id)),
    ]).then(([prod, rev]) => {
      setProduct(prod);
      setReviews(rev);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleAddToCart = async () => {
    if (!isAuthenticated) { toast.error('Please sign in'); return; }
    if (!product) return;
    setAdding(true);
    try {
      await cartService.addItem(product.id, qty);
      await refresh();
      toast.success('Added to cart!');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Could not add to cart';
      toast.error(typeof msg === 'string' ? msg : 'Could not add to cart');
    } finally {
      setAdding(false);
    }
  };

  const handleWishlist = async () => {
    if (!isAuthenticated) { toast.error('Please sign in'); return; }
    if (!product) return;
    try {
      await wishlistService.add(product.id);
      toast.success('Added to wishlist');
    } catch { toast.error('Could not update wishlist'); }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid md:grid-cols-2 gap-10">
          <div className="aspect-square bg-gray-100 rounded-2xl animate-pulse" />
          <div className="space-y-4">
            <SkeletonLines lines={6} />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <Package className="h-16 w-16 text-gray-200 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Product not found</h1>
        <Link to="/products" className="text-brand-600 hover:underline text-sm mt-2 inline-block">← Back to products</Link>
      </div>
    );
  }

  const images = product.images || [];
  const category = typeof product.category === 'object' ? product.category?.name : product.category;
  const brand = typeof product.brand === 'object' ? product.brand?.name : product.brand;
  const available = product.inventory?.available ?? 0;
  const canBuy = product.status === 'ACTIVE' && available > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:text-gray-700">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to="/products" className="hover:text-gray-700">Products</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-900 font-medium truncate max-w-xs">{product.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10 mb-12">
        {/* Images */}
        <div>
          <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 mb-3">
            {images.length > 0 ? (
              <img src={resolveImageUrl(images[activeImage]?.image_url)} alt={product.name} onError={onImageError} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-200">
                <Package className="h-24 w-24" />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button key={img.id} onClick={() => setActiveImage(i)}
                  className={clsx(
                    'w-16 h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors',
                    i === activeImage ? 'border-brand-500' : 'border-gray-100'
                  )}>
                  <img src={resolveImageUrl(img.image_url)} alt="" onError={onImageError} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {brand && <p className="text-sm font-medium text-brand-600 mb-1">{brand}</p>}
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 mb-3">{product.name}</h1>

          <div className="flex flex-wrap gap-2 mb-4">
            <StockBadge available={available} />
            <Badge className="bg-gray-100 text-gray-600">{product.condition}</Badge>
            {category && <Badge className="bg-blue-50 text-blue-700">{category}</Badge>}
          </div>

          {/* Price */}
          <div className="mb-5">
            <span className="text-3xl font-extrabold text-gray-900">{formatCurrency(product.price)}</span>
            {product.compare_at_price && product.compare_at_price > product.price && (
              <span className="ml-3 text-lg text-gray-400 line-through">{formatCurrency(product.compare_at_price)}</span>
            )}
          </div>

          {/* SKU / Part number */}
          <div className="grid grid-cols-2 gap-3 text-sm mb-5">
            {product.sku && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-0.5">SKU</p>
                <p className="font-mono font-semibold text-gray-900">{product.sku}</p>
              </div>
            )}
            {product.part_number && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-0.5">Part Number</p>
                <p className="font-mono font-semibold text-gray-900">{product.part_number}</p>
              </div>
            )}
          </div>

          {/* Quantity + Add to cart */}
          {canBuy && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-2 hover:bg-gray-50 text-gray-600 font-bold">−</button>
                <span className="px-4 py-2 text-sm font-semibold border-x border-gray-200 min-w-[3rem] text-center">{qty}</span>
                <button onClick={() => setQty(q => Math.min(available, q + 1))} className="px-3 py-2 hover:bg-gray-50 text-gray-600 font-bold">+</button>
              </div>
              <span className="text-xs text-gray-500">{available} available</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              fullWidth
              loading={adding}
              disabled={!canBuy}
              onClick={handleAddToCart}
              leftIcon={<ShoppingCart className="h-4 w-4" />}
            >
              {canBuy ? 'Add to Cart' : 'Out of Stock'}
            </Button>
            <button
              onClick={handleWishlist}
              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-red-500 transition-colors"
            >
              <Heart className="h-5 w-5" />
            </button>
          </div>

          {/* Description */}
          {product.description && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Description</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Compatible vehicles */}
      {product.compatible_vehicles?.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Car className="h-5 w-5 text-brand-500" /> Compatible Vehicles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {product.compatible_vehicles.map(v => (
              <div key={v.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-semibold text-gray-900">{v.make} {v.model}</p>
                <p className="text-gray-500">
                  {v.year_from && v.year_to ? `${v.year_from}–${v.year_to}` : v.year_from || v.year_to || ''}
                  {v.engine && ` · ${v.engine}`}
                  {v.fuel_type && ` · ${v.fuel_type}`}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Reviews */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Star className="h-5 w-5 text-brand-500" /> Customer Reviews
        </h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-gray-500">No reviews yet for this product.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={clsx('h-4 w-4', i < r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200')} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">{r.reviewer} · {formatDate(r.created_at)}</span>
                </div>
                {r.title && <p className="text-sm font-semibold text-gray-900 mb-1">{r.title}</p>}
                {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
