export const UNKNOWN_OBJECT_COLOR = '#8a8f99';

// No gray (objects without an ID) and no red (alarm rings) so neither is mistaken for an ID color.
export const OBJECT_PALETTE = [
  '#1677ff',
  '#13c2c2',
  '#52c41a',
  '#a0d911',
  '#fadb14',
  '#fa8c16',
  '#722ed1',
  '#eb2f96',
  '#2f54eb',
  '#b37feb',
] as const;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function objectColor(objectId: string | null): string {
  if (objectId === null) return UNKNOWN_OBJECT_COLOR;
  return OBJECT_PALETTE[fnv1a(objectId) % OBJECT_PALETTE.length]!;
}
