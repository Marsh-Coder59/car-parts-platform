import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { productsService, categoriesService, brandsService } from '../../services/products.service';
import ProductCard from '../../components/shared/ProductCard';
import { SkeletonCard } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { Input, Select } from '../../components/ui/Input';
import type { ProductListItem, Category, Brand } from '../../types';

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const page = parseInt(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const categoryId = searchParams.get('category_id') || '';
  const brandId = searchParams.get('brand_id') || '';
  const condition = searchParams.get('condition') || '';
  const minPrice = searchParams.get('min_price') || '';
  const maxPrice = searchParams.get('max_price') || '';
  const sortBy = searchParams.get('sort_by') || 'created_at';
  const sortDir = searchParams.get('sort_dir') || 'desc';

  useEffect(() => {
    Promise.all([categoriesService.list(), brandsService.list()]).then(([c, b]) => {
      setCategories(c.filter(x => x.is_active));
      setBrands(b.filter(x => x.is_active));
    });
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productsService.list({
        search: search || undefined,
        category_id: categoryId ? parseInt(categoryId) : undefined,
        brand_id: brandId ? parseInt(brandId) : undefined,
        condition: condition || undefined,
        min_price: minPrice ? parseFloat(minPrice) : undefined,
        max_price: maxPrice ? parseFloat(maxPrice) : undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        page_size: PAGE_SIZE,
      });
      setProducts(res.products);
      setTotal(res.count);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search, categoryId, brandId, condition, minPrice, maxPrice, sortBy, sortDir, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    setSearchParams(params);
  };

  const clearFilters = () => {
    const s = searchParams.get('search');
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    setSearchParams(params);
  };

  const hasFilters = categoryId || brandId || condition || minPrice || maxPrice;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {search ? `Results for "${search}"` : 'All Parts'}
          </h1>
          {!loading && <p className="text-sm text-gray-500 mt-0.5">{total} products found</p>}
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={`${sortBy}:${sortDir}`}
            onChange={e => {
              const [by, dir] = e.target.value.split(':');
              updateParam('sort_by', by);
              updateParam('sort_dir', dir);
            }}
            className="text-sm"
          >
            <option value="created_at:desc">Newest First</option>
            <option value="price:asc">Price: Low to High</option>
            <option value="price:desc">Price: High to Low</option>
            <option value="name:asc">Name A–Z</option>
          </Select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters {hasFilters && <span className="w-2 h-2 bg-brand-500 rounded-full" />}
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Filter Products</h2>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Select label="Category" value={categoryId} onChange={e => updateParam('category_id', e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Brand" value={brandId} onChange={e => updateParam('brand_id', e.target.value)}>
              <option value="">All Brands</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Select label="Condition" value={condition} onChange={e => updateParam('condition', e.target.value)}>
              <option value="">Any Condition</option>
              <option value="NEW">New</option>
              <option value="USED">Used</option>
              <option value="REFURBISHED">Refurbished</option>
            </Select>
            <Input label="Min Price (KES)" type="number" value={minPrice}
              onChange={e => updateParam('min_price', e.target.value)} placeholder="0" />
            <Input label="Max Price (KES)" type="number" value={maxPrice}
              onChange={e => updateParam('max_price', e.target.value)} placeholder="Any" />
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={search ? `No parts match "${search}". Try a different search or clear the filters.` : 'No products match the selected filters.'}
          action={hasFilters ? <button onClick={clearFilters} className="text-sm text-brand-600 hover:underline">Clear filters</button> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={p => updateParam('page', String(p))}
          />
        </>
      )}
    </div>
  );
}
