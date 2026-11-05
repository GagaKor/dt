import type { Alarm, Device } from '@dt/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, MeshBasicMaterial, RingGeometry, type Group } from 'three';
import { useViewStore } from '../state/viewStore';
import { alarmFloorId, alarmPoint } from './alarmPoint';
import { isOnSelectedFloor } from './floorFilter';
import type { FloorYResolver } from './floorSurface';
import { MARKER_RENDER_ORDER } from './ObjectMarkers';

export interface AlarmRingsProps {
  alarms: Alarm[];
  devices: Device[];
  resolveFloorY: FloorYResolver;
}

export const ALARM_RING_COLOR = '#ff4d4f';
const PULSE_PERIOD_S = 1.2;

let ringGeometry: RingGeometry | null = null;

// Shared by every ring; lies flat in the model's XZ plane.
function sharedRingGeometry(): RingGeometry {
  ringGeometry ??= new RingGeometry(0.75, 1.05, 48).rotateX(-Math.PI / 2);
  return ringGeometry;
}

const noRaycast = () => {};

/**
 * Pulsing red rings at unacknowledged alarms; acknowledged ones leave the list and vanish.
 * With a floor selected, only that floor's alarms get a ring.
 */
export function AlarmRings({ alarms, devices, resolveFloorY }: AlarmRingsProps) {
  const group = useRef<Group>(null);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: ALARM_RING_COLOR,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const selectedFloorId = useViewStore((s) => s.selectedFloorId);
  const rings = useMemo(() => {
    const byId = new Map(devices.map((d) => [d.id, d]));
    return alarms.flatMap((a) => {
      const device = byId.get(a.deviceId);
      if (!isOnSelectedFloor(alarmFloorId(a, device), selectedFloorId)) return [];
      const p = alarmPoint(a, device, resolveFloorY);
      return p ? [{ id: a.id, position: p }] : [];
    });
  }, [alarms, devices, resolveFloorY, selectedFloorId]);

  useFrame(({ clock }) => {
    const k = 0.5 + 0.5 * Math.sin((clock.elapsedTime * 2 * Math.PI) / PULSE_PERIOD_S);
    material.opacity = 0.45 + 0.5 * k;
    const scale = 0.8 + 0.5 * k;
    for (const ring of group.current?.children ?? []) ring.scale.setScalar(scale);
  });

  return (
    <group ref={group}>
      {rings.map((r) => (
        <mesh
          key={r.id}
          geometry={sharedRingGeometry()}
          material={material}
          position={r.position}
          renderOrder={MARKER_RENDER_ORDER}
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}
