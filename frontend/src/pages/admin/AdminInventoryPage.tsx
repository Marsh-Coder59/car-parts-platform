import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { TrendingUp, TrendingDown, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatDateTime } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { InventoryItem } from '../../types';
import toast from 'react-hot-toast';

type ModalType = 'stock-in' | 'stock-out' | 'adjust' | null;

export default function AdminInventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    quantity: string; new_quantity: string; notes: string; reorder_level: string;
  }>();

  const load = () => {
    setLoading(true);
    (showLowStock ? adminService.getLowStock() : adminService.listInventory())
      .then(setInventory)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [showLowStock]);

  const openModal = (type: ModalType, item: InventoryItem) => {
    setSelectedProduct(item);
    setModal(type);
    reset();
  };

  const onSubmit = async (data: { quantity: string; new_quantity: string; notes: string; reorder_level: string }) => {
    if (!selectedProduct || !modal) return;
    setSubmitting(true);
    try {
      if (modal === 'stock-in') {
        await adminService.stockIn({
          product_id: selectedProduct.product_id,
          quantity: parseInt(data.quantity),
          reorder_level: data.reorder_level ? parseInt(data.reorder_level) : undefined,
          notes: data.notes || undefined,
        });
        toast.success(`Added ${data.quantity} units to stock`);
      } else if (modal === 'stock-out') {
        await adminService.stockOut({
          product_id: selectedProduct.product_id,
          quantity: parseInt(data.quantity),
          notes: data.notes || undefined,
        });
        toast.success(`Removed ${data.quantity} units from stock`);
      } else if (modal === 'adjust') {
        await adminService.adjustInventory({
          product_id: selectedProduct.product_id,
          new_quantity: parseInt(data.new_quantity),
          notes: data.notes,
        });
        toast.success('Inventory adjusted');
      }
      setModal(null);
      setSelectedProduct(null);
      reset();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const displayList = inventory as InventoryItem[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">Inventory</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLowStock(!showLowStock)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${showLowStock ? 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700' : 'border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700'}`}
          >
            <AlertTriangle className="h-4 w-4" />
            {showLowStock ? 'Show All' : 'Low Stock Only'}
          </button>
        </div>
      </div>

      {loading ? <SkeletonTable rows={8} cols={6} /> : displayList.length === 0 ? (
        <EmptyState title={showLowStock ? 'No low-stock products' : 'No inventory records'}
          description={showLowStock ? 'All products are well stocked.' : 'Add products first.'} />
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-dark-700">
                <tr>
                  {['Product', 'SKU', 'In Stock', 'Reserved', 'Available', 'Reorder At', 'Updated', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
                {displayList.map(item => {
                  const isLow = item.available_quantity <= item.reorder_level;
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors ${isLow ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-50">{item.product_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{item.sku || '—'}</td>
                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-50">{item.quantity}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{item.reserved_quantity}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${item.available_quantity <= 0 ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-green-700'}`}>
                          {item.available_quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{item.reorder_level}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{formatDateTime(item.updated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openModal('stock-in', item)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors whitespace-nowrap">
                            <TrendingUp className="h-3 w-3" /> In
                          </button>
                          <button onClick={() => openModal('stock-out', item)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-lg transition-colors whitespace-nowrap">
                            <TrendingDown className="h-3 w-3" /> Out
                          </button>
                          <button onClick={() => openModal('adjust', item)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 rounded-lg transition-colors">
                            <SlidersHorizontal className="h-3 w-3" /> Adjust
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => { setModal(null); setSelectedProduct(null); reset(); }}
        title={modal === 'stock-in' ? 'Add Stock' : modal === 'stock-out' ? 'Remove Stock' : 'Adjust Inventory'}>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {selectedProduct && (
            <div className="p-3 bg-gray-50 dark:bg-dark-900 rounded-lg text-sm">
              <p className="font-semibold text-gray-900 dark:text-gray-50">{selectedProduct.product_name}</p>
              <p className="text-gray-500 dark:text-gray-400">Current: {selectedProduct.quantity} in stock · {selectedProduct.available_quantity} available</p>
            </div>
          )}

          {modal === 'adjust' ? (
            <Input label="New Total Quantity" type="number" min="0"
              error={errors.new_quantity?.message}
              {...register('new_quantity', { required: 'Required', min: { value: 0, message: 'Cannot be negative' } })}
            />
          ) : (
            <Input label="Quantity" type="number" min="1"
              error={errors.quantity?.message}
              {...register('quantity', { required: 'Required', min: { value: 1, message: 'Must be at least 1' } })}
            />
          )}

          {modal === 'stock-in' && (
            <Input label="Reorder Level (optional)" type="number" min="0" {...register('reorder_level')} />
          )}

          <Textarea label={modal === 'adjust' ? 'Reason for adjustment (required)' : 'Notes (optional)'}
            rows={2}
            {...register('notes', modal === 'adjust' ? { required: 'Reason is required' } : {})}
            error={errors.notes?.message}
          />

          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setModal(null); reset(); }}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}
              variant={modal === 'stock-out' ? 'danger' : 'primary'}>
              {modal === 'stock-in' ? 'Add Stock' : modal === 'stock-out' ? 'Remove Stock' : 'Adjust'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
