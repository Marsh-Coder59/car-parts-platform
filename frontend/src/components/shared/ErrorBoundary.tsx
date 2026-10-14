import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in whatever it wraps and shows a recoverable
 * message instead of leaving the user on a silent blank page — which is
 * what a React render crash with no error boundary looks like (e.g. the
 * Deliveries page reading a field that didn't exist on the API response).
 *
 * Placed around each layout's <Outlet /> rather than the whole app, so a
 * crash in one page's content doesn't also take down the nav/sidebar —
 * the person can still navigate away from the broken page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Caught by ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">Something went wrong on this page</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md">
            {this.state.error.message || 'An unexpected error occurred while loading this page.'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
