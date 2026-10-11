import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Trash2 } from 'lucide-react';
import { wishlistService } from '../../services/user.service';
import { formatCurrency } from '../../utils/format';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { StockBadge } from '../../components/ui/Badge';
import type { WishlistItem } from '../../types';
import { resolveImageUrl, onImageError } from '../../utils/image';
import toast from 'react-hot-toast';

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => wishlistService.get().then(d => setItems(d.items)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const remove = async (productId: number) => {
    try {
      await wishlistService.remove(productId);
      setItems(prev => prev.filter(i => i.product_id !== productId));
      toast.success('Removed from wishlist');
    } catch { toast.error('Could not remove item'); }
  };

  const clearAll = async () => {
    if (!confirm('Clear entire wishlist?')) return;
    try {
      await wishlistService.clear();
      setItems([]);
      toast.success('Wishlist cleared');
    } catch { toast.error('Could not clear wishlist'); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Wishlist ({items.length})</h1>
        {items.length > 0 && (
          <button onClick={clearAll} className="text-sm text-red-500 hover:text-red-700 transition-colors">Clear all</button>
        )}
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Heart className="h-8 w-8" />} title="Your wishlist is empty"
          description="Save products you're interested in for later."
          action={<Link to="/products" className="px-5 py-2 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 text-sm">Browse Products</Link>}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden group">
              <Link to={`/products/${item.product_id}`}>
                <div className="aspect-square bg-gray-50 flex items-center justify-center text-gray-200">
                  {item.image ? (
                    <img src={resolveImageUrl(item.image)} alt={item.product_name} onError={onImageError} className="w-full h-full object-cover" />
                  ) : (
                    <Heart className="h-10 w-10" />
                  )}
                </div>
              </Link>
              <div className="p-3">
                <Link to={`/products/${item.product_id}`}>
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2 hover:text-brand-600 transition-colors mb-1">{item.product_name}</p>
                </Link>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(item.price)}</p>
                  <StockBadge available={item.status === 'ACTIVE' ? 1 : 0} />
                </div>
                <button onClick={() => remove(item.product_id)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-red-500 hover:text-red-700 border border-red-100 hover:border-red-200 rounded-lg transition-colors">
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
