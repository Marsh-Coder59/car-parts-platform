import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import ErrorBoundary from '../shared/ErrorBoundary';

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-dark-900">
      <AdminSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <AdminHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">
          <div className="p-4 lg:p-8 max-w-[1400px]">
            {/* key={location.pathname} resets the boundary on navigation —
                otherwise, once a page crashed once, switching to a
                different page while the boundary's error state was still
                set would keep showing the error screen instead of the
                new page. Sidebar/header are outside the boundary, so the
                admin can always navigate away from a broken page. */}
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
