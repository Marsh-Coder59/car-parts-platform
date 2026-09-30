import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { authService } from '../../services/auth.service';
import { useLoading } from '../../context/LoadingContext';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Logo from '../../components/shared/Logo';

export default function ForgotPasswordPage() {
  const { showLoading, hideLoading } = useLoading();
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<{ email: string }>();

  const onSubmit = async ({ email }: { email: string }) => {
    showLoading();
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } finally {
      hideLoading();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size="lg" /></div>
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your email and we'll send a reset link</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✉</div>
              <p className="text-sm text-gray-700 font-medium">If that email is registered, a reset link has been sent.</p>
              <p className="text-xs text-gray-500 mt-1">Check your inbox (and spam folder).</p>
              <Link to="/login" className="mt-4 inline-block text-sm text-brand-600 hover:underline">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Email address"
                type="email"
                leftIcon={<Mail className="h-4 w-4" />}
                error={errors.email?.message}
                {...register('email', { required: 'Email is required' })}
              />
              <Button type="submit" fullWidth size="lg">Send Reset Link</Button>
              <p className="text-center text-sm text-gray-500">
                <Link to="/login" className="text-brand-600 hover:underline">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
