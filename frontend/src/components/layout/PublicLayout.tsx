import { Outlet, useLocation } from 'react-router-dom';
import PublicNav from './PublicNav';
import { Link } from 'react-router-dom';
import Logo from '../shared/Logo';
import ErrorBoundary from '../shared/ErrorBoundary';

export default function PublicLayout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
      <PublicNav />
      <main className="flex-1">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="bg-gray-900 text-gray-300 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <Logo size="sm" />
              <p className="mt-3 text-sm text-gray-400 dark:text-gray-500 leading-relaxed">
                Your trusted automotive parts marketplace. Quality parts, competitive prices.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Shop</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/products" className="hover:text-white transition-colors">All Products</Link></li>
                <li><Link to="/categories" className="hover:text-white transition-colors">Categories</Link></li>
                <li><Link to="/brands" className="hover:text-white transition-colors">Brands</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Account</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/account" className="hover:text-white transition-colors">My Account</Link></li>
                <li><Link to="/orders" className="hover:text-white transition-colors">My Orders</Link></li>
                <li><Link to="/wishlist" className="hover:text-white transition-colors">Wishlist</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/login" className="hover:text-white transition-colors">Sign In</Link></li>
                <li><Link to="/register" className="hover:text-white transition-colors">Register</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-10 pt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
            © {new Date().getFullYear()} Partora. Automotive Parts Marketplace.
          </div>
        </div>
      </footer>
    </div>
  );
}
