import { modelToPlan, type Floor } from '@dt/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Matrix4, Raycaster, Vector2, type Object3D } from 'three';
import { useViewStore } from '../state/viewStore';
import { floorAtElevation } from './floorClipping';
import { pickFloorHit } from './pickFloorHit';

export interface CoordinateReadoutProps {
  /** Model root to probe; the original scene from useSiteModel, not the clipped clones. */
  model: Object3D | null;
  floors: Floor[];
}

/**
 * Shows the plan coordinates under the pointer. Must be rendered inside SiteCanvas;
 * the label is a plain DOM node over the canvas so pointer moves never re-render React.
 */
export function CoordinateReadout({ model, floors }: CoordinateReadoutProps) {
  const { t, i18n } = useTranslation();
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const selectedFloorId = useViewStore((s) => s.selectedFloorId);
  const selected = floors.find((f) => f.id === selectedFloorId) ?? null;
  const [label] = useState(() => document.createElement('div'));
  const [raycaster] = useState(() => new Raycaster());
  const [pointer] = useState(() => new Vector2());
  const inside = useRef(false);
  const lastCamera = useRef(new Matrix4());
  const dirty = useRef(true);

  useEffect(() => {
    label.className =
      'pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/70 px-2 py-1 font-mono text-xs text-white';
    label.hidden = true;
    gl.domElement.parentElement?.appendChild(label);
    return () => label.remove();
  }, [gl, label]);

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      inside.current = true;
      dirty.current = true;
    };
    const onLeave = () => {
      inside.current = false;
      dirty.current = true;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, pointer]);

  useEffect(() => {
    dirty.current = true;
  }, [model, selected, floors, i18n.language]);

  useFrame(() => {
    if (inside.current && !lastCamera.current.equals(camera.matrixWorld)) {
      lastCamera.current.copy(camera.matrixWorld);
      dirty.current = true;
    }
    if (!dirty.current) return;
    dirty.current = false;

    let hit = null;
    if (inside.current && model) {
      raycaster.setFromCamera(pointer, camera);
      hit = pickFloorHit(raycaster.intersectObject(model, true), selected);
    }
    if (!hit) {
      label.hidden = true;
      return;
    }
    const { x, y } = modelToPlan({ X: hit.point.x, Z: hit.point.z });
    const floor = selected ?? floorAtElevation(floors, hit.point.y);
    const values = { x: x.toFixed(2), y: y.toFixed(2) };
    label.textContent = floor
      ? t('viewer.coordinates', { ...values, floor: floor.name })
      : t('viewer.coordinatesNoFloor', values);
    label.hidden = false;
  });

  return null;
}
