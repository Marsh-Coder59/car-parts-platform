import { Link } from 'react-router-dom';
import { ShoppingCart, Heart } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { StockBadge } from '../ui/Badge';
import type { ProductListItem } from '../../types';
import { cartService } from '../../services/cart.service';
import { wishlistService } from '../../services/user.service';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import toast from 'react-hot-toast';
import { useState } from 'react';

interface ProductCardProps {
  product: ProductListItem;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { isAuthenticated } = useAuth();
  const { refresh } = useCart();
  const [adding, setAdding] = useState(false);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error('Please sign in to add items to cart');
      return;
    }
    if (product.available_stock <= 0) return;
    setAdding(true);
    try {
      await cartService.addItem(product.id, 1);
      await refresh();
      toast.success(`${product.name} added to cart`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Could not add to cart';
      toast.error(typeof msg === 'string' ? msg : 'Could not add to cart');
    } finally {
      setAdding(false);
    }
  };

  const handleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error('Please sign in to use wishlist');
      return;
    }
    try {
      await wishlistService.add(product.id);
      toast.success('Added to wishlist');
    } catch {
      toast.error('Could not update wishlist');
    }
  };

  return (
    <Link to={`/products/${product.id}`} className="group block bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all overflow-hidden">
      {/* Image */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        {product.primary_image ? (
          <img
            src={product.primary_image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200">
            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z"/>
            </svg>
          </div>
        )}
        {product.condition !== 'NEW' && (
          <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-semibold bg-gray-800 text-white rounded">
            {product.condition}
          </span>
        )}
        <button
          onClick={handleWishlist}
          className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white shadow-sm"
        >
          <Heart className="h-3.5 w-3.5 text-gray-500" />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        {product.brand && (
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{product.brand}</p>
        )}
        <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 mb-2">
          {product.name}
        </h3>
        {product.sku && (
          <p className="text-xs text-gray-400 mb-2">SKU: {product.sku}</p>
        )}

        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-base font-bold text-gray-900">{formatCurrency(product.price)}</p>
            {product.compare_at_price && product.compare_at_price > product.price && (
              <p className="text-xs text-gray-400 line-through">{formatCurrency(product.compare_at_price)}</p>
            )}
          </div>
          <StockBadge available={product.available_stock} />
        </div>

        <button
          onClick={handleAddToCart}
          disabled={adding || product.available_stock <= 0 || product.status !== 'ACTIVE'}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-brand-500 hover:bg-brand-600 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-lg transition-colors"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {adding ? 'Adding…' : product.available_stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </Link>
  );
}
