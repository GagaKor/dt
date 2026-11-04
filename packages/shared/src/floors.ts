import type { FloorInput } from './schemas/entities';

export const MAX_FLOORS = 50;

export type FloorRangeIssueCode =
  'empty_name' | 'duplicate_name' | 'min_not_below_max' | 'overlap' | 'not_ascending' | 'too_many';

export interface FloorRangeIssue {
  code: FloorRangeIssueCode;
  index: number;
}

export function validateFloorRanges(floors: FloorInput[]): FloorRangeIssue[] {
  const issues: FloorRangeIssue[] = [];
  if (floors.length > MAX_FLOORS) issues.push({ code: 'too_many', index: MAX_FLOORS });
  const seen = new Set<string>();
  floors.forEach((fl, i) => {
    const name = fl.name.trim();
    if (name === '') issues.push({ code: 'empty_name', index: i });
    else if (seen.has(name)) issues.push({ code: 'duplicate_name', index: i });
    seen.add(name);
    if (!(fl.elevationMin < fl.elevationMax)) issues.push({ code: 'min_not_below_max', index: i });
    const prev = floors[i - 1];
    if (prev) {
      if (fl.elevationMin < prev.elevationMin) issues.push({ code: 'not_ascending', index: i });
      else if (fl.elevationMin < prev.elevationMax) issues.push({ code: 'overlap', index: i });
    }
  });
  return issues;
}
