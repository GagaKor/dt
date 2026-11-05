// Shared looks for interactive elements, so anything clickable reads as clickable on every page.
// They are class strings rather than components: the same look goes on <button>, <a> and <Link>.
// `not-disabled:` (not `enabled:`) keeps hover working on links, which have no :enabled state.

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerSolid' | 'ghost';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400';

const BASE = `inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-4 text-sm',
};

const ICON_SIZE: Record<ButtonSize, string> = {
  xs: 'size-7',
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-10',
};

const VARIANT: Record<ButtonVariant, string> = {
  // The one action a screen is for: solid accent colour.
  primary:
    'bg-blue-600 text-white shadow-sm not-disabled:hover:bg-blue-700 not-disabled:active:bg-blue-800',
  // Everything else: a raised, bordered surface.
  secondary:
    'border border-slate-300 bg-white text-slate-800 shadow-sm not-disabled:hover:border-slate-400 not-disabled:hover:bg-slate-50 not-disabled:active:bg-slate-100 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:not-disabled:hover:border-slate-400 dark:not-disabled:hover:bg-slate-600',
  // Starts something destructive (delete, revoke); a confirmation follows.
  danger:
    'border border-red-300 bg-white text-red-700 shadow-sm not-disabled:hover:border-red-400 not-disabled:hover:bg-red-50 dark:border-red-800 dark:bg-slate-800 dark:text-red-300 dark:not-disabled:hover:bg-red-950',
  // Confirms the destructive action.
  dangerSolid: 'bg-red-600 text-white shadow-sm not-disabled:hover:bg-red-700',
  // Icon-only controls whose icon already says what they do (close).
  ghost:
    'text-slate-500 not-disabled:hover:bg-slate-100 not-disabled:hover:text-slate-900 dark:text-slate-400 dark:not-disabled:hover:bg-slate-700 dark:not-disabled:hover:text-white',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'sm'): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]}`;
}

export function iconButtonClass(variant: ButtonVariant = 'ghost', size: ButtonSize = 'sm'): string {
  return `${BASE} ${ICON_SIZE[size]} ${VARIANT[variant]}`;
}

/** One option of a set where one is chosen (floor picker, tool modes, time ranges). */
export function toggleClass(active: boolean, size: ButtonSize = 'sm'): string {
  return `${BASE} ${SIZE[size]} border ${
    active
      ? 'border-slate-800 bg-slate-800 text-white shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
      : 'border-slate-300 bg-white text-slate-700 shadow-sm not-disabled:hover:border-slate-400 not-disabled:hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:not-disabled:hover:bg-slate-600'
  }`;
}

/** Tabs that switch between pages of one section. */
export function tabClass(active: boolean): string {
  return `-mb-px inline-flex h-10 cursor-pointer items-center border-b-2 px-3 text-sm font-medium transition-colors ${FOCUS} ${
    active
      ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white'
  }`;
}

/** A link inside running text: coloured and underlined before it is hovered. */
export const textLinkClass = `rounded-sm font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700 dark:text-blue-300 dark:decoration-blue-700 dark:hover:decoration-blue-300 ${FOCUS}`;

const INPUT =
  'rounded-md border border-slate-300 bg-white px-2.5 text-sm shadow-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:placeholder:text-slate-500';

const INPUT_HEIGHT: Record<ButtonSize, string> = { xs: 'h-7', sm: 'h-8', md: 'h-9', lg: 'h-10' };

/** Text fields and selects, the same heights as the buttons beside them. */
export function inputClass(size: ButtonSize = 'md'): string {
  return `${INPUT} ${INPUT_HEIGHT[size]}`;
}
