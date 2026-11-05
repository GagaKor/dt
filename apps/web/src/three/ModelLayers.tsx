import type { Floor, FloorRange } from '@dt/shared';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { Mesh, MeshStandardMaterial, type Material, type Object3D, type Plane } from 'three';
import { floorClipPlanes } from './floorClipping';
import { isModelReleased, retainModel } from './modelLifetime';

export interface ModelLayersProps {
  scene: Object3D | null;
  floors: Floor[];
  selectedFloorId: string | null;
  /** Cut the model to this height range instead of the selected floor (e.g. a range being edited). */
  range?: FloorRange | null;
}

interface Layers {
  opaque: Object3D;
  ghost: Object3D;
  dispose(): void;
}

type WithMaterial = Object3D & { material: Material | Material[] };

const hasMaterial = (o: Object3D): o is WithMaterial => 'material' in o && !!o.material;
const noRaycast = () => {};

// Clones share geometry (and textures) with the source scene; only the materials
// created here belong to the layers and are disposed with them.
function buildLayers(scene: Object3D, elevationMin: number, elevationMax: number): Layers {
  const { inside, outside } = floorClipPlanes({ elevationMin, elevationMax });
  const owned: Material[] = [];
  const clipped = new Map<Material, Material>();
  const clip = (m: Material, planes: Plane[], intersection: boolean) => {
    let c = clipped.get(m);
    if (!c) {
      c = m.clone();
      c.clippingPlanes = planes;
      c.clipIntersection = intersection;
      clipped.set(m, c);
      owned.push(c);
    }
    return c;
  };
  const mapMaterial = (o: WithMaterial, fn: (m: Material) => Material) => {
    o.material = Array.isArray(o.material) ? o.material.map(fn) : fn(o.material);
  };

  const opaque = scene.clone(true);
  opaque.traverse((o) => {
    if (hasMaterial(o)) mapMaterial(o, (m) => clip(m, inside, false));
  });

  const ghostMaterial = new MeshStandardMaterial({
    color: '#9aa4b8',
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    clippingPlanes: outside,
    clipIntersection: true,
  });
  owned.push(ghostMaterial);
  clipped.clear();
  const ghost = scene.clone(true);
  ghost.traverse((o) => {
    if (o instanceof Mesh) {
      o.material = ghostMaterial;
      o.renderOrder = 1;
      // Same geometry as the opaque layer: picking it again only duplicates hits.
      o.raycast = noRaycast;
    } else if (hasMaterial(o)) {
      mapMaterial(o, (m) => clip(m, outside, true));
    }
  });

  return {
    opaque,
    ghost,
    dispose: () => owned.forEach((m) => m.dispose()),
  };
}

/** The height range to cut the model to: `range` if given, else the selected floor, else none. */
export function layerRange(
  floors: Floor[],
  selectedFloorId: string | null,
  range: FloorRange | null | undefined,
): FloorRange | null {
  if (range) return { elevationMin: range.elevationMin, elevationMax: range.elevationMax };
  const floor = floors.find((f) => f.id === selectedFloorId);
  return floor ? { elevationMin: floor.elevationMin, elevationMax: floor.elevationMax } : null;
}

export function ModelLayers({ scene: source, floors, selectedFloorId, range }: ModelLayersProps) {
  // A released scene may already be disposed; drawing it would re-upload its buffers.
  const scene = source && !isModelReleased(source) ? source : null;
  const floor = layerRange(floors, selectedFloorId, range);
  // Keyed on the range values so a refetched, unchanged floor list keeps the clones.
  const min = floor?.elevationMin;
  const max = floor?.elevationMax;
  const layers = useMemo(
    () => (scene && min !== undefined && max !== undefined ? buildLayers(scene, min, max) : null),
    [scene, min, max],
  );
  // Layout effects run inside this root's commit, so the hold matches exactly whether the
  // canvas tree contains the scene (or clones sharing its buffers).
  useLayoutEffect(() => (scene ? retainModel(scene) : undefined), [scene]);
  useEffect(() => () => layers?.dispose(), [layers]);

  if (!scene) return null;
  if (!layers) return <primitive object={scene} />;
  return (
    <>
      <primitive object={layers.opaque} />
      <primitive object={layers.ghost} />
    </>
  );
}
