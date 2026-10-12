import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { CheckCircle, Copy, Building2 } from 'lucide-react';
import { ordersService } from '../../services/orders.service';
import { formatCurrency } from '../../utils/format';
import type { BankDetails } from '../../types';
import toast from 'react-hot-toast';

export default function OrderConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(
    location.state?.orderData || null
  );
  const [loading, setLoading] = useState(!location.state?.orderData);

  useEffect(() => {
    if (!id || bankDetails) return;
    ordersService.getBankDetails(parseInt(id))
      .then(setBankDetails)
      .finally(() => setLoading(false));
  }, [id, bankDetails]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  );

  if (!bankDetails) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-gray-400">
      Order details not found. <Link to="/orders" className="text-brand-600 hover:underline">View my orders</Link>
    </div>
  );

  const depositRequired = bankDetails.deposit_amount ?? (bankDetails.total_amount * 0.75);
  const hasBankDetails = bankDetails.bank?.bank_name || bankDetails.bank?.account_number;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Success header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="h-9 w-9 text-green-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">Order Placed!</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Order reference: <span className="font-semibold text-gray-900 dark:text-gray-50">{bankDetails.order_number}</span></p>
      </div>

      {/* Amount summary */}
      <div className="bg-white dark:bg-dark-800 rounded-2xl border border-gray-100 dark:border-dark-700 p-6 mb-5">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-4">Payment Summary</h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Order Total</span>
            <span className="font-semibold text-gray-900 dark:text-gray-50">{formatCurrency(bankDetails.total_amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Deposit Required (75%)</span>
            <span className="font-bold text-brand-600 text-base">{formatCurrency(bankDetails.deposit_amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Balance Due After Delivery (25%)</span>
            <span className="font-semibold text-gray-900 dark:text-gray-50">{formatCurrency(bankDetails.balance_amount)}</span>
          </div>
        </div>
      </div>

      {/* Bank details */}
      <div className="bg-white dark:bg-dark-800 rounded-2xl border border-brand-100 p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-brand-500" />
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Bank Transfer Details</h2>
        </div>

        {!hasBankDetails ? (
          <div className="p-4 bg-amber-50 rounded-lg text-sm text-amber-800">
            Bank details have not been configured yet. Please contact support for payment instructions.
          </div>
        ) : (
          <div className="space-y-3">
            {[
              { label: 'Bank Name', value: bankDetails.bank?.bank_name },
              { label: 'Account Name', value: bankDetails.bank?.account_name },
              { label: 'Account Number', value: bankDetails.bank?.account_number },
              { label: 'Branch', value: bankDetails.bank?.branch },
              { label: 'Reference', value: bankDetails.reference },
            ].filter(r => r.value).map(row => (
              <div key={row.label} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-900 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{row.label}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{row.value}</p>
                </div>
                <button onClick={() => copy(row.value!)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-brand-500 transition-colors">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 rounded-xl border border-blue-100 p-5 mb-6 text-sm text-blue-900">
        <p className="font-semibold mb-2">Next Steps:</p>
        <ol className="list-decimal pl-4 space-y-1.5">
          <li>Transfer <strong>{formatCurrency(bankDetails.deposit_amount)}</strong> to the account above.</li>
          <li>Use your order number <strong>{bankDetails.order_number}</strong> as the payment reference.</li>
          <li>Come back to this order and submit your payment reference number.</li>
          <li>Our team will verify and confirm your order.</li>
          <li>The remaining balance is due after delivery.</li>
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link to={`/orders/${id}`} className="flex-1 text-center px-5 py-2.5 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 transition-colors">
          Submit Payment Reference
        </Link>
        <Link to="/orders" className="flex-1 text-center px-5 py-2.5 border border-gray-200 dark:border-dark-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
          View My Orders
        </Link>
      </div>
    </div>
  );
}
