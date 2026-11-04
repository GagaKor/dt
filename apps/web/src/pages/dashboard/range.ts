export type Preset = 'today' | '7d' | '30d';
export interface StatsRange {
  from: string;
  to: string;
  bucket: 'hour' | 'day';
}

const DAY_MS = 86_400_000;
const PRESET_DAYS: Record<Preset, number> = { today: 1, '7d': 7, '30d': 30 };

interface Civil {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall clock of an instant in `tz`, as if it were UTC. */
function wallAsUtc(ms: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
}

function offsetMinutes(ms: number, tz: string): number {
  return Math.round(
    (wallAsUtc(Math.floor(ms / 1000) * 1000, tz) - Math.floor(ms / 1000) * 1000) / 60_000,
  );
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function formatOffset(min: number): string {
  const a = Math.abs(min);
  return `${min < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** ISO string with the offset `tz` has at the given wall-clock time. */
function civilToIso(c: Civil, tz: string): string {
  const wall = Date.UTC(c.y, c.mo - 1, c.d, c.h, c.mi);
  // The offset depends on the instant, which depends on the offset: settle it in two steps.
  let off = offsetMinutes(wall, tz);
  off = offsetMinutes(wall - off * 60_000, tz);
  const u = new Date(wall);
  const date = `${pad(u.getUTCFullYear(), 4)}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}`;
  return `${date}T${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}:00${formatOffset(off)}`;
}

function civilOfDay(dayUtcMs: number): Civil {
  const u = new Date(dayUtcMs);
  return { y: u.getUTCFullYear(), mo: u.getUTCMonth() + 1, d: u.getUTCDate(), h: 0, mi: 0 };
}

export function rangeForPreset(preset: Preset, now: Date, tz: string): StatsRange {
  const today = wallAsUtc(now.getTime(), tz);
  const startOfToday = today - (today % DAY_MS);
  const days = PRESET_DAYS[preset];
  return {
    from: civilToIso(civilOfDay(startOfToday - (days - 1) * DAY_MS), tz),
    to: civilToIso(civilOfDay(startOfToday + DAY_MS), tz),
    bucket: preset === 'today' ? 'hour' : 'day',
  };
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function parseLocal(value: string): Civil | null {
  const m = LOCAL_RE.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return { y, mo, d, h, mi };
}

/** Range from two `datetime-local` values read in `tz`; null while the input is incomplete or inverted. */
export function customRange(fromLocal: string, toLocal: string, tz: string): StatsRange | null {
  const a = parseLocal(fromLocal);
  const b = parseLocal(toLocal);
  if (!a || !b) return null;
  const span = Date.UTC(b.y, b.mo - 1, b.d, b.h, b.mi) - Date.UTC(a.y, a.mo - 1, a.d, a.h, a.mi);
  if (span <= 0) return null;
  return {
    from: civilToIso(a, tz),
    to: civilToIso(b, tz),
    bucket: span <= 2 * DAY_MS ? 'hour' : 'day',
  };
}
