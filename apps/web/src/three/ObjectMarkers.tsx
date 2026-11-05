import type { ObjectType } from '@dt/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import {
  BoxGeometry,
  CapsuleGeometry,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type BufferGeometry,
  type Group,
} from 'three';
import { realtimeNow, useRealtimeStore, type ClientObject } from '../realtime/store';
import { useViewStore } from '../state/viewStore';
import type { FloorYResolver } from './floorSurface';
import { objectOpacity } from './fade';
import { isOnSelectedFloor } from './floorFilter';
import { getLabelTexture } from './labelTexture';
import { objectColor } from './objectColor';

export interface ObjectMarkersProps {
  siteId: string;
  resolveFloorY: FloorYResolver;
}

/** Drawn after the model and without depth test, so markers stay visible on every floor. */
export const MARKER_RENDER_ORDER = 999;
const PRUNE_INTERVAL_MS = 500;
const LABEL_GAP_M = 0.15;
// Labels keep a constant screen size (sizeAttenuation off): this is a fraction of the view
// height, about 20 px in a typical canvas.
const LABEL_HEIGHT = 0.028;

interface Shape {
  geometry: BufferGeometry;
  halfHeight: number;
}

let shapes: Record<ObjectType | 'unknown', Shape> | null = null;

// One geometry per type for the whole app; markers only own their materials.
function shapeFor(type: ObjectType | null): Shape {
  shapes ??= {
    person: { geometry: new CapsuleGeometry(0.3, 1.1, 4, 12), halfHeight: 0.3 + 1.1 / 2 },
    vehicle: { geometry: new BoxGeometry(1.8, 1.4, 4.2), halfHeight: 0.7 },
    object: { geometry: new BoxGeometry(0.6, 0.6, 0.6), halfHeight: 0.3 },
    unknown: { geometry: new SphereGeometry(0.35, 16, 12), halfHeight: 0.35 },
  };
  return shapes[type ?? 'unknown'];
}

interface Marker {
  data: ClientObject;
  mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  label: Sprite | null;
  placed: boolean;
}

function createMarker(o: ClientObject): Marker {
  const material = new MeshLambertMaterial({
    color: objectColor(o.objectId),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(shapeFor(o.objectType).geometry, material);
  mesh.renderOrder = MARKER_RENDER_ORDER;
  let label: Sprite | null = null;
  if (o.objectId !== null) {
    label = new Sprite(
      new SpriteMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
      }),
    );
    label.center.set(0.5, 0);
    label.renderOrder = MARKER_RENDER_ORDER + 1;
    mesh.add(label);
  }
  return { data: o, mesh, label, placed: false };
}

function disposeMarker(m: Marker): void {
  m.mesh.removeFromParent();
  m.mesh.material.dispose();
  // Geometries are shared and label textures belong to the label cache.
  m.label?.material.dispose();
}

function place(m: Marker, o: ClientObject, resolveFloorY: FloorYResolver): void {
  m.data = o;
  const shape = shapeFor(o.objectType);
  m.mesh.geometry = shape.geometry;
  const floorY = resolveFloorY(o.floorId, o.x, o.y);
  // An unknown floor (e.g. floors still loading) has no height to put the marker at.
  m.placed = floorY !== null;
  if (floorY !== null) m.mesh.position.set(o.x, floorY + shape.halfHeight, -o.y);
  if (m.label && o.objectId !== null) {
    // Asked on every update so a long-lived label stays recent in the cache.
    const texture = getLabelTexture(o.objectId);
    const material = m.label.material;
    if (material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
    const aspect = (texture.userData.aspect as number | undefined) ?? 1;
    m.label.scale.set(LABEL_HEIGHT * aspect, LABEL_HEIGHT, 1);
    m.label.position.set(0, shape.halfHeight + LABEL_GAP_M, 0);
  }
}

/**
 * Tracked objects of the watched site, read from the realtime store every frame. Meshes are
 * managed outside React so 300 moving, fading objects never trigger a re-render.
 */
export function ObjectMarkers({ siteId, resolveFloorY }: ObjectMarkersProps) {
  const group = useRef<Group>(null);
  const [markers] = useState(() => new Map<string, Marker>());
  const placedWith = useRef<FloorYResolver | null>(null);
  const lastPrune = useRef(-Infinity);

  useEffect(
    () => () => {
      for (const m of markers.values()) disposeMarker(m);
      markers.clear();
    },
    [markers],
  );

  useFrame(() => {
    const root = group.current;
    if (!root) return;
    const now = realtimeNow();
    if (now - lastPrune.current >= PRUNE_INTERVAL_MS) {
      lastPrune.current = now;
      useRealtimeStore.getState().prune(now);
    }
    const state = useRealtimeStore.getState();
    const objects = state.siteId === siteId ? state.objects : null;
    const selectedFloorId = useViewStore.getState().selectedFloorId;
    const replace = placedWith.current !== resolveFloorY;
    placedWith.current = resolveFloorY;

    for (const [key, m] of markers) {
      if (objects?.has(key)) continue;
      disposeMarker(m);
      markers.delete(key);
    }
    if (!objects) return;

    for (const [key, o] of objects) {
      let m = markers.get(key);
      if (!m) {
        m = createMarker(o);
        markers.set(key, m);
        root.add(m.mesh);
        place(m, o, resolveFloorY);
      } else if (m.data !== o || replace) {
        place(m, o, resolveFloorY);
      }
      const opacity = objectOpacity(now - o.lastSeenMs);
      m.mesh.material.opacity = opacity;
      if (m.label) m.label.material.opacity = opacity;
      m.mesh.visible = m.placed && opacity > 0 && isOnSelectedFloor(o.floorId, selectedFloorId);
    }
  });

  return <group ref={group} />;
}
