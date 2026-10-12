import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, User, Phone, CheckCircle2, XCircle, Loader2, MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { authService } from '../../services/auth.service';
import { useLoading } from '../../context/LoadingContext';
import { getErrorMessage } from '../../services/api';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Logo from '../../components/shared/Logo';
import PasswordStrengthMeter from '../../components/shared/PasswordStrengthMeter';
import { evaluatePasswordStrength } from '../../utils/password';
import toast from 'react-hot-toast';

interface FormValues {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  confirm_password: string;
}

const RESEND_COOLDOWN_SECONDS = 30;

export default function RegisterPage() {
  const { showLoading, hideLoading } = useLoading();
  const [error, setError] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const { register, handleSubmit, watch, getValues, formState: { errors } } = useForm<FormValues>();
  const password = watch('password');
  const firstName = watch('first_name');
  const lastName = watch('last_name');
  const emailValue = watch('email');

  // ---- Live email availability check -------------------------------------
  // "Convenience only" per the spec: the backend's own 409 on submit (plus
  // the DB unique constraint) is the actual authority. This just saves the
  // user a round trip and shows a friendly message before they hit Submit.
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'unknown'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const value = (emailValue || '').trim();
    const looksValid = /\S+@\S+\.\S+/.test(value);
    if (!looksValid) {
      setEmailStatus('idle');
      return;
    }
    setEmailStatus('checking');
    const mySeq = ++checkSeq.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await authService.checkEmail(value);
        if (mySeq !== checkSeq.current) return; // a newer keystroke superseded this check
        if (res.available === null) setEmailStatus('unknown');
        else setEmailStatus(res.available ? 'available' : 'taken');
      } catch {
        if (mySeq === checkSeq.current) setEmailStatus('unknown');
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [emailValue]);

  // ---- Resend verification email (post-registration) ----------------------
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    try {
      await authService.resendVerification(registeredEmail);
      toast.success('Verification email sent — check your inbox.');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    setError('');
    if (emailStatus === 'taken') {
      setError('This email is already registered. Please log in or reset your password.');
      return;
    }
    showLoading('Creating account…');
    try {
      await authService.register({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || undefined,
        password: data.password,
      });
      setRegisteredEmail(data.email.trim().toLowerCase());
      setResendCooldown(RESEND_COOLDOWN_SECONDS); // registration itself just sent one
      toast.success('Account created!');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      hideLoading();
    }
  };

  if (registeredEmail) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-6"><Logo size="lg" /></div>
          <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-gray-100 dark:border-dark-700 p-10">
            <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-8 h-8 text-brand-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-2">Check your email</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              We've sent a verification link to
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-6">{registeredEmail}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
              Click the link in that email to activate your account, then sign in. The link expires in 24 hours.
            </p>

            <Button
              variant="outline"
              fullWidth
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending}
              loading={resending}
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend verification email'}
            </Button>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
              Already verified?{' '}
              <Link to="/login" className="text-brand-600 hover:text-brand-700 font-semibold">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Create your account</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Join Partora and start shopping</p>
        </div>

        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-gray-100 dark:border-dark-700 p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm text-red-700">
              {error}{' '}
              {error.toLowerCase().includes('already registered') && (
                <Link to="/login" className="font-semibold underline">Go to login</Link>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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

            <div>
              <Input
                label="Email address"
                type="email"
                leftIcon={<Mail className="h-4 w-4" />}
                error={errors.email?.message}
                autoComplete="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email address' },
                })}
              />
              {!errors.email && emailStatus !== 'idle' && (
                <p
                  className={`mt-1.5 text-xs flex items-center gap-1.5 ${
                    emailStatus === 'taken'
                      ? 'text-red-600'
                      : emailStatus === 'available'
                      ? 'text-green-600'
                      : 'text-gray-400'
                  }`}
                  aria-live="polite"
                >
                  {emailStatus === 'checking' && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking availability…
                    </>
                  )}
                  {emailStatus === 'available' && (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Email is available
                    </>
                  )}
                  {emailStatus === 'taken' && (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      This email is already registered.{' '}
                      <Link to="/login" className="underline font-medium">Log in</Link> or{' '}
                      <Link to="/forgot-password" className="underline font-medium">reset your password</Link>.
                    </>
                  )}
                  {emailStatus === 'unknown' && "We'll check this when you submit."}
                </p>
              )}
            </div>

            <Input
              label="Phone (optional)"
              type="tel"
              leftIcon={<Phone className="h-4 w-4" />}
              autoComplete="tel"
              {...register('phone')}
            />

            <div>
              <Input
                label="Password"
                type="password"
                leftIcon={<Lock className="h-4 w-4" />}
                error={errors.password?.message}
                autoComplete="new-password"
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'At least 8 characters' },
                  validate: v => {
                    const result = evaluatePasswordStrength(v, [firstName, lastName, getValues('email')]);
                    const commonReq = result.requirements.find(r => r.id === 'common');
                    const personalReq = result.requirements.find(r => r.id === 'personal');
                    if (commonReq && !commonReq.met) return 'This password is too common or predictable — choose something more unique';
                    if (personalReq && !personalReq.met) return "Password shouldn't contain your name or email";
                    return true;
                  },
                })}
              />
              <PasswordStrengthMeter password={password || ''} personalInfo={[firstName, lastName, getValues('email')]} />
            </div>

            <Input
              label="Confirm password"
              type="password"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.confirm_password?.message}
              autoComplete="new-password"
              {...register('confirm_password', {
                required: 'Please confirm password',
                validate: v => v === password || 'Passwords do not match',
              })}
            />

            <Button type="submit" fullWidth size="lg" disabled={emailStatus === 'checking'}>
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 hover:text-brand-700 font-semibold">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
