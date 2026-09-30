import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationsService } from '../../services/user.service';
import { formatDateTime } from '../../utils/format';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonLines } from '../../components/ui/Skeleton';
import type { Notification } from '../../types';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => notificationsService.list().then(setNotifications).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const markRead = async (id: number) => {
    try {
      await notificationsService.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'READ' } : n));
    } catch { toast.error('Could not mark as read'); }
  };

  const markAll = async () => {
    try {
      await notificationsService.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, status: 'READ' as const })));
      toast.success('All marked as read');
    } catch { toast.error('Failed'); }
  };

  const unreadCount = notifications.filter(n => n.status === 'UNREAD').length;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notifications {unreadCount > 0 && <span className="ml-2 text-base font-medium text-brand-600">({unreadCount} unread)</span>}</h1>
        {unreadCount > 0 && (
          <button onClick={markAll} className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium">
            <CheckCheck className="h-4 w-4" />Mark all read
          </button>
        )}
      </div>
      {loading ? (
        <SkeletonLines lines={8} />
      ) : notifications.length === 0 ? (
        <EmptyState icon={<Bell className="h-8 w-8" />} title="No notifications" description="You'll see order updates and alerts here." />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div key={n.id}
              className={clsx('bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-sm', n.status === 'UNREAD' ? 'border-brand-200 bg-brand-50/30' : 'border-gray-100')}
              onClick={() => n.status === 'UNREAD' && markRead(n.id)}>
              <div className="flex items-start gap-3">
                {n.status === 'UNREAD' && <span className="w-2 h-2 mt-1.5 rounded-full bg-brand-500 flex-shrink-0" />}
                <div className="flex-1">
                  <p className={clsx('text-sm', n.status === 'UNREAD' ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(n.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
