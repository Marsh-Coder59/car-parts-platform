import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { brandsService } from '../../services/products.service';
import { SkeletonCard } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import type { Brand } from '../../types';
import { resolveImageUrl, onImageError } from '../../utils/image';

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    brandsService.list().then(data => setBrands(data.filter(b => b.is_active))).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-50 mb-2">Brands</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">Browse parts by brand</p>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : brands.length === 0 ? (
        <EmptyState title="No brands yet" description="Brands will appear here once added." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {brands.map(brand => (
            <Link key={brand.id} to={`/products?brand_id=${brand.id}`}
              className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 hover:border-brand-200 hover:shadow-md transition-all group text-center">
              {brand.logo_url ? (
                <img src={resolveImageUrl(brand.logo_url)} alt={brand.name} onError={onImageError} className="h-10 object-contain" />
              ) : (
                <div className="w-12 h-12 bg-gray-100 dark:bg-dark-700 group-hover:bg-brand-50 rounded-xl flex items-center justify-center text-lg font-bold text-gray-400 dark:text-gray-500 transition-colors">
                  {brand.name.charAt(0)}
                </div>
              )}
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 group-hover:text-brand-600 transition-colors">{brand.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
