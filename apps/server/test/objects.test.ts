import { describe, expect, test, vi } from 'vitest';
import type { ObjectStateWire } from '@dt/shared';
import { ObjectStore } from '../src/objects/objectStore.js';
import type { ObjectUpsert } from '../src/ingest/eventService.js';

const input = (over: Partial<ObjectUpsert> = {}): ObjectUpsert => ({
  integrationKeyId: 'k1',
  deviceId: 'cam-1',
  siteId: 's1',
  floorId: 'f1',
  x: 1,
  y: 2,
  objectId: 'o1',
  objectType: 'person',
  ...over,
});

const make = () => {
  let now = 10_000;
  const onChange = vi.fn<(siteId: string, states: ObjectStateWire[]) => void>();
  const store = new ObjectStore(() => now, onChange);
  return { store, onChange, advance: (ms: number) => (now += ms) };
};

describe('ObjectStore', () => {
  test('upsert with id keeps one key across updates', () => {
    const { store } = make();
    const a = store.upsert(input());
    const b = store.upsert(input({ x: 5 }));
    expect(a.key).toBe('k1:o1');
    expect(b.key).toBe(a.key);
    expect(store.listSite('s1')).toHaveLength(1);
    expect(store.listSite('s1')[0]!.x).toBe(5);
  });

  test('anonymous upserts get distinct keys', () => {
    const { store } = make();
    const a = store.upsert(input({ objectId: null }));
    const b = store.upsert(input({ objectId: null }));
    expect(a.key).toMatch(/^anon:/);
    expect(a.key).not.toBe(b.key);
    expect(store.listSite('s1')).toHaveLength(2);
  });

  test('listSite reports ageMs', () => {
    const { store, advance } = make();
    store.upsert(input());
    advance(1500);
    expect(store.listSite('s1')[0]!.ageMs).toBe(1500);
  });

  test('objects vanish after 4000ms', () => {
    const { store, advance } = make();
    store.upsert(input());
    advance(3999);
    expect(store.listSite('s1')).toHaveLength(1);
    advance(1);
    expect(store.listSite('s1')).toHaveLength(0);
    store.sweep();
    expect(store.listSite('s1')).toHaveLength(0);
  });

  test('onChange receives the updated state', () => {
    const { store, onChange } = make();
    store.upsert(input({ x: 7 }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [siteId, states] = onChange.mock.calls[0]!;
    expect(siteId).toBe('s1');
    expect(states[0]).toMatchObject({ key: 'k1:o1', x: 7, ageMs: 0 });
  });
});
