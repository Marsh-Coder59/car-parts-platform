import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell, ChevronRight, LogOut, Settings, User, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notificationsService } from '../../services/user.service';
import { formatDate } from '../../utils/format';
import type { Notification } from '../../types';
import toast from 'react-hot-toast';
import ThemeToggle from '../shared/ThemeToggle';

// Maps a URL segment to a human label and, where useful, a distinct page
// title from the breadcrumb label (e.g. the segment "orders" under
// "/admin/orders/:id" should read "Order Detail" as the title but still
// show "Orders" in the breadcrumb trail).
const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Admin',
  products: 'Products',
  categories: 'Categories',
  brands: 'Brands',
  vehicles: 'Vehicles',
  inventory: 'Inventory',
  orders: 'Orders',
  payments: 'Payments',
  deliveries: 'Deliveries',
  reviews: 'Reviews',
  coupons: 'Coupons',
  returns: 'Returns',
  refunds: 'Refunds',
  customers: 'Customers',
  staff: 'Staff',
  reports: 'Reports',
  'audit-logs': 'Audit Logs',
  settings: 'Settings',
  new: 'New',
};

const CATALOG_SECTIONS = new Set(['products', 'categories', 'brands', 'vehicles']);

function useBreadcrumb() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean); // e.g. ['admin','orders','42']

  if (parts.length <= 1) {
    return { title: 'Dashboard', crumbs: [{ label: 'Dashboard', to: '/admin' }] };
  }

  const crumbs: { label: string; to?: string }[] = [{ label: 'Dashboard', to: '/admin' }];
  const section = parts[1]; // e.g. 'orders'

  if (CATALOG_SECTIONS.has(section)) {
    crumbs.push({ label: 'Catalog' });
  }

  const sectionLabel = SEGMENT_LABELS[section] || section;
  const hasDetailSegment = parts.length > 2;
  crumbs.push({ label: sectionLabel, to: hasDetailSegment ? `/${parts[0]}/${section}` : undefined });

  let title = sectionLabel;
  if (hasDetailSegment) {
    const last = parts[parts.length - 1];
    const detailLabel = SEGMENT_LABELS[last] || `#${last}`;
    crumbs.push({ label: detailLabel });
    title = `${sectionLabel.replace(/s$/, '')} ${last === 'new' ? 'New' : `#${last}`}`;
  }

  return { title, crumbs };
}

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open && !loaded) {
      notificationsService.list().then(setItems).catch(() => setItems([])).finally(() => setLoaded(true));
    }
  }, [open, loaded]);

  const unreadCount = items.filter(n => n.status === 'UNREAD').length;

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllRead();
      setItems(prev => prev.map(n => ({ ...n, status: 'READ' as const })));
    } catch {
      toast.error('Could not mark notifications as read');
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-dark-600 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-500" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-dark-700">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-brand-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!loaded ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">No notifications</div>
            ) : (
              items.slice(0, 20).map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-gray-50 dark:border-dark-700 last:border-0 ${n.status === 'UNREAD' ? 'bg-brand-50/40' : ''}`}
                >
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-50">{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{formatDate(n.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Logout failed');
    }
  };

  const initials = user ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() : '';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-600 transition-colors"
      >
        <div className="h-8 w-8 rounded-full bg-dark-800 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initials || <User className="h-4 w-4" />}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 leading-tight">{user?.first_name} {user?.last_name}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{user?.role}</p>
        </div>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{user?.first_name} {user?.last_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
          </div>
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700"
          >
            <ExternalLink className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            View storefront
          </Link>
          {user?.role === 'ADMIN' && (
            <Link
              to="/admin/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700"
            >
              <Settings className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              Settings
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 border-t border-gray-100 dark:border-dark-700"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { title, crumbs } = useBreadcrumb();

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-dark-800 border-b border-gray-100 dark:border-dark-700">
      <div className="flex items-center justify-between gap-4 px-4 lg:px-8 h-16">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-600"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <nav className="hidden sm:flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-0.5" aria-label="Breadcrumb">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  {c.to ? (
                    <Link to={c.to} className="hover:text-gray-600">{c.label}</Link>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50 truncate">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <ThemeToggle />
          <NotificationsMenu />
          <div className="w-px h-6 bg-gray-200 dark:bg-dark-600" />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
