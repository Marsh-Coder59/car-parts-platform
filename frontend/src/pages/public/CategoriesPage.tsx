import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoriesService } from '../../services/products.service';
import { SkeletonCard } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import type { Category } from '../../types';
import { resolveImageUrl, onImageError } from '../../utils/image';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    categoriesService.list()
      .then(data => setCategories(data.filter(c => c.is_active)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-50 mb-2">Categories</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">Browse parts by category</p>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : categories.length === 0 ? (
        <EmptyState title="No categories yet" description="Categories will appear here once added." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {categories.map(cat => (
            <Link
              key={cat.id}
              to={`/products?category_id=${cat.id}`}
              className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 hover:border-brand-200 hover:shadow-md transition-all group text-center"
            >
              {cat.image_url ? (
                <img src={resolveImageUrl(cat.image_url)} alt={cat.name} onError={onImageError} className="w-12 h-12 object-contain" />
              ) : (
                <div className="w-12 h-12 bg-brand-50 dark:bg-brand-900/20 group-hover:bg-brand-100 rounded-xl flex items-center justify-center text-2xl transition-colors">🔩</div>
              )}
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 group-hover:text-brand-600 transition-colors">{cat.name}</span>
              {cat.description && <span className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2">{cat.description}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
