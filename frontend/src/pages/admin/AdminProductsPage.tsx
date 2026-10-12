import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Edit2, Archive } from 'lucide-react';
import { productsService } from '../../services/products.service';
import { formatCurrency, formatDate } from '../../utils/format';
import { StockBadge, Badge } from '../../components/ui/Badge';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import Pagination from '../../components/ui/Pagination';
import Modal from '../../components/ui/Modal';
import AdminProductForm from './AdminProductForm';
import type { ProductListItem } from '../../types';
import { resolveImageUrl, onImageError } from '../../utils/image';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../../services/api';

const PAGE_SIZE = 20;

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'create' | number | null>(null);

  const load = () => {
    setLoading(true);
    productsService.list({
      search: search || undefined,
      status: status || undefined,
      page,
      page_size: PAGE_SIZE,
    }).then(res => {
      setProducts(res.products);
      setTotal(res.count);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, status, page]);

  const handleArchive = async (id: number, name: string) => {
    if (!confirm(`Archive "${name}"?`)) return;
    try {
      await productsService.archive(id);
      toast.success('Product archived');
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50 flex-1">Products</h1>
        <Button size="sm" onClick={() => setModal('create')} leftIcon={<Plus className="h-4 w-4" />}>
          Add Product
        </Button>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, SKU, part number…"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-dark-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>

      {loading ? <SkeletonTable rows={8} cols={6} /> : products.length === 0 ? (
        <EmptyState title="No products found"
          description="Add your first product or adjust the filters."
          action={<Button onClick={() => setModal('create')}>Add Product</Button>}
        />
      ) : (
        <>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-dark-700">
                  <tr>
                    {['Product', 'SKU', 'Price', 'Stock', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.primary_image ? (
                            <img src={resolveImageUrl(p.primary_image)} alt="" onError={onImageError} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-dark-700 flex-shrink-0" />
                          )}
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-gray-50 line-clamp-1">{p.name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{p.brand || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{p.sku || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-50">{formatCurrency(p.price)}</td>
                      <td className="px-4 py-3"><StockBadge available={p.available_stock} /></td>
                      <td className="px-4 py-3">
                        <Badge className={p.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-gray-400'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{formatDate(p.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setModal(p.id)}
                            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {p.status !== 'ARCHIVED' && (
                            <button onClick={() => handleArchive(p.id, p.name)}
                              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}

      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Product' : 'Edit Product'}
        size="xl"
      >
        <AdminProductForm
          productId={typeof modal === 'number' ? modal : undefined}
          onSuccess={() => { setModal(null); load(); }}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </div>
  );
}
