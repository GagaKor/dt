import { useQuery } from '@tanstack/react-query';
import type { Device, Floor, Site } from '@dt/shared';
import { apiFetch } from './client';

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => apiFetch<{ username: string }>('/api/auth/me'),
    retry: false,
    staleTime: 60_000,
  });
}

export function useSites() {
  return useQuery({ queryKey: ['sites'], queryFn: () => apiFetch<Site[]>('/api/sites') });
}

export function useFloors(siteId: string | undefined) {
  return useQuery({
    queryKey: ['sites', siteId, 'floors'],
    queryFn: () => apiFetch<Floor[]>(`/api/sites/${siteId}/floors`),
    enabled: !!siteId,
  });
}

export function useDevices(siteId: string | undefined) {
  return useQuery({
    queryKey: ['sites', siteId, 'devices'],
    queryFn: () => apiFetch<Device[]>(`/api/sites/${siteId}/devices`),
    enabled: !!siteId,
  });
}
