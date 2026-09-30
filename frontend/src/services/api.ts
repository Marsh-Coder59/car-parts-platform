import axios from 'axios';

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Bearer token if one exists
apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('partora_token');

  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  return config;
});

// Handle authentication errors
apiClient.interceptors.response.use(
  (response) => response,

  (error) => {
    if (error.response?.status === 401) {
      const pathname = window.location.pathname;

      // Don't treat an unauthenticated /auth/me check
      // as an expired session.
      const isAuthCheck =
        error.config?.url?.includes('/auth/me');

      if (!isAuthCheck) {
        sessionStorage.removeItem('partora_token');

        // Only redirect protected pages
        const protectedRoutes = [
          '/dashboard',
          '/account',
          '/profile',
          '/checkout',
          '/orders',
          '/cart',
        ];

        const isProtectedRoute = protectedRoutes.some((route) =>
          pathname.startsWith(route)
        );

        if (
          isProtectedRoute &&
          !pathname.startsWith('/login') &&
          !pathname.startsWith('/register')
        ) {
          window.location.href = '/login?expired=1';
        }
      }
    }

    return Promise.reject(error);
  }
);

// Extract readable API error
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;

    if (typeof detail === 'string') {
      return detail;
    }

    if (detail?.errors && Array.isArray(detail.errors)) {
      return detail.errors.join(', ');
    }

    if (Array.isArray(detail)) {
      return detail
        .map((d: { msg?: string }) => d.msg || String(d))
        .join(', ');
    }

    return err.response?.data?.message || err.message;
  }

  return 'An unexpected error occurred';
}