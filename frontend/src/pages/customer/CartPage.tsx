import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from 'lucide-react';
import { cartService } from '../../services/cart.service';
import { formatCurrency } from '../../utils/format';
import { useCart } from '../../context/CartContext';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import toast from 'react-hot-toast';

export default function CartPage() {
  const { cart, loading, refresh } = useCart();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState<number | null>(null);

  const handleQtyChange = async (itemId: number, qty: number) => {
    if (qty < 1) return;
    setUpdating(itemId);
    try {
      await cartService.updateItem(itemId, qty);
      await refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'Could not update quantity');
    } finally {
      setUpdating(null);
    }
  };

  const handleRemove = async (itemId: number) => {
    setUpdating(itemId);
    try {
      await cartService.removeItem(itemId);
      await refresh();
      toast.success('Item removed');
    } catch {
      toast.error('Could not remove item');
    } finally {
      setUpdating(null);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear your entire cart?')) return;
    try {
      await cartService.clear();
      await refresh();
      toast.success('Cart cleared');
    } catch {
      toast.error('Could not clear cart');
    }
  };

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <SkeletonTable rows={4} cols={4} />
    </div>
  );

  if (!cart || cart.items.length === 0) return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <EmptyState
        icon={<ShoppingBag className="h-8 w-8" />}
        title="Your cart is empty"
        description="Browse our catalogue and add parts to your cart."
        action={<Link to="/products"><Button>Browse Products</Button></Link>}
      />
    </div>
  );

  const hasIssues = cart.items.some(i => !i.in_stock);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shopping Cart ({cart.item_count} items)</h1>
        <button onClick={handleClear} className="text-sm text-red-500 hover:text-red-700 transition-colors">Clear cart</button>
      </div>

      {hasIssues && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Some items in your cart are out of stock or unavailable. Please remove them to proceed to checkout.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 space-y-3">
          {cart.items.map(item => (
            <div key={item.id} className={`bg-white rounded-xl border p-4 flex gap-4 ${!item.in_stock ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
              <div className="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-300">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <Link to={`/products/${item.product_id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-600 line-clamp-1 transition-colors">
                  {item.product_name}
                </Link>
                {item.sku && <p className="text-xs text-gray-400 mt-0.5">SKU: {item.sku}</p>}
                {!item.in_stock && <p className="text-xs text-red-600 mt-1 font-medium">Out of stock — remove to continue</p>}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1 border border-gray-200 rounded-lg">
                    <button
                      onClick={() => handleQtyChange(item.id, item.quantity - 1)}
                      disabled={!!updating || item.quantity <= 1}
                      className="p-1.5 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-3 text-sm font-semibold">{updating === item.id ? '…' : item.quantity}</span>
                    <button
                      onClick={() => handleQtyChange(item.id, item.quantity + 1)}
                      disabled={!!updating || item.quantity >= item.available_stock}
                      className="p-1.5 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(item.item_total)}</span>
                    <button onClick={() => handleRemove(item.id)} disabled={!!updating} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 sticky top-20">
            <h2 className="text-base font-bold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({cart.item_count} items)</span>
                <span>{formatCurrency(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Delivery fee</span>
                <span>Calculated at checkout</span>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 mb-5">
              <div className="flex justify-between font-bold text-gray-900">
                <span>Subtotal</span>
                <span>{formatCurrency(cart.subtotal)}</span>
              </div>
            </div>
            <Button
              fullWidth
              size="lg"
              disabled={hasIssues}
              onClick={() => navigate('/checkout')}
              leftIcon={<ArrowRight className="h-4 w-4" />}
            >
              Proceed to Checkout
            </Button>
            <Link to="/products" className="block text-center text-sm text-brand-600 hover:text-brand-700 mt-3">
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
