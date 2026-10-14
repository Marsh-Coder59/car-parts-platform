import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LoadingProvider } from './context/LoadingContext';
import { CartProvider } from './context/CartContext';
import GlobalLoadingOverlay from './components/ui/GlobalLoadingOverlay';
import { ProtectedRoute, AdminRoute, CustomerRoute } from './routes/ProtectedRoute';

// Layouts
import PublicLayout from './components/layout/PublicLayout';
import AdminLayout from './components/layout/AdminLayout';

// Public pages
import HomePage from './pages/public/HomePage';
import ProductsPage from './pages/public/ProductsPage';
import ProductDetailPage from './pages/public/ProductDetailPage';
import CategoriesPage from './pages/public/CategoriesPage';
import BrandsPage from './pages/public/BrandsPage';
import LoginPage from './pages/public/LoginPage';
import RegisterPage from './pages/public/RegisterPage';
import ForgotPasswordPage from './pages/public/ForgotPasswordPage';
import ResetPasswordPage from './pages/public/ResetPasswordPage';
import VerifyEmailPage from './pages/public/VerifyEmailPage';

// Customer pages
import CartPage from './pages/customer/CartPage';
import CheckoutPage from './pages/customer/CheckoutPage';
import OrderConfirmationPage from './pages/customer/OrderConfirmationPage';
import OrdersPage from './pages/customer/OrdersPage';
import OrderDetailPage from './pages/customer/OrderDetailPage';
import TrackingPage from './pages/customer/TrackingPage';
import AccountPage from './pages/customer/AccountPage';
import WishlistPage from './pages/customer/WishlistPage';
import NotificationsPage from './pages/customer/NotificationsPage';

// Admin pages
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminOrderDetailPage from './pages/admin/AdminOrderDetailPage';
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage';
import AdminProductsPage from './pages/admin/AdminProductsPage';
import AdminInventoryPage from './pages/admin/AdminInventoryPage';
import AdminCustomersPage from './pages/admin/AdminCustomersPage';
import AdminStaffPage from './pages/admin/AdminStaffPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage';
import AdminCouponsPage from './pages/admin/AdminCouponsPage';
import AdminReturnsPage from './pages/admin/AdminReturnsPage';
import AdminRefundsPage from './pages/admin/AdminRefundsPage';
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage';
import AdminBrandsPage from './pages/admin/AdminBrandsPage';
import AdminVehiclesPage from './pages/admin/AdminVehiclesPage';
import AdminDeliveriesPage from './pages/admin/AdminDeliveriesPage';
import AdminReviewsPage from './pages/admin/AdminReviewsPage';

export default function App() {
  return (
    <BrowserRouter>
      <LoadingProvider>
        <AuthProvider>
          <ThemeProvider>
          <CartProvider>
            <GlobalLoadingOverlay />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: { fontSize: '14px', maxWidth: '380px' },
                success: { iconTheme: { primary: '#f97316', secondary: '#fff' } },
              }}
            />
            <Routes>
              {/* Public routes under PublicLayout */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/products/:id" element={<ProductDetailPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/brands" element={<BrandsPage />} />

                {/* Auth */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />

                {/* Customer protected */}
                <Route path="/cart" element={<CustomerRoute><CartPage /></CustomerRoute>} />
                <Route path="/checkout" element={<CustomerRoute><CheckoutPage /></CustomerRoute>} />
                <Route path="/orders/:id/confirmation" element={<CustomerRoute><OrderConfirmationPage /></CustomerRoute>} />
                <Route path="/orders" element={<CustomerRoute><OrdersPage /></CustomerRoute>} />
                <Route path="/orders/:id" element={<CustomerRoute><OrderDetailPage /></CustomerRoute>} />
                <Route path="/tracking" element={<CustomerRoute><TrackingPage /></CustomerRoute>} />
                <Route path="/account" element={<CustomerRoute><AccountPage /></CustomerRoute>} />
                <Route path="/account/addresses" element={<CustomerRoute><AccountPage /></CustomerRoute>} />
                <Route path="/wishlist" element={<CustomerRoute><WishlistPage /></CustomerRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
              </Route>

              {/* Admin routes under AdminLayout */}
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="orders" element={<AdminOrdersPage />} />
                <Route path="orders/:id" element={<AdminOrderDetailPage />} />
                <Route path="payments" element={<AdminPaymentsPage />} />
                <Route path="products" element={<AdminProductsPage />} />
                <Route path="categories" element={<AdminCategoriesPage />} />
                <Route path="brands" element={<AdminBrandsPage />} />
                <Route path="vehicles" element={<AdminVehiclesPage />} />
                <Route path="inventory" element={<AdminInventoryPage />} />
                <Route path="customers" element={<AdminCustomersPage />} />
                <Route path="staff" element={<AdminStaffPage />} />
                <Route path="coupons" element={<AdminCouponsPage />} />
                <Route path="returns" element={<AdminReturnsPage />} />
                <Route path="refunds" element={<AdminRefundsPage />} />
                <Route path="deliveries" element={<AdminDeliveriesPage />} />
                <Route path="reviews" element={<AdminReviewsPage />} />
                <Route path="reports" element={<AdminReportsPage />} />
                <Route path="audit-logs" element={<AdminAuditLogsPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CartProvider>
          </ThemeProvider>
        </AuthProvider>
      </LoadingProvider>
    </BrowserRouter>
  );
}
