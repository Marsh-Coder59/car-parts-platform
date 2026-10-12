
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../context/AuthContext';
import { useLoading } from '../../context/LoadingContext';
import { getErrorMessage } from '../../services/api';
import { authService } from '../../services/auth.service';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Logo from '../../components/shared/Logo';
import toast from 'react-hot-toast';

interface FormValues {
  email: string;
  password: string;
}

const RESEND_COOLDOWN_SECONDS = 30;

export default function LoginPage() {
  const { login } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const sessionExpired = searchParams.get('expired') === '1';
  const redirect = searchParams.get('redirect') || '/';
  const expired = searchParams.get('expired');
  const passwordReset = searchParams.get('reset') === '1';

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>();

  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const onSubmit = async (data: FormValues) => {
    setError('');
    setNeedsVerification(false);
    showLoading('Signing in…');

    try {
      await login(data.email, data.password);
      navigate(redirect, { replace: true });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      // The backend only returns this exact copy for the unverified-email
      // case (see /api/auth/login) — match on it to offer a resend action
      // rather than parsing a machine code out of a human-readable string.
      if (message.toLowerCase().includes('verify your email')) {
        setNeedsVerification(true);
      }
    } finally {
      hideLoading();
    }
  };

  const handleResend = async () => {
    const email = getValues('email');
    if (!email || resendCooldown > 0 || resending) return;
    setResending(true);
    try {
      await authService.resendVerification(email);
      toast.success('Verification email sent — check your inbox.');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Welcome back
          </h1>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign in to your Partora account
          </p>
        </div>

        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-gray-100 dark:border-dark-700 p-8">
          {expired && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              Your session has expired. Please sign in again.
            </div>
          )}

          {passwordReset && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg text-sm text-green-700">
              Your password was reset successfully. Please sign in with your new password.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
              {needsVerification && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || resending}
                    className="font-semibold underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resendCooldown > 0 ? `Resend verification email in ${resendCooldown}s` : resending ? 'Sending…' : 'Resend verification email'}
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {sessionExpired && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                ⚠️ Your session expired. Please sign in again — your cart items
                are still saved.
              </div>
            )}

            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              leftIcon={<Mail className="h-4 w-4" />}
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /\S+@\S+\.\S+/,
                  message: 'Invalid email',
                },
              })}
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required',
              })}
            />

            <div className="flex items-center justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" fullWidth size="lg">
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-brand-600 hover:text-brand-700 font-semibold"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

