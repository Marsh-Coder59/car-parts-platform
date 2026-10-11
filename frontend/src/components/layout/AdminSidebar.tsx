import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Tags, Award, Car, Boxes, ShoppingCart,
  ClipboardList, CreditCard, Truck, Star, Ticket, RotateCcw, RefreshCw,
  Users, UserCog, Settings, ScrollText, BarChart2, X, Menu, LogOut,
  ChevronDown, ChevronRight, Home
} from 'lucide-react';
import Logo from '../shared/Logo';
import { useAuth } from '../../context/AuthContext';
import { useLoading } from '../../context/LoadingContext';
import toast from 'react-hot-toast';

interface NavItem {
  to?: string;
  icon: React.ReactNode;
  label: string;
  children?: NavItem[];
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Dashboard' },
  {
    icon: <Package className="h-4 w-4" />, label: 'Catalog',
    children: [
      { to: '/admin/products', icon: <Package className="h-4 w-4" />, label: 'Products' },
      { to: '/admin/categories', icon: <Tags className="h-4 w-4" />, label: 'Categories' },
      { to: '/admin/brands', icon: <Award className="h-4 w-4" />, label: 'Brands' },
      { to: '/admin/vehicles', icon: <Car className="h-4 w-4" />, label: 'Vehicles' },
    ],
  },
  { to: '/admin/inventory', icon: <Boxes className="h-4 w-4" />, label: 'Inventory' },
  { to: '/admin/orders', icon: <ClipboardList className="h-4 w-4" />, label: 'Orders' },
  { to: '/admin/payments', icon: <CreditCard className="h-4 w-4" />, label: 'Payments' },
  { to: '/admin/deliveries', icon: <Truck className="h-4 w-4" />, label: 'Deliveries' },
  { to: '/admin/reviews', icon: <Star className="h-4 w-4" />, label: 'Reviews' },
  { to: '/admin/coupons', icon: <Ticket className="h-4 w-4" />, label: 'Coupons' },
  { to: '/admin/returns', icon: <RotateCcw className="h-4 w-4" />, label: 'Returns' },
  { to: '/admin/refunds', icon: <RefreshCw className="h-4 w-4" />, label: 'Refunds' },
  { to: '/admin/customers', icon: <Users className="h-4 w-4" />, label: 'Customers' },
  { to: '/admin/staff', icon: <UserCog className="h-4 w-4" />, label: 'Staff', adminOnly: true },
  { to: '/admin/reports', icon: <BarChart2 className="h-4 w-4" />, label: 'Reports' },
  { to: '/admin/audit-logs', icon: <ScrollText className="h-4 w-4" />, label: 'Audit Logs', adminOnly: true },
  { to: '/admin/settings', icon: <Settings className="h-4 w-4" />, label: 'Settings', adminOnly: true },
];

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isActive = item.to && location.pathname === item.to;
  const isParentActive = item.children?.some(c => c.to && location.pathname.startsWith(c.to));
  const { isAdmin } = useAuth();

  if (item.adminOnly && !isAdmin) return null;

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${isParentActive ? 'text-brand-600 bg-brand-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
        >
          {item.icon}
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-100 pl-3">
            {item.children.map(child => (
              <NavLink key={child.to} item={child} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      to={item.to!}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
        ${isActive ? 'text-brand-600 bg-brand-50 font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
    >
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

interface AdminSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function AdminSidebar({ mobileOpen, onMobileClose }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { logout, user } = useAuth();
  const { showLoading, hideLoading } = useLoading();

  const handleLogout = async () => {
    showLoading('Signing out…');
    try {
      await logout();
    } catch {
      toast.error('Logout failed');
    } finally {
      hideLoading();
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <Logo size="sm" variant={collapsed ? 'icon' : 'full'} />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Home — returns to the public storefront without signing out.
          A plain client-side Link: the session lives in an httpOnly cookie,
          so navigating to "/" never touches auth state or hits /login. */}
      <div className="p-3 pb-0">
        <Link
          to="/"
          onClick={onMobileClose}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-brand-600 hover:bg-brand-50 border border-gray-100 transition-colors"
        >
          <Home className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Back to Storefront</span>}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item, i) => (
          <NavLink key={i} item={item} collapsed={collapsed} onNavigate={onMobileClose} />
        ))}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-gray-100 p-3">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-semibold text-gray-900 truncate">{user.first_name} {user.last_name}</p>
            <p className="text-xs text-gray-500 truncate">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col bg-white border-r border-gray-100 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'} min-h-screen flex-shrink-0 sticky top-0`}>
        <SidebarContent />
      </aside>

      {/* Mobile drawer — opened via the menu button in AdminHeader */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
          <aside className="relative w-64 bg-white h-full shadow-2xl">
            <button
              onClick={onMobileClose}
              className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
