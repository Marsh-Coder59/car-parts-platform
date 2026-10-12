// Client-side password strength estimation.
//
// This is a UX aid only — it gives the user live, actionable feedback while
// typing. It is NOT the source of truth: the backend independently enforces
// its own password policy (see UserRegister.password_strength in main.py),
// so a user can never register with a weak password just because this
// meter rendered green incorrectly or was bypassed client-side.

// A short list of extremely common passwords / patterns worth calling out
// explicitly, since "has a digit and a symbol" alone doesn't catch
// "Password1!" or "Qwerty123!". This is intentionally small — it's a UX
// nudge, not a breach-database check.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  '1234567890', 'qwerty123', 'qwertyuiop', 'letmein123', 'welcome123',
  'admin1234', 'iloveyou1', 'monkey123', 'dragon123', 'sunshine1',
  'princess1', 'football1', 'baseball1', 'superman1', 'trustno1',
]);

export type StrengthLabel = 'Weak' | 'Fair' | 'Good' | 'Strong';

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordStrengthResult {
  score: number; // 0–4
  label: StrengthLabel;
  color: 'red' | 'orange' | 'yellow' | 'green';
  requirements: PasswordRequirement[];
  allRequirementsMet: boolean;
}

function hasSequentialRun(password: string, minRun = 4): boolean {
  const lower = password.toLowerCase();
  const sequences = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  for (const seq of sequences) {
    for (let i = 0; i <= seq.length - minRun; i++) {
      if (lower.includes(seq.slice(i, i + minRun))) return true;
    }
  }
  return false;
}

function hasHeavyRepetition(password: string): boolean {
  // e.g. "aaaa", "1111"
  return /(.)\1{3,}/.test(password);
}

export function evaluatePasswordStrength(password: string, personalInfo: string[] = []): PasswordStrengthResult {
  const pwd = password || '';
  const lower = pwd.toLowerCase();

  const requirements: PasswordRequirement[] = [
    { id: 'length', label: 'At least 12 characters', met: pwd.length >= 12 },
    { id: 'case', label: 'Uppercase and lowercase letters', met: /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) },
    { id: 'number', label: 'At least one number', met: /\d/.test(pwd) },
    { id: 'special', label: 'At least one special character', met: /[^A-Za-z0-9]/.test(pwd) },
    {
      id: 'common',
      label: 'Not a common or predictable password',
      met: pwd.length > 0 && !COMMON_PASSWORDS.has(lower) && !hasSequentialRun(pwd) && !hasHeavyRepetition(pwd),
    },
    {
      id: 'personal',
      label: "Doesn't contain your name or email",
      met: pwd.length === 0 || !personalInfo.some(info => info && info.length >= 3 && lower.includes(info.toLowerCase())),
    },
  ];

  if (pwd.length === 0) {
    return { score: 0, label: 'Weak', color: 'red', requirements, allRequirementsMet: false };
  }

  // Base score from entropy-ish signals, then penalize common/sequential/personal-info patterns.
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (pwd.length >= 16) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  const isCommon = COMMON_PASSWORDS.has(lower) || hasSequentialRun(pwd) || hasHeavyRepetition(pwd);
  const hasPersonalInfo = personalInfo.some(info => info && info.length >= 3 && lower.includes(info.toLowerCase()));
  if (isCommon) score = Math.min(score, 1);
  if (hasPersonalInfo) score = Math.min(score, 1);
  if (pwd.length < 8) score = 0;

  score = Math.max(0, Math.min(4, Math.round((score / 6) * 4)));

  const allRequirementsMet = requirements.every(r => r.met);
  // Never show "Strong" unless every listed requirement is actually met —
  // a high raw score from length alone shouldn't outrank the checklist.
  if (!allRequirementsMet) score = Math.min(score, 3);

  const labels: StrengthLabel[] = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors: PasswordStrengthResult['color'][] = ['red', 'red', 'orange', 'yellow', 'green'];

  return {
    score,
    label: labels[score],
    color: colors[score],
    requirements,
    allRequirementsMet,
  };
}
