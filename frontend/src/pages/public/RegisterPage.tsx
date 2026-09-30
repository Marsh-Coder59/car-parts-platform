import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { authService } from '../../services/auth.service';
import { useLoading } from '../../context/LoadingContext';
import { getErrorMessage } from '../../services/api';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Logo from '../../components/shared/Logo';
import toast from 'react-hot-toast';

interface FormValues {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  confirm_password: string;
}

export default function RegisterPage() {
  const { showLoading, hideLoading } = useLoading();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>();
  const password = watch('password');

  const onSubmit = async (data: FormValues) => {
    setError('');
    showLoading('Creating account…');
    try {
      await authService.register({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || undefined,
        password: data.password,
      });
      setSuccess(true);
      toast.success('Account created successfully!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      hideLoading();
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Account Created!</h2>
          <p className="text-sm text-gray-500 mt-2">Redirecting you to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-500 mt-1">Join Partora and start shopping</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First name"
                leftIcon={<User className="h-4 w-4" />}
                error={errors.first_name?.message}
                {...register('first_name', { required: 'Required' })}
              />
              <Input
                label="Last name"
                error={errors.last_name?.message}
                {...register('last_name', { required: 'Required' })}
              />
            </div>
            <Input
              label="Email address"
              type="email"
              leftIcon={<Mail className="h-4 w-4" />}
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
              })}
            />
            <Input
              label="Phone (optional)"
              type="tel"
              leftIcon={<Phone className="h-4 w-4" />}
              {...register('phone')}
            />
            <Input
              label="Password"
              type="password"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              hint="At least 8 characters"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'At least 8 characters' },
              })}
            />
            <Input
              label="Confirm password"
              type="password"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.confirm_password?.message}
              {...register('confirm_password', {
                required: 'Please confirm password',
                validate: v => v === password || 'Passwords do not match',
              })}
            />
            <Button type="submit" fullWidth size="lg">
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 hover:text-brand-700 font-semibold">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
