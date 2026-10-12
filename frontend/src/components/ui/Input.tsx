import React, { useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, className, id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '_');
    const isPassword = type === 'password';
    const [showPassword, setShowPassword] = useState(false);
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            className={clsx(
              'block w-full rounded-lg border text-sm text-gray-900 dark:text-gray-50 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400',
              'placeholder:text-gray-400 dark:placeholder:text-gray-500',
              leftIcon ? 'pl-10' : 'px-4',
              isPassword ? 'pr-10 py-2.5' : 'pr-4 py-2.5',
              leftIcon && !isPassword && 'pl-10 pr-4 py-2.5',
              leftIcon && isPassword && 'pl-10 pr-10 py-2.5',
              !leftIcon && !isPassword && 'px-4 py-2.5',
              !leftIcon && isPassword && 'px-4 pr-10 py-2.5',
              error
                ? 'border-red-400 bg-red-50 dark:bg-red-900/20 focus:ring-red-400'
                : 'border-gray-300 bg-white dark:bg-dark-800 hover:border-gray-400',
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors focus:outline-none"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, children, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '_');
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={clsx(
            'block w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-dark-800',
            'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-colors',
            error ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-300 hover:border-gray-400',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '_');
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={clsx(
            'block w-full rounded-lg border px-4 py-2.5 text-sm text-gray-900 dark:text-gray-50 resize-y',
            'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-colors',
            error ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-300 bg-white dark:bg-dark-800 hover:border-gray-400',
            className
          )}
          rows={4}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
