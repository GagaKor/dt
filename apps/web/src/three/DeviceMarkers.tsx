import type { Device, Floor, FloorRange } from '@dt/shared';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, type Ref } from 'react';
import { DoubleSide, type Group, type Object3D } from 'three';
import { useViewStore } from '../state/viewStore';
import { frustumClipPlanes } from './cameraFrustum';
import { deviceQuaternion } from './devicePose';
import { createOccluder, viewshedGeometry, type Occluder } from './viewshed';

/** Pointer travel (px) between down and up beyond which a click counts as a drag. */
export const CLICK_SLOP_PX = 4;

export interface DeviceMarkersProps {
  devices: Device[];
  selectedId: string | null;
  /** Leave out to let clicks pass through the markers (e.g. while placing devices). */
  onSelect?: (id: string) => void;
  /** Receives the selected marker's root, e.g. to attach TransformControls to it. */
  selectedRef?: Ref<Group>;
  /** Keeps each camera's viewing pyramid inside its floor's height range when given. */
  floors?: Floor[];
  /** Model whose opaque surfaces stop the cameras' views (walls, ceilings, floors). */
  model?: Object3D | null;
  /** Camera whose viewing range is hidden, e.g. while it is dragged and the range is stale. */
  hideRangeOf?: string | null;
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

interface FrustumProps {
  device: Device;
  hfovDeg: number;
  rangeM: number;
  floor?: FloorRange;
  occluder: Occluder | null;
}

/** What a camera sees: its viewing pyramid cut where walls block it and kept within its floor. */
function Frustum({ device, hfovDeg, rangeM, floor, occluder }: FrustumProps) {
  const [x, y, z] = device.position;
  const { yawDeg, pitchDeg } = device;
  const { surface: geometry, outline: edges } = useMemo(
    () =>
      viewshedGeometry({
        hfovDeg,
        rangeM,
        position: [x, y, z],
        quaternion: deviceQuaternion(yawDeg, pitchDeg),
        occluder,
      }),
    [hfovDeg, rangeM, x, y, z, yawDeg, pitchDeg, occluder],
  );
  const min = floor?.elevationMin;
  const max = floor?.elevationMax;
  const clippingPlanes = useMemo(
    () =>
      frustumClipPlanes(
        min === undefined || max === undefined
          ? undefined
          : { elevationMin: min, elevationMax: max },
      ),
    [min, max],
  );
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
          clippingPlanes={clippingPlanes}
        />
      </mesh>
      <lineSegments geometry={edges} raycast={noRaycast} renderOrder={2}>
        <lineBasicMaterial color={FRUSTUM_COLOR} clippingPlanes={clippingPlanes} />
      </lineSegments>
    </>
  );
}

interface MarkerProps {
  device: Device;
  floor?: FloorRange;
  occluder: Occluder | null;
  showRange: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
  objectRef?: Ref<Group>;
}

function Marker({
  device,
  floor,
  occluder,
  showRange,
  selected,
  onSelect,
  objectRef,
}: MarkerProps) {
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
          {showRange && (
            <Frustum
              device={device}
              hfovDeg={device.hfovDeg ?? FALLBACK_HFOV_DEG}
              rangeM={device.rangeM ?? FALLBACK_RANGE_M}
              floor={floor}
              occluder={occluder}
            />
          )}
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
export function DeviceMarkers({
  devices,
  selectedId,
  onSelect,
  selectedRef,
  floors,
  model,
  hideRangeOf = null,
}: DeviceMarkersProps) {
  const floorId = useViewStore((s) => s.selectedFloorId);
  const shown = floorId ? devices.filter((d) => d.floorId === floorId) : devices;
  const floorById = useMemo(() => new Map((floors ?? []).map((f) => [f.id, f])), [floors]);
  const occluder = useMemo(() => (model ? createOccluder(model) : null), [model]);
  useEffect(() => () => occluder?.dispose?.(), [occluder]);
  return (
    <>
      {shown.map((d) => (
        <Marker
          key={d.id}
          device={d}
          floor={floorById.get(d.floorId)}
          occluder={occluder}
          showRange={d.id !== hideRangeOf}
          selected={d.id === selectedId}
          onSelect={onSelect}
          objectRef={d.id === selectedId ? selectedRef : undefined}
        />
      ))}
    </>
  );
}
