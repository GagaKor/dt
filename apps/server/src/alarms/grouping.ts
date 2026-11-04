import { ALARM_CONTINUATION_MS } from '@dt/shared';

export interface SituationParts {
  integrationKeyId: string;
  deviceId: string;
  eventType: string;
  objectId: string | null;
}

export type AlarmDecision = { kind: 'merge'; alarmId: string } | { kind: 'create' };

// JSON encoding keeps the tuple unambiguous and distinguishes null from the string "null".
export function situationKey(p: SituationParts): string {
  return JSON.stringify([p.integrationKeyId, p.deviceId, p.eventType, p.objectId]);
}

// Acknowledgement state is deliberately not an input: an acked alarm still merges within the window.
export function decideAlarm(
  existing: { id: string; lastReceivedAt: Date } | null,
  receivedAt: Date,
): AlarmDecision {
  if (
    existing &&
    receivedAt.getTime() - existing.lastReceivedAt.getTime() <= ALARM_CONTINUATION_MS
  ) {
    return { kind: 'merge', alarmId: existing.id };
  }
  return { kind: 'create' };
}
