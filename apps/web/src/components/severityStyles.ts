import type { Severity } from '@dt/shared';

export const SEVERITY_BAR: Record<Severity, string> = {
  critical: 'bg-red-600',
  major: 'bg-orange-500',
  minor: 'bg-yellow-400',
  info: 'bg-sky-500',
};
