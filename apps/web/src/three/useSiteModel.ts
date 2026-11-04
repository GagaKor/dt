import { useEffect, useState } from 'react';
import { Box3, Mesh, Texture, type Group, type Material, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { apiFetchBytes } from '../api/client';
import './bvh';

export interface SiteModel {
  scene: Group | null;
  bounds: Box3 | null;
  error: Error | null;
}

const EMPTY: SiteModel = { scene: null, bounds: null, error: null };

async function loadSiteModel(siteId: string, version: number, signal: AbortSignal): Promise<Group> {
  const bytes = await apiFetchBytes(`/api/sites/${encodeURIComponent(siteId)}/model?v=${version}`, {
    signal,
  });
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes, '');
  const scene = gltf.scene;
  scene.traverse((o) => {
    if (o instanceof Mesh) o.geometry.computeBoundsTree();
  });
  scene.updateMatrixWorld(true);
  return scene;
}

function materialsOf(o: Object3D): Material[] {
  const m = (o as { material?: Material | Material[] }).material;
  return m ? (Array.isArray(m) ? m : [m]) : [];
}

export function disposeModel(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.disposeBoundsTree();
      o.geometry.dispose();
    }
    for (const m of materialsOf(o)) materials.add(m);
  });
  const textures = new Set<Texture>();
  for (const m of materials) {
    for (const v of Object.values(m)) if (v instanceof Texture) textures.add(v);
    m.dispose();
  }
  for (const t of textures) t.dispose();
}

export function useSiteModel(siteId: string, modelVersion: number | null): SiteModel {
  const key = modelVersion === null ? null : `${siteId}@${modelVersion}`;
  const [state, setState] = useState<SiteModel & { key: string | null }>({ ...EMPTY, key: null });

  useEffect(() => {
    if (modelVersion === null) return;
    const ac = new AbortController();
    const key = `${siteId}@${modelVersion}`;
    let loaded: Group | null = null;
    loadSiteModel(siteId, modelVersion, ac.signal).then(
      (scene) => {
        if (ac.signal.aborted) {
          disposeModel(scene);
          return;
        }
        loaded = scene;
        setState({ key, scene, bounds: new Box3().setFromObject(scene), error: null });
      },
      (err: unknown) => {
        if (ac.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ key, scene: null, bounds: null, error });
      },
    );
    return () => {
      ac.abort();
      if (loaded) disposeModel(loaded);
    };
  }, [siteId, modelVersion]);

  if (key === null || state.key !== key) return EMPTY;
  return { scene: state.scene, bounds: state.bounds, error: state.error };
}
