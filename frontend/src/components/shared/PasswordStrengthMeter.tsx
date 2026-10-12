import { Check, X } from 'lucide-react';
import { evaluatePasswordStrength } from '../../utils/password';

interface PasswordStrengthMeterProps {
  password: string;
  /** First name, last name, email — used to flag passwords that contain the user's own info. */
  personalInfo?: string[];
}

const SEGMENT_COLOR: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
};

const LABEL_TEXT_COLOR: Record<string, string> = {
  red: 'text-red-600 dark:text-red-400',
  orange: 'text-orange-600 dark:text-orange-400',
  yellow: 'text-yellow-600 dark:text-yellow-500',
  green: 'text-green-600 dark:text-green-400',
};

export default function PasswordStrengthMeter({ password, personalInfo = [] }: PasswordStrengthMeterProps) {
  const result = evaluatePasswordStrength(password, personalInfo);
  const segments = 4;

  if (!password) {
    return (
      <div className="mt-2 space-y-2">
        <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          {result.requirements.map(req => (
            <li key={req.id} className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" />
              {req.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1" role="meter" aria-valuenow={result.score} aria-valuemin={0} aria-valuemax={4}>
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < result.score ? SEGMENT_COLOR[result.color] : 'bg-gray-200 dark:bg-dark-600'
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-semibold ${LABEL_TEXT_COLOR[result.color]}`}>{result.label}</span>
      </div>
      <span className="sr-only">Password strength: {result.label}</span>

      <ul className="text-xs space-y-1">
        {result.requirements.map(req => (
          <li
            key={req.id}
            className={`flex items-center gap-1.5 ${
              req.met ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {req.met ? (
              <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            ) : (
              <X className="w-3.5 h-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true" />
            )}
            {req.label}
          </li>
        ))}
      </ul>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Tip: a long, unique passphrase you don't reuse elsewhere beats a short complex one.
      </p>
    </div>
  );
}
