import { act, renderHook, waitFor } from '@testing-library/react';
import type { Group } from 'three';
import { beforeEach, expect, test, vi } from 'vitest';
import { modelStateOf, useSiteModel } from './useSiteModel';

const h = vi.hoisted(() => ({
  apiFetchBytes: vi.fn(),
  parsed: [] as Group[],
  disposals: new Map<object, number>(),
}));

vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  apiFetchBytes: h.apiFetchBytes,
}));
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { BoxGeometry, Group, Mesh, MeshBasicMaterial } = await import('three');
  class GLTFLoader {
    setMeshoptDecoder() {
      return this;
    }
    async parseAsync() {
      const scene = new Group();
      const geometry = new BoxGeometry();
      geometry.addEventListener('dispose', () =>
        h.disposals.set(scene, (h.disposals.get(scene) ?? 0) + 1),
      );
      scene.add(new Mesh(geometry, new MeshBasicMaterial()));
      h.parsed.push(scene);
      return { scene };
    }
  }
  return { GLTFLoader };
});

const disposals = (scene: object) => h.disposals.get(scene) ?? 0;
type Props = { siteId: string; v: number | null };
const setup = (initialProps: Props) =>
  renderHook((p: Props) => useSiteModel(p.siteId, p.v), { initialProps });

beforeEach(() => {
  h.apiFetchBytes.mockReset().mockResolvedValue(new ArrayBuffer(0));
  h.parsed.length = 0;
  h.disposals.clear();
});

test('switching away and back never returns the disposed scene', async () => {
  const { result, rerender, unmount } = setup({ siteId: 'A', v: 1 });
  await waitFor(() => expect(result.current.scene).not.toBeNull());
  const first = result.current.scene!;

  rerender({ siteId: 'B', v: null });
  expect(result.current.scene).toBeNull();
  expect(disposals(first)).toBe(1);

  rerender({ siteId: 'A', v: 1 });
  expect(result.current.scene).not.toBe(first);
  await waitFor(() => expect(result.current.scene).not.toBeNull());
  const second = result.current.scene!;
  expect(second).not.toBe(first);

  unmount();
  expect(disposals(first)).toBe(1);
  expect(disposals(second)).toBe(1);
});

test('a version change disposes the previous scene exactly once', async () => {
  const { result, rerender, unmount } = setup({ siteId: 'A', v: 1 });
  await waitFor(() => expect(result.current.scene).not.toBeNull());
  const v1 = result.current.scene!;
  rerender({ siteId: 'A', v: 2 });
  await waitFor(() => expect(result.current.scene).not.toBeNull());
  expect(result.current.scene).not.toBe(v1);
  expect(disposals(v1)).toBe(1);
  unmount();
  expect(h.parsed.map(disposals)).toEqual([1, 1]);
});

test('a scene that arrives after unmount is disposed', async () => {
  let resolve!: (b: ArrayBuffer) => void;
  h.apiFetchBytes.mockReturnValue(new Promise<ArrayBuffer>((r) => (resolve = r)));
  const { unmount } = setup({ siteId: 'A', v: 1 });
  unmount();
  await act(async () => resolve(new ArrayBuffer(0)));
  await waitFor(() => expect(h.parsed).toHaveLength(1));
  expect(disposals(h.parsed[0]!)).toBe(1);
});

test('modelStateOf maps scene and error to loading, ready and error', () => {
  expect(modelStateOf({ scene: null, error: null })).toBe('loading');
  expect(modelStateOf({ scene: {} as Group, error: null })).toBe('ready');
  expect(modelStateOf({ scene: null, error: new Error('x') })).toBe('error');
});
