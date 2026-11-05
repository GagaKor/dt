import type { FloorRange } from '@dt/shared';
import { useEffect, useMemo } from 'react';
import { BoxGeometry, EdgesGeometry, type Box3 } from 'three';
import { floorBandBox } from './floorBand';

export interface FloorRangeBandProps {
  bounds: Box3 | null;
  range: FloorRange | null;
}

const BAND_COLOR = '#2563eb';
const noRaycast = () => {};

/** Translucent box with outlined edges marking a floor's height range over the whole model. */
export function FloorRangeBand({ bounds, range }: FloorRangeBandProps) {
  const min = range?.elevationMin;
  const max = range?.elevationMax;
  const box = useMemo(
    () =>
      bounds && min !== undefined && max !== undefined
        ? floorBandBox(bounds, { elevationMin: min, elevationMax: max })
        : null,
    [bounds, min, max],
  );
  const geometry = useMemo(() => (box ? new BoxGeometry(...box.size) : null), [box]);
  const edges = useMemo(() => (geometry ? new EdgesGeometry(geometry) : null), [geometry]);
  useEffect(
    () => () => {
      geometry?.dispose();
      edges?.dispose();
    },
    [geometry, edges],
  );

  if (!box || !geometry || !edges) return null;
  return (
    <group position={box.center}>
      <mesh geometry={geometry} renderOrder={2} raycast={noRaycast}>
        <meshBasicMaterial color={BAND_COLOR} transparent opacity={0.07} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} renderOrder={3} raycast={noRaycast}>
        <lineBasicMaterial color={BAND_COLOR} transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
    </group>
  );
}
