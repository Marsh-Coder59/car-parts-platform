import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { getErrorMessage } from '../../services/api';
import Logo from '../../components/shared/Logo';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No verification token found.'); return; }
    authService.verifyEmail(token)
      .then(res => { setStatus('success'); setMessage(res.message || 'Email verified successfully!'); })
      .catch(err => { setStatus('error'); setMessage(getErrorMessage(err)); });
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6"><Logo size="lg" /></div>
        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-gray-100 dark:border-dark-700 p-10">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 dark:text-gray-300">Verifying your email…</p>
            </div>
          )}
          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-2">Email Verified</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{message}</p>
              <Link to="/login" className="inline-flex items-center px-6 py-2.5 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 transition-colors">
                Sign In
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✕</div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-2">Verification Failed</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{message}</p>
              <Link to="/login" className="text-sm text-brand-600 hover:underline">Go to Sign In</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
