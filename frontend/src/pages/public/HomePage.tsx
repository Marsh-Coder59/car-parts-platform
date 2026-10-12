import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Truck, HeadphonesIcon, Star, ChevronRight } from 'lucide-react';
import { productsService } from '../../services/products.service';
import { categoriesService } from '../../services/products.service';
import { resolveImageUrl, onImageError } from '../../utils/image';
import { SkeletonCard } from '../../components/ui/Skeleton';
import ProductCard from '../../components/shared/ProductCard';
import type { ProductListItem, Category } from '../../types';

export default function HomePage() {
  const [featured, setFeatured] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      productsService.list({ status: 'ACTIVE', page: 1, page_size: 8 }),
      categoriesService.list(),
    ]).then(([prod, cats]) => {
      setFeatured(prod.products);
      setCategories(cats.filter(c => c.is_active).slice(0, 8));
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-brand-400 text-sm font-semibold tracking-widest uppercase mb-4">
              Automotive Parts Marketplace
            </p>
            <h1 className="text-4xl lg:text-6xl font-extrabold leading-tight mb-6">
              Find the Right Part,<br />
              <span className="text-brand-400">Every Time.</span>
            </h1>
            <p className="text-lg text-gray-300 mb-8 leading-relaxed">
              Browse thousands of genuine and aftermarket parts for your vehicle. Filter by make, model, year — and get exactly what you need.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition-colors"
              >
                Shop All Parts <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/categories"
                className="inline-flex items-center gap-2 px-6 py-3 border border-gray-600 hover:border-gray-400 text-gray-200 hover:text-white font-semibold rounded-lg transition-colors"
              >
                Browse Categories
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="bg-white dark:bg-dark-800 border-b border-gray-100 dark:border-dark-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: <Shield className="h-5 w-5 text-brand-500" />, title: 'Genuine Parts', sub: 'Quality guaranteed' },
              { icon: <Truck className="h-5 w-5 text-brand-500" />, title: 'Fast Delivery', sub: 'Global shipping' },
              { icon: <HeadphonesIcon className="h-5 w-5 text-brand-500" />, title: 'Expert Support', sub: 'Parts specialists' },
              { icon: <Star className="h-5 w-5 text-brand-500" />, title: 'Trusted Sellers', sub: 'Verified suppliers' },
            ].map(item => (
              <div key={item.title} className="flex items-center gap-3">
                <div className="flex-shrink-0 p-2.5 bg-brand-50 dark:bg-brand-900/20 rounded-lg">{item.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{item.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Shop by Category</h2>
            <Link to="/categories" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {categories.map(cat => (
              <Link
                key={cat.id}
                to={`/products?category_id=${cat.id}`}
                className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 hover:border-brand-200 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/20 group-hover:bg-brand-100 flex items-center justify-center transition-colors overflow-hidden">
                  {cat.image_url ? (
                    <img
                      src={resolveImageUrl(cat.image_url)}
                      alt={cat.name}
                      onError={onImageError}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xl">🔧</span>
                  )}
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200 text-center leading-tight">{cat.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Available Parts</h2>
          <Link to="/products" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : featured.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <p className="text-lg font-medium">No products available yet</p>
            <p className="text-sm mt-1">Check back soon — the catalog is being built.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {featured.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}