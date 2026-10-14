import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Heart, Bell, User, Search, Menu, X, LogOut, Home, Truck } from 'lucide-react';
import Logo from '../shared/Logo';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import ThemeToggle from '../shared/ThemeToggle';
import toast from 'react-hot-toast';

export default function PublicNav() {
  const { isAuthenticated, user, isStaffOrAdmin, logout } = useAuth();
  const { cartCount } = useCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchTerm.trim())}`);
      setSearchTerm('');
    }
  };

  const handleLogout = async () => {
    try { await logout(); toast.success('Signed out successfully'); navigate('/login'); }
    catch { toast.error('Failed to sign out'); }
  };

  const navLinks = [
    { to: '/', label: 'Home', icon: <Home className="h-4 w-4" /> },
    { to: '/products', label: 'Products' },
    { to: '/categories', label: 'Categories' },
    { to: '/brands', label: 'Brands' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-dark-800 border-b border-gray-100 dark:border-dark-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-4 h-16">
          <Link to="/" className="flex-shrink-0"><Logo size="sm" /></Link>

          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search parts, SKU, part number…"
                className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-dark-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50 dark:bg-dark-900 hover:bg-white transition-colors" />
            </div>
          </form>

          <nav className="hidden md:flex items-center gap-1 ml-auto">
            {navLinks.map(({ to, label }) => (
              <Link key={to} to={to} className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg transition-colors">{label}</Link>
            ))}

            <ThemeToggle />
            {isAuthenticated ? (
              <>
                {isStaffOrAdmin && (
                  <Link to="/admin" className="px-3 py-2 text-sm font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors">Admin</Link>
                )}
                <Link to="/tracking" title="Track Order" className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg transition-colors"><Truck className="h-5 w-5" /></Link>
                <Link to="/wishlist" className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg transition-colors"><Heart className="h-5 w-5" /></Link>
                <Link to="/cart" className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg transition-colors">
                  <ShoppingCart className="h-5 w-5" />
                  {cartCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-brand-500 text-white rounded-full">
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  )}
                </Link>
                <Link to="/notifications" className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg transition-colors"><Bell className="h-5 w-5" /></Link>
                <Link to="/account" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg transition-colors">
                  <User className="h-4 w-4" />{user?.first_name}
                </Link>
                <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                  <LogOut className="h-4 w-4" />Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg transition-colors">Sign In</Link>
                <Link to="/register" className="px-4 py-2 text-sm font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors">Sign Up</Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2 ml-auto md:hidden">
            <ThemeToggle />
            {isAuthenticated && (
              <Link to="/cart" className="relative p-2 text-gray-600 dark:text-gray-300">
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-brand-500 text-white rounded-full">{cartCount}</span>}
              </Link>
            )}
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 text-gray-600 dark:text-gray-300">
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="md:hidden pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search parts…"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-dark-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50 dark:bg-dark-900" />
          </div>
        </form>

        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-dark-700 py-3 space-y-1">
            {navLinks.map(({ to, label }) => (
              <Link key={to} to={to} onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg">{label}</Link>
            ))}
            {isAuthenticated ? (
              <>
                {isStaffOrAdmin && <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg">Admin Panel</Link>}
                <Link to="/account" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg">My Account</Link>
                <Link to="/orders" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg">My Orders</Link>
                <Link to="/tracking" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg">Track Order</Link>
                <Link to="/wishlist" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg">Wishlist</Link>
                <button onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                  <LogOut className="h-4 w-4" />Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 rounded-lg">Sign In</Link>
                <Link to="/register" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg">Sign Up</Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
