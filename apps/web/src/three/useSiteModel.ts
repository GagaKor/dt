import { useEffect, useState } from 'react';
import { Box3, Mesh, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { apiFetchBytes } from '../api/client';
import './bvh';
import { releaseModel } from './modelLifetime';

export interface SiteModel {
  scene: Group | null;
  bounds: Box3 | null;
  error: Error | null;
}

export type ModelState = 'loading' | 'ready' | 'error';

/** Observable load state for the canvas wrapper; `ready` once the scene can be drawn. */
export function modelStateOf(model: Pick<SiteModel, 'scene' | 'error'>): ModelState {
  return model.error ? 'error' : model.scene ? 'ready' : 'loading';
}

const EMPTY: SiteModel = { scene: null, bounds: null, error: null };
const NO_STATE = { ...EMPTY, key: null };

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

/**
 * Loads the site model. Render the returned scene only through ModelLayers, which tells
 * the lifetime tracker when the canvas stops drawing it.
 */
export function useSiteModel(siteId: string, modelVersion: number | null): SiteModel {
  const key = modelVersion === null ? null : `${siteId}@${modelVersion}`;
  const [state, setState] = useState<SiteModel & { key: string | null }>(NO_STATE);

  useEffect(() => {
    if (modelVersion === null) return;
    const ac = new AbortController();
    const key = `${siteId}@${modelVersion}`;
    let loaded: Group | null = null;
    loadSiteModel(siteId, modelVersion, ac.signal).then(
      (scene) => {
        if (ac.signal.aborted) {
          releaseModel(scene);
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
      // Forget the result too, or returning to the same key would hand out a released scene.
      setState((s) => (s.key === key ? NO_STATE : s));
      if (loaded) releaseModel(loaded);
    };
  }, [siteId, modelVersion]);

  if (key === null || state.key !== key) return EMPTY;
  return { scene: state.scene, bounds: state.bounds, error: state.error };
}
