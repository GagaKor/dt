import type { FloorInput, FloorRange, FloorRangeIssue, FloorSuggestion } from '@dt/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, TrashIcon } from './icons';
import { buttonClass, inputClass } from './ui';

export interface FloorEditorProps {
  value: FloorInput[];
  onChange(v: FloorInput[]): void;
  issues: FloorRangeIssue[];
  /** The row to preview: the hovered row, else the row with focus, else null. */
  onActiveChange?(index: number | null): void;
}

/** The range of row `index` when both heights are numbers and min < max; otherwise null. */
export function editedRange(
  rows: FloorInput[],
  index: number | null,
): (FloorRange & { name: string }) | null {
  const row = index === null ? undefined : rows[index];
  if (!row) return null;
  const { name, elevationMin, elevationMax } = row;
  if (!Number.isFinite(elevationMin) || !Number.isFinite(elevationMax)) return null;
  if (elevationMin >= elevationMax) return null;
  return { name, elevationMin, elevationMax };
}

/** Suggested ranges as editor rows: storeys are numbered from the bottom, a roof gets `roofName`. */
export function applySuggestion(s: FloorSuggestion[], roofName = 'Roof'): FloorInput[] {
  let storey = 0;
  return [...s]
    .sort((a, b) => a.elevationMin - b.elevationMin)
    .map((r) => ({
      name: r.roof ? roofName : `${++storey}F`,
      elevationMin: r.elevationMin,
      elevationMax: r.elevationMax,
    }));
}

const NAME_INPUT = `${inputClass('sm')} w-24`;
const HEIGHT_INPUT = `${inputClass('sm')} w-28`;

export function FloorEditor({ value, onChange, issues, onActiveChange }: FloorEditorProps) {
  const { t } = useTranslation();
  const count = value.length;
  // Focus is remembered with the row count: a removed row takes its focus with it (React fires no
  // blur for it), and the rows below shift up. Hover stays positional: after a removal the pointer
  // is over whichever row moved under it.
  const [focused, setFocused] = useState<{ index: number; count: number } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const focusedIndex = focused?.count === count ? focused.index : null;
  const hoveredIndex = hovered !== null && hovered < count ? hovered : null;
  const active = hoveredIndex ?? focusedIndex;
  useEffect(() => onActiveChange?.(active), [active, onActiveChange]);
  useEffect(() => () => onActiveChange?.(null), [onActiveChange]);

  const patch = (i: number, p: Partial<FloorInput>) =>
    onChange(value.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const num = (v: string) => (v === '' ? Number.NaN : Number(v));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('floors.help')}</p>
      {count > 0 && (
        <div
          aria-hidden
          className="flex gap-2 px-1 text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          <span className="w-24">{t('floors.name')}</span>
          <span className="w-28">{t('floors.min')}</span>
          <span className="w-28">{t('floors.max')}</span>
        </div>
      )}
      {value.map((f, i) => {
        const rowIssues = issues.filter((x) => x.index === i);
        return (
          <div
            key={f.id ?? i}
            data-testid="floor-row"
            data-active={active === i || undefined}
            className={`flex flex-col gap-1 rounded-md px-1 py-1 ${
              active === i ? 'bg-blue-50 dark:bg-slate-700/60' : ''
            }`}
            onFocus={() => setFocused({ index: i, count })}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(null);
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center gap-2">
              <input
                aria-label={t('floors.name')}
                className={NAME_INPUT}
                value={f.name}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <input
                aria-label={t('floors.min')}
                type="number"
                step="0.1"
                className={HEIGHT_INPUT}
                value={Number.isNaN(f.elevationMin) ? '' : f.elevationMin}
                onChange={(e) => patch(i, { elevationMin: num(e.target.value) })}
              />
              <input
                aria-label={t('floors.max')}
                type="number"
                step="0.1"
                className={HEIGHT_INPUT}
                value={Number.isNaN(f.elevationMax) ? '' : f.elevationMax}
                onChange={(e) => patch(i, { elevationMax: num(e.target.value) })}
              />
              <button
                type="button"
                className={buttonClass('danger')}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <TrashIcon />
                {t('floors.remove')}
              </button>
            </div>
            {rowIssues.map((x) => (
              <p key={x.code} role="alert" className="text-xs text-red-600">
                {t(`floors.issue.${x.code}`)}
              </p>
            ))}
          </div>
        );
      })}
      <button
        type="button"
        className={`${buttonClass('secondary')} self-start`}
        onClick={() => {
          const last = value[value.length - 1];
          const min = last ? last.elevationMax : 0;
          onChange([
            ...value,
            { name: `${value.length + 1}F`, elevationMin: min, elevationMax: min + 3 },
          ]);
        }}
      >
        <PlusIcon />
        {t('floors.add')}
      </button>
    </div>
  );
}
