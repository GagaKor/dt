import {
  OBJECT_TTL_MS,
  type Alarm,
  type NewAlarmNotice,
  type ObjectStateWire,
  type ServerMessage,
  type SiteSummary,
} from '@dt/shared';
import { create } from 'zustand';
import { objectOpacity } from '../three/fade';
import type { RealtimeStatus } from './socket';

export type ClientObject = ObjectStateWire & { lastSeenMs: number };
export type Toast = NewAlarmNotice & { id: string };

export const MAX_TOASTS = 5;

export interface RealtimeState {
  /** Subscribed site: the one whose objects and alarms the store holds. */
  siteId: string | null;
  /** Site whose monitor or dashboard is open; its new alarms need no toast. */
  viewedSiteId: string | null;
  objects: Map<string, ClientObject>;
  alarms: Map<string, Alarm>;
  /** Unacknowledged counts of every site. */
  sites: SiteSummary[];
  toasts: Toast[];
  status: RealtimeStatus;
  /** Last site the server refused to subscribe to. */
  rejectedSiteId: string | null;
  apply(msg: ServerMessage, nowMs: number): void;
  prune(nowMs: number): void;
  dismissToast(id: string): void;
  /** Switches to a site before its snapshot arrives, dropping the previous site's data. */
  watch(siteId: string): void;
  setViewedSite(siteId: string | null): void;
  reject(siteId: string): void;
  setStatus(status: RealtimeStatus): void;
  reset(): void;
}

/** Clock for `lastSeenMs`; monotonic so wall clock adjustments do not fade markers. */
export const realtimeNow = (): number => performance.now();

const initial = () => ({
  siteId: null,
  viewedSiteId: null,
  objects: new Map<string, ClientObject>(),
  alarms: new Map<string, Alarm>(),
  sites: [],
  toasts: [],
  status: 'closed' as RealtimeStatus,
  rejectedSiteId: null,
});

const unacked = (alarms: Alarm[]) =>
  new Map(alarms.filter((a) => a.acknowledgedAt === null).map((a) => [a.id, a]));

export const useRealtimeStore = create<RealtimeState>()((set, get) => ({
  ...initial(),

  apply(msg, nowMs) {
    const s = get();
    switch (msg.type) {
      case 'snapshot': {
        // A snapshot of a site the user already left only carries useful site totals.
        if (s.siteId !== null && s.siteId !== msg.siteId) {
          set({ sites: msg.sites });
          return;
        }
        set({
          siteId: msg.siteId,
          objects: new Map(msg.objects.map((o) => [o.key, { ...o, lastSeenMs: nowMs - o.ageMs }])),
          alarms: unacked(msg.alarms),
          sites: msg.sites,
          rejectedSiteId: s.rejectedSiteId === msg.siteId ? null : s.rejectedSiteId,
        });
        return;
      }
      case 'objects': {
        if (msg.siteId !== s.siteId || msg.objects.length === 0) return;
        const objects = new Map(s.objects);
        for (const o of msg.objects) objects.set(o.key, { ...o, lastSeenMs: nowMs });
        set({ objects });
        return;
      }
      case 'alarm': {
        const a = msg.alarm;
        if (a.siteId !== s.siteId) return;
        if (a.acknowledgedAt !== null && !s.alarms.has(a.id)) return;
        const alarms = new Map(s.alarms);
        if (a.acknowledgedAt === null) alarms.set(a.id, a);
        else alarms.delete(a.id);
        set({ alarms });
        return;
      }
      case 'summary': {
        const n = msg.newAlarm;
        const toast =
          n && n.siteId !== s.viewedSiteId && !s.toasts.some((t) => t.id === n.alarmId)
            ? { ...n, id: n.alarmId }
            : null;
        set(
          toast
            ? { sites: msg.sites, toasts: [...s.toasts, toast].slice(-MAX_TOASTS) }
            : { sites: msg.sites },
        );
        return;
      }
    }
  },

  prune(nowMs) {
    const { objects } = get();
    let kept: Map<string, ClientObject> | null = null;
    for (const [key, o] of objects) {
      if (nowMs - o.lastSeenMs < OBJECT_TTL_MS) continue;
      kept ??= new Map(objects);
      kept.delete(key);
    }
    if (kept) set({ objects: kept });
  },

  dismissToast(id) {
    const { toasts } = get();
    if (toasts.some((t) => t.id === id)) set({ toasts: toasts.filter((t) => t.id !== id) });
  },

  watch(siteId) {
    const s = get();
    const rejectedSiteId = s.rejectedSiteId === siteId ? null : s.rejectedSiteId;
    if (s.siteId === siteId) {
      if (rejectedSiteId !== s.rejectedSiteId) set({ rejectedSiteId });
      return;
    }
    set({ siteId, objects: new Map(), alarms: new Map(), rejectedSiteId });
  },

  setViewedSite(siteId) {
    if (get().viewedSiteId !== siteId) set({ viewedSiteId: siteId });
  },

  reject(siteId) {
    set({ rejectedSiteId: siteId });
  },

  setStatus(status) {
    if (get().status !== status) set({ status });
  },

  reset() {
    set(initial());
  },
}));

export function visibleObjectCount(objects: Map<string, ClientObject>, nowMs: number): number {
  let n = 0;
  for (const o of objects.values()) if (objectOpacity(nowMs - o.lastSeenMs) > 0) n++;
  return n;
}

declare global {
  interface Window {
    __dtStore?: typeof useRealtimeStore;
  }
}

if (import.meta.env.VITE_E2E === '1') window.__dtStore = useRealtimeStore;
