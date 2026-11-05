import { SEVERITIES, severityRank, type Alarm, type Device, type Severity } from '@dt/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, MeshBasicMaterial, RingGeometry, type Group } from 'three';
import { SEVERITY_COLOR } from '../components/severityStyles';
import { useViewStore } from '../state/viewStore';
import { alarmFloorId, alarmPoint, type ModelPoint } from './alarmPoint';
import { isOnSelectedFloor } from './floorFilter';
import type { FloorYResolver } from './floorSurface';
import { MARKER_RENDER_ORDER } from './ObjectMarkers';

export interface AlarmRingsProps {
  alarms: Alarm[];
  devices: Device[];
  resolveFloorY: FloorYResolver;
}

const PULSE_PERIOD_S = 1.2;

let ringGeometry: RingGeometry | null = null;

// Shared by every ring; lies flat in the model's XZ plane.
function sharedRingGeometry(): RingGeometry {
  ringGeometry ??= new RingGeometry(0.75, 1.05, 48).rotateX(-Math.PI / 2);
  return ringGeometry;
}

const noRaycast = () => {};

export interface AlarmRing {
  id: string;
  position: ModelPoint;
  severity: Severity;
  color: string;
  /** Higher draws later; rings ignore depth, so the most severe one shows where they overlap. */
  renderOrder: number;
}

/** Rings for unacknowledged alarms, colored by severity, limited to the selected floor if any. */
export function alarmRings(
  alarms: Alarm[],
  devices: Device[],
  resolveFloorY: FloorYResolver,
  selectedFloorId: string | null,
): AlarmRing[] {
  const byId = new Map(devices.map((d) => [d.id, d]));
  return alarms.flatMap((a) => {
    const device = byId.get(a.deviceId);
    if (!isOnSelectedFloor(alarmFloorId(a, device), selectedFloorId)) return [];
    const position = alarmPoint(a, device, resolveFloorY);
    if (!position) return [];
    return [
      {
        id: a.id,
        position,
        severity: a.severity,
        color: SEVERITY_COLOR[a.severity],
        renderOrder: MARKER_RENDER_ORDER + severityRank(a.severity),
      },
    ];
  });
}

/**
 * Pulsing rings at unacknowledged alarms in their severity color; acknowledged ones leave the list
 * and vanish. With a floor selected, only that floor's alarms get a ring.
 */
export function AlarmRings({ alarms, devices, resolveFloorY }: AlarmRingsProps) {
  const group = useRef<Group>(null);
  const materials = useMemo(
    () =>
      Object.fromEntries(
        SEVERITIES.map((s) => [
          s,
          new MeshBasicMaterial({
            color: SEVERITY_COLOR[s],
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: DoubleSide,
          }),
        ]),
      ) as Record<Severity, MeshBasicMaterial>,
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  const selectedFloorId = useViewStore((s) => s.selectedFloorId);
  const rings = useMemo(
    () => alarmRings(alarms, devices, resolveFloorY, selectedFloorId),
    [alarms, devices, resolveFloorY, selectedFloorId],
  );

  useFrame(({ clock }) => {
    const k = 0.5 + 0.5 * Math.sin((clock.elapsedTime * 2 * Math.PI) / PULSE_PERIOD_S);
    for (const m of Object.values(materials)) m.opacity = 0.45 + 0.5 * k;
    const scale = 0.8 + 0.5 * k;
    for (const ring of group.current?.children ?? []) ring.scale.setScalar(scale);
  });

  return (
    <group ref={group}>
      {rings.map((r) => (
        <mesh
          key={r.id}
          geometry={sharedRingGeometry()}
          material={materials[r.severity]}
          position={r.position}
          renderOrder={r.renderOrder}
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}
