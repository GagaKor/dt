import type { Severity } from '@dt/shared';

export const SEVERITY_BAR: Record<Severity, string> = {
  critical: 'bg-red-600',
  major: 'bg-orange-500',
  minor: 'bg-yellow-400',
  info: 'bg-sky-500',
};

/** Same hues as `SEVERITY_BAR`, for chart libraries that need color values. */
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#dc2626',
  major: '#f97316',
  minor: '#facc15',
  info: '#0ea5e9',
};
