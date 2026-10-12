import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatDate } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../../services/api';

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
      ))}
    </div>
  );
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    adminService.getReviews().then(setReviews).catch(() => setReviews([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const deleteReview = async (id: number) => {
    if (!confirm('Delete this review?')) return;
    try {
      await adminService.deleteReview(id);
      toast.success('Review deleted');
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  if (loading) return <SkeletonTable rows={8} cols={5} />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Star className="h-6 w-6 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">Reviews</h1>
      </div>

      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" description="Customer product reviews will appear here." />
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-dark-700">
                <tr>
                  {['Product', 'Customer', 'Rating', 'Comment', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
                {reviews.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-50 max-w-[150px] truncate">{r.product_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.customer_name || '—'}</td>
                    <td className="px-4 py-3"><StarRating rating={r.rating} /></td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{r.comment || r.title || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => deleteReview(r.id)} className="text-xs text-red-500 hover:text-red-700 hover:underline font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
