import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { MapPin, Tag, CheckCircle } from 'lucide-react';
import { cartService } from '../../services/cart.service';
import { ordersService } from '../../services/orders.service';
import { addressService } from '../../services/user.service';
import { useCart } from '../../context/CartContext';
import { useLoading } from '../../context/LoadingContext';
import { formatCurrency } from '../../utils/format';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import type { Address } from '../../types';
import { getErrorMessage } from '../../services/api';
import toast from 'react-hot-toast';

interface FormValues {
  shipping_address_id: string;
  coupon_code: string;
  notes: string;
}

export default function CheckoutPage() {
  const { cart, refresh } = useCart();
  const { showLoading, hideLoading } = useLoading();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [couponValid, setCouponValid] = useState<null | { code: string; discount_type: string; discount_value: number }>(null);
  const [couponError, setCouponError] = useState('');
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>();
  const couponCode = watch('coupon_code');

  useEffect(() => {
    addressService.list().then(setAddresses);
  }, []);

  const handleValidateCoupon = async () => {
    if (!couponCode?.trim()) return;
    setCouponError('');
    try {
      const res = await cartService.validateCoupon(couponCode.trim());
      setCouponValid(res);
      toast.success(`Coupon "${res.code}" applied!`);
    } catch (err) {
      setCouponError(getErrorMessage(err));
      setCouponValid(null);
    }
  };

  const onSubmit = async (data: FormValues) => {
    setError('');
    if (!data.shipping_address_id) { setError('Please select a delivery address.'); return; }

    // Validate checkout first
    showLoading('Validating order…');
    try {
      await cartService.validateCheckout({
        shipping_address_id: parseInt(data.shipping_address_id),
        coupon_code: couponValid?.code,
      });
    } catch (err) {
      hideLoading();
      setError(getErrorMessage(err));
      return;
    }

    // Place order
    showLoading('Placing order…');
    try {
      const res = await ordersService.place({
        shipping_address_id: parseInt(data.shipping_address_id),
        coupon_code: couponValid?.code,
        notes: data.notes || undefined,
      });
      await refresh();
      // The confirmation page always fetches its own data from
      // /api/orders/{id}/bank-details rather than reusing this response
      // (place_order() returns a differently-shaped payload — see
      // OrderConfirmationPage.tsx for why), so no navigation state is
      // needed here.
      navigate(`/orders/${res.order_id}/confirmation`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      hideLoading();
    }
  };

  if (!cart || cart.items.length === 0) {
    navigate('/cart');
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-6">Checkout</h1>

      {error && (
        <div className="mb-5 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Address */}
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-brand-500" /> Delivery Address
              </h2>
              {addresses.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <p>No addresses saved. <Link to="/account/addresses" className="text-brand-600 hover:underline">Add one first</Link>.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {addresses.map(addr => (
                    <label key={addr.id}
                      className="flex items-start gap-3 p-3 border border-gray-200 dark:border-dark-600 rounded-lg cursor-pointer hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 transition-colors">
                      <input type="radio" value={addr.id} {...register('shipping_address_id', { required: 'Select an address' })}
                        className="mt-1 text-brand-500 focus:ring-brand-400" />
                      <div className="text-sm">
                        <p className="font-semibold text-gray-900 dark:text-gray-50">{addr.full_name} {addr.is_default && <span className="text-xs font-normal text-brand-600">(Default)</span>}</p>
                        <p className="text-gray-500 dark:text-gray-400">{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}</p>
                        <p className="text-gray-500 dark:text-gray-400">{addr.city}{addr.county ? `, ${addr.county}` : ''}</p>
                        {addr.phone && <p className="text-gray-500 dark:text-gray-400">{addr.phone}</p>}
                      </div>
                    </label>
                  ))}
                  {errors.shipping_address_id && (
                    <p className="text-xs text-red-600">{errors.shipping_address_id.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Coupon */}
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">
                <Tag className="h-4 w-4 text-brand-500" /> Coupon Code
              </h2>
              <div className="flex gap-2">
                <Input placeholder="Enter coupon code" {...register('coupon_code')} error={couponError} />
                <Button type="button" variant="outline" onClick={handleValidateCoupon}>Apply</Button>
              </div>
              {couponValid && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  {couponValid.discount_type === 'PERCENTAGE'
                    ? `${couponValid.discount_value}% off applied`
                    : `USD ${couponValid.discount_value} off applied`}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-4">Order Notes (optional)</h2>
              <textarea
                {...register('notes')}
                rows={3}
                placeholder="Any special instructions for your order…"
                className="w-full border border-gray-200 dark:border-dark-600 rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>

          {/* Order summary */}
          <div>
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-5 sticky top-20">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-4">Order Summary</h2>
              <div className="space-y-2 mb-4">
                {cart.items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300 truncate max-w-[160px]">{item.product_name} × {item.quantity}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-50">{formatCurrency(item.item_total)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-dark-700 pt-3 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cart.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-400 dark:text-gray-500 text-xs">
                  <span>Delivery fee</span>
                  <span>Added by server</span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg border border-brand-100 text-xs text-brand-800">
                <p className="font-semibold mb-1">💳 Payment Method: Bank Transfer</p>
                <p>After placing your order, you'll receive bank details and a 75% deposit is required to confirm.</p>
              </div>

              <Button type="submit" fullWidth size="lg" className="mt-4">
                Place Order
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
