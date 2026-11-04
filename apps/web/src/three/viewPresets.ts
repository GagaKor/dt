import type { FloorRange } from '@dt/shared';
import { Box3, Vector3 } from 'three';
import { floorVisibleBand } from './floorClipping';

export interface ViewPose {
  position: Vector3;
  target: Vector3;
}

export const VIEW_FOV_DEG = 50;
const MARGIN = 1.15;
// Seen from the south-east (plan -y/+x side), looking north-west and down.
const OBLIQUE_DIR = new Vector3(0.45, 0.75, 1).normalize();
// A tiny southward offset keeps the controls' azimuth at 0, i.e. plan north up.
const TOP_NUDGE_M = 1e-3;
const FOCUS_BOX = new Vector3(12, 4, 12);

function fitDistance(extent: number): number {
  return (extent / 2 / Math.tan(((VIEW_FOV_DEG / 2) * Math.PI) / 180)) * MARGIN;
}

function safeBounds(bounds: Box3): Box3 {
  return bounds.isEmpty() ? new Box3(new Vector3(-5, 0, -5), new Vector3(5, 3, 5)) : bounds;
}

export function obliqueView(bounds: Box3): ViewPose {
  const b = safeBounds(bounds);
  const target = b.getCenter(new Vector3());
  const radius = b.getSize(new Vector3()).length() / 2;
  const position = OBLIQUE_DIR.clone()
    .multiplyScalar(fitDistance(radius * 2))
    .add(target);
  return { position, target };
}

/** Oblique close-up of the area around a model point, e.g. a device or an alarm. */
export function focusView(point: readonly [number, number, number]): ViewPose {
  return obliqueView(new Box3().setFromCenterAndSize(new Vector3(...point), FOCUS_BOX));
}

export function topView(bounds: Box3, f: FloorRange | null): ViewPose {
  const b = safeBounds(bounds);
  const center = b.getCenter(new Vector3());
  const size = b.getSize(new Vector3());
  const base = f ? f.elevationMin : b.min.y;
  const top = f ? floorVisibleBand(f).hi : b.max.y;
  const target = new Vector3(center.x, base, center.z);
  const position = new Vector3(
    center.x,
    top + fitDistance(Math.max(size.x, size.z)),
    center.z + TOP_NUDGE_M,
  );
  return { position, target };
}
