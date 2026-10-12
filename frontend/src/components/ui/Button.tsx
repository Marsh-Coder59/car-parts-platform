import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary:   'bg-brand-500 hover:bg-brand-600 text-white focus:ring-brand-400',
    secondary: 'bg-gray-900 hover:bg-gray-800 text-white focus:ring-gray-700',
    ghost:     'bg-transparent hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-700 dark:text-gray-200 focus:ring-gray-300',
    danger:    'bg-red-600 hover:bg-red-700 text-white focus:ring-red-400',
    outline:   'border-2 border-brand-500 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 focus:ring-brand-400',
  };

  const sizes = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2.5',
    lg: 'text-base px-6 py-3',
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : leftIcon ? (
        <span className="h-4 w-4 flex items-center">{leftIcon}</span>
      ) : null}
      {children}
    </button>
  );
}
