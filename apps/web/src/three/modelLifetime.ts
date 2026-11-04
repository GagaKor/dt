import { Mesh, Texture, type BufferGeometry, type Material, type Object3D } from 'three';
import './bvh';

// A loaded model is owned by useSiteModel (DOM side) but drawn inside the R3F root,
// which commits on its own schedule. Disposing on the owner's cleanup alone could free
// buffers the canvas is still drawing (three would silently re-upload and leak them),
// so disposal waits until the owner released the model and no renderer holds it.
const holds = new WeakMap<Object3D, number>();
const released = new WeakSet<Object3D>();
const disposed = new WeakSet<Object3D>();

function materialsOf(o: Object3D): Material[] {
  const m = (o as { material?: Material | Material[] }).material;
  return m ? (Array.isArray(m) ? m : [m]) : [];
}

function disposeModel(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((o) => {
    if (o instanceof Mesh) geometries.add(o.geometry);
    for (const m of materialsOf(o)) materials.add(m);
  });
  for (const g of geometries) {
    g.disposeBoundsTree();
    g.dispose();
  }
  const textures = new Set<Texture>();
  for (const m of materials) {
    for (const v of Object.values(m)) if (v instanceof Texture) textures.add(v);
    m.dispose();
  }
  for (const t of textures) t.dispose();
}

function disposeIfIdle(model: Object3D): void {
  if (!released.has(model) || (holds.get(model) ?? 0) > 0 || disposed.has(model)) return;
  disposed.add(model);
  disposeModel(model);
}

/** Marks a model as drawn by a renderer; call the returned function once it is no longer drawn. */
export function retainModel(model: Object3D): () => void {
  holds.set(model, (holds.get(model) ?? 0) + 1);
  // A concurrent canvas render can commit a model released (and disposed) while it was
  // yielding; drawing it re-uploads the buffers, so the next idle point must free them again.
  disposed.delete(model);
  let dropped = false;
  return () => {
    if (dropped) return;
    dropped = true;
    holds.set(model, (holds.get(model) ?? 1) - 1);
    disposeIfIdle(model);
  };
}

/** The owner gives the model up; it is disposed as soon as no renderer holds it. */
export function releaseModel(model: Object3D): void {
  released.add(model);
  disposeIfIdle(model);
}

export function isModelReleased(model: Object3D): boolean {
  return released.has(model);
}
