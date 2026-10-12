import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { authService } from '../../services/auth.service';
import { useLoading } from '../../context/LoadingContext';
import { getErrorMessage } from '../../services/api';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Logo from '../../components/shared/Logo';
import PasswordStrengthMeter from '../../components/shared/PasswordStrengthMeter';
import { evaluatePasswordStrength } from '../../utils/password';

interface FormValues { new_password: string; confirm: string; }

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { showLoading, hideLoading } = useLoading();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>();
  const pwd = watch('new_password');

  const onSubmit = async ({ new_password }: FormValues) => {
    setError('');
    if (!token) { setError('Invalid or missing reset token.'); return; }
    showLoading();
    try {
      await authService.resetPassword(token, new_password);
      // A toast here would be lost mid-navigation, so the success message
      // is carried via the ?reset=1 query param and rendered on the login
      // page itself.
      navigate('/login?reset=1');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      hideLoading();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size="lg" /></div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Set new password</h1>
        </div>
        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-gray-100 dark:border-dark-700 p-8">
          {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          {!token ? (
            <p className="text-sm text-red-600">Invalid reset link. <Link to="/forgot-password" className="underline">Request a new one</Link>.</p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div>
                <Input label="New password" type="password" leftIcon={<Lock className="h-4 w-4" />}
                  autoComplete="new-password"
                  error={errors.new_password?.message}
                  {...register('new_password', {
                    required: 'Required',
                    minLength: { value: 8, message: 'At least 8 characters' },
                    validate: v => {
                      const result = evaluatePasswordStrength(v);
                      const commonReq = result.requirements.find(r => r.id === 'common');
                      if (commonReq && !commonReq.met) return 'This password is too common or predictable — choose something more unique';
                      return true;
                    },
                  })}
                />
                <PasswordStrengthMeter password={pwd || ''} />
              </div>
              <Input label="Confirm password" type="password" leftIcon={<Lock className="h-4 w-4" />}
                autoComplete="new-password"
                error={errors.confirm?.message}
                {...register('confirm', { required: 'Required', validate: v => v === pwd || 'Passwords do not match' })}
              />
              <Button type="submit" fullWidth size="lg">Reset Password</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
