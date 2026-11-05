/**
 * Whether something on `floorId` is shown while `selectedFloorId` is picked in the viewer:
 * everything with no floor picked, otherwise only things known to be on that floor.
 */
export function isOnSelectedFloor(floorId: string | null, selectedFloorId: string | null): boolean {
  return selectedFloorId === null || floorId === selectedFloorId;
}
