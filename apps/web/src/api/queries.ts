import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Device,
  DeviceCreate,
  DevicePatch,
  Floor,
  FloorInput,
  IntegrationKey,
  Severity,
  Site,
} from '@dt/shared';
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

const devicesKey = (siteId: string) => ['sites', siteId, 'devices'] as const;

export function useCreateDevice(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceCreate) =>
      apiFetch<Device>('/api/devices', { method: 'POST', json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: devicesKey(siteId) }),
  });
}

export function usePatchDevice(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: DevicePatch }) =>
      apiFetch<Device>(`/api/devices/${encodeURIComponent(v.id)}`, {
        method: 'PATCH',
        json: v.patch,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: devicesKey(siteId) }),
  });
}

export function useDeleteDevice(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: devicesKey(siteId) }),
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch<Site>('/api/sites', { method: 'POST', json: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useRenameSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      apiFetch<Site>(`/api/sites/${v.id}`, { method: 'PATCH', json: { name: v.name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/sites/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useSaveFloors(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (floors: FloorInput[]) =>
      apiFetch<Floor[]>(`/api/sites/${siteId}/floors`, { method: 'PUT', json: floors }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites', siteId, 'floors'] }),
  });
}

export function useIntegrationKeys() {
  return useQuery({
    queryKey: ['integration-keys'],
    queryFn: () => apiFetch<IntegrationKey[]>('/api/integration-keys'),
  });
}

export function usePatchKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; defaultSeverity: Severity }) =>
      apiFetch<IntegrationKey>(`/api/integration-keys/${v.id}`, {
        method: 'PATCH',
        json: { defaultSeverity: v.defaultSeverity },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration-keys'] }),
  });
}

export function useRevokeKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/integration-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration-keys'] }),
  });
}
