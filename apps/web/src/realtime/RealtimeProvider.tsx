import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { useMatch } from 'react-router';
import { kpiKey, resetSession, useSites } from '../api/queries';
import { connectRealtime, realtimeUrl, type RealtimeConnection } from './socket';
import { realtimeNow, useRealtimeStore } from './store';

export interface RealtimeProviderProps {
  /** Site in the current URL, if any (also settings pages of a site). */
  siteId?: string;
  children: ReactNode;
}

// The markers prune on their own frames; this keeps the store bounded on pages without them.
const PRUNE_INTERVAL_MS = 500;

/**
 * The site to stream: the one in the URL when it exists, otherwise the first site, so the
 * badge and toasts get site totals on every page.
 */
export function streamedSiteId(
  routeSiteId: string | undefined,
  siteIds: string[] | undefined,
): string | null {
  if (!siteIds) return null;
  if (routeSiteId !== undefined) return siteIds.includes(routeSiteId) ? routeSiteId : null;
  return siteIds[0] ?? null;
}

/** Owns the app's single realtime connection while the user is signed in. */
export function RealtimeProvider({ siteId, children }: RealtimeProviderProps) {
  const qc = useQueryClient();
  const sites = useSites();
  const connection = useRef<RealtimeConnection | null>(null);
  // Only a site's own pages count as watching it; its settings pages do not.
  const viewedSiteId = useMatch('/sites/:siteId/*')?.params.siteId ?? null;
  const target = streamedSiteId(
    siteId,
    sites.data?.map((s) => s.id),
  );

  useEffect(() => {
    const store = useRealtimeStore.getState;
    const conn = connectRealtime({
      url: realtimeUrl(window.location),
      onMessage: (m) => {
        store().apply(m, realtimeNow());
        if (m.type === 'alarm' && m.created) {
          void qc.invalidateQueries({ queryKey: kpiKey(m.alarm.siteId) });
        }
      },
      onStatus: (s) => store().setStatus(s),
      onRejected: (r) => {
        // An expired session: re-checking it sends RequireAuth to the login page.
        if (r.reason === 'unauthenticated') void resetSession(qc);
        else store().reject(r.siteId);
      },
    });
    connection.current = conn;
    const timer = setInterval(() => store().prune(realtimeNow()), PRUNE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      conn.close();
      connection.current = null;
      store().reset();
    };
  }, [qc]);

  useEffect(() => {
    useRealtimeStore.getState().setViewedSite(viewedSiteId);
  }, [viewedSiteId]);

  useEffect(() => {
    if (!target) return;
    useRealtimeStore.getState().watch(target);
    connection.current?.subscribe(target);
  }, [target]);

  return <>{children}</>;
}
