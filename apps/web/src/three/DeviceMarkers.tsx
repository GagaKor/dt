import type { Device } from '@dt/shared';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, type Ref } from 'react';
import { DoubleSide, EdgesGeometry, type Group } from 'three';
import { useViewStore } from '../state/viewStore';
import { cameraFrustumGeometry } from './cameraFrustum';
import { deviceQuaternion } from './devicePose';

/** Pointer travel (px) between down and up beyond which a click counts as a drag. */
export const CLICK_SLOP_PX = 4;

export interface DeviceMarkersProps {
  devices: Device[];
  selectedId: string | null;
  /** Leave out to let clicks pass through the markers (e.g. while placing devices). */
  onSelect?: (id: string) => void;
  /** Receives the selected marker's root, e.g. to attach TransformControls to it. */
  selectedRef?: Ref<Group>;
}

const FRUSTUM_COLOR = '#ffd666';
const SENSOR_COLOR = '#3fa7ff';
const CAMERA_COLOR = '#475569';
const SELECTED_COLOR = '#f97316';
const CAMERA_BOX_M = 0.3;
const SENSOR_RADIUS_M = 0.25;
// Fallbacks only for malformed rows; the server stores defaults for cameras.
const FALLBACK_HFOV_DEG = 90;
const FALLBACK_RANGE_M = 10;
const noRaycast = () => {};

function Frustum({ hfovDeg, rangeM }: { hfovDeg: number; rangeM: number }) {
  const geometry = useMemo(() => cameraFrustumGeometry(hfovDeg, rangeM), [hfovDeg, rangeM]);
  const edges = useMemo(() => new EdgesGeometry(geometry), [geometry]);
  // Passed by reference, so R3F does not own (or dispose) these geometries.
  useEffect(
    () => () => {
      geometry.dispose();
      edges.dispose();
    },
    [geometry, edges],
  );
  // The volume would swallow clicks on the model and on other devices behind it.
  return (
    <>
      <mesh geometry={geometry} raycast={noRaycast} renderOrder={2}>
        <meshBasicMaterial
          color={FRUSTUM_COLOR}
          transparent
          opacity={0.25}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edges} raycast={noRaycast} renderOrder={2}>
        <lineBasicMaterial color={FRUSTUM_COLOR} />
      </lineSegments>
    </>
  );
}

interface MarkerProps {
  device: Device;
  selected: boolean;
  onSelect?: (id: string) => void;
  objectRef?: Ref<Group>;
}

function Marker({ device, selected, onSelect, objectRef }: MarkerProps) {
  const { id, type, yawDeg, pitchDeg } = device;
  const quaternion = useMemo(() => deviceQuaternion(yawDeg, pitchDeg), [yawDeg, pitchDeg]);
  const onClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > CLICK_SLOP_PX) return;
        e.stopPropagation();
        onSelect(id);
      }
    : undefined;
  const color = selected ? SELECTED_COLOR : type === 'camera' ? CAMERA_COLOR : SENSOR_COLOR;

  return (
    <group ref={objectRef} position={device.position} quaternion={quaternion}>
      {type === 'camera' ? (
        <>
          <mesh onClick={onClick}>
            <boxGeometry args={[CAMERA_BOX_M, CAMERA_BOX_M, CAMERA_BOX_M]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <Frustum
            hfovDeg={device.hfovDeg ?? FALLBACK_HFOV_DEG}
            rangeM={device.rangeM ?? FALLBACK_RANGE_M}
          />
        </>
      ) : (
        <mesh onClick={onClick}>
          <sphereGeometry args={[SENSOR_RADIUS_M, 24, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}

/** Cameras and sensors of the selected floor (all floors when none is selected). */
export function DeviceMarkers({ devices, selectedId, onSelect, selectedRef }: DeviceMarkersProps) {
  const floorId = useViewStore((s) => s.selectedFloorId);
  const shown = floorId ? devices.filter((d) => d.floorId === floorId) : devices;
  return (
    <>
      {shown.map((d) => (
        <Marker
          key={d.id}
          device={d}
          selected={d.id === selectedId}
          onSelect={onSelect}
          objectRef={d.id === selectedId ? selectedRef : undefined}
        />
      ))}
    </>
  );
}
