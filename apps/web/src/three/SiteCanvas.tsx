import { CameraControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, type ReactNode } from 'react';
import type { Box3 } from 'three';
import { useViewStore } from '../state/viewStore';
import type { ModelState } from './useSiteModel';
import { VIEW_FOV_DEG, obliqueView, type ViewPose } from './viewPresets';

export interface SiteCanvasProps {
  bounds: Box3 | null;
  /** Exposed as `data-model-state` so tests can wait for the model. */
  modelState?: ModelState;
  children?: ReactNode;
}

function moveTo(controls: CameraControls, { position: p, target: t }: ViewPose, smooth: boolean) {
  void controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, smooth);
}

function ViewDriver({ bounds }: { bounds: Box3 | null }) {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const flyTo = useViewStore((s) => s.flyTo);

  useEffect(() => {
    if (controls && bounds) moveTo(controls, obliqueView(bounds), false);
  }, [controls, bounds]);

  // Waits for bounds so a request made while the model loads is not overridden
  // by the initial framing.
  useEffect(() => {
    if (!controls || !bounds || !flyTo) return;
    moveTo(controls, flyTo, true);
    useViewStore.getState().requestFlyTo(null);
  }, [controls, bounds, flyTo]);

  return null;
}

export function SiteCanvas({ bounds, modelState, children }: SiteCanvasProps) {
  return (
    <Canvas
      data-testid="canvas-3d"
      data-model-state={modelState}
      className="bg-slate-100 dark:bg-slate-900"
      camera={{ fov: VIEW_FOV_DEG, near: 0.1, far: 10_000, position: [30, 30, 30] }}
      dpr={[1, 2]}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[40, 80, 30]} intensity={1.6} />
      <CameraControls makeDefault />
      <ViewDriver bounds={bounds} />
      {children}
    </Canvas>
  );
}
