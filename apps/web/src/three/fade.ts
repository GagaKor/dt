import { OBJECT_FADE_MS, OBJECT_HOLD_MS } from '@dt/shared';

/** Marker opacity by time since the object was last received. */
export function objectOpacity(ageMs: number): number {
  if (ageMs <= OBJECT_HOLD_MS) return 1;
  if (ageMs >= OBJECT_HOLD_MS + OBJECT_FADE_MS) return 0;
  return 1 - (ageMs - OBJECT_HOLD_MS) / OBJECT_FADE_MS;
}
