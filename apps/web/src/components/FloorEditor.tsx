import type { FloorInput, FloorRange, FloorRangeIssue } from '@dt/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

export function applySuggestion(s: FloorRange[]): FloorInput[] {
  return [...s]
    .sort((a, b) => a.elevationMin - b.elevationMin)
    .map((r, i) => ({
      name: `${i + 1}F`,
      elevationMin: r.elevationMin,
      elevationMax: r.elevationMax,
    }));
}

const inputClass =
  'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';

export function FloorEditor({ value, onChange, issues, onActiveChange }: FloorEditorProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? focused;
  // Adding or removing rows shifts indexes; start over rather than preview the wrong row.
  const count = value.length;
  useEffect(() => {
    setFocused(null);
    setHovered(null);
  }, [count]);
  useEffect(() => onActiveChange?.(active), [active, onActiveChange]);

  const patch = (i: number, p: Partial<FloorInput>) =>
    onChange(value.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const num = (v: string) => (v === '' ? Number.NaN : Number(v));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('floors.help')}</p>
      {value.map((f, i) => {
        const rowIssues = issues.filter((x) => x.index === i);
        return (
          <div
            key={f.id ?? i}
            data-testid="floor-row"
            data-active={active === i || undefined}
            className={`flex flex-col gap-1 rounded px-1 py-0.5 ${
              active === i ? 'bg-blue-50 dark:bg-slate-700/60' : ''
            }`}
            onFocus={() => setFocused(i)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(null);
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center gap-2">
              <input
                aria-label={t('floors.name')}
                className={`${inputClass} w-24`}
                value={f.name}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <input
                aria-label={t('floors.min')}
                type="number"
                step="0.1"
                className={`${inputClass} w-24`}
                value={Number.isNaN(f.elevationMin) ? '' : f.elevationMin}
                onChange={(e) => patch(i, { elevationMin: num(e.target.value) })}
              />
              <input
                aria-label={t('floors.max')}
                type="number"
                step="0.1"
                className={`${inputClass} w-24`}
                value={Number.isNaN(f.elevationMax) ? '' : f.elevationMax}
                onChange={(e) => patch(i, { elevationMax: num(e.target.value) })}
              />
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-slate-700"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
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
        className="self-start rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600"
        onClick={() => {
          const last = value[value.length - 1];
          const min = last ? last.elevationMax : 0;
          onChange([
            ...value,
            { name: `${value.length + 1}F`, elevationMin: min, elevationMax: min + 3 },
          ]);
        }}
      >
        {t('floors.add')}
      </button>
    </div>
  );
}
