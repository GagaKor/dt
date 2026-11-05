import { create } from 'zustand';
import type { ViewPose } from '../three/viewPresets';

export interface ViewState {
  selectedFloorId: string | null;
  setSelectedFloor(id: string | null): void;
  /** With a floor selected, also draw the other floors faintly (hidden by default). */
  showOtherFloors: boolean;
  setShowOtherFloors(show: boolean): void;
  /** Pending camera move; SiteCanvas consumes it and resets it to null. */
  flyTo: ViewPose | null;
  requestFlyTo(v: ViewPose | null): void;
}

export const useViewStore = create<ViewState>()((set) => ({
  selectedFloorId: null,
  setSelectedFloor: (id) => set({ selectedFloorId: id }),
  showOtherFloors: false,
  setShowOtherFloors: (show) => set({ showOtherFloors: show }),
  flyTo: null,
  requestFlyTo: (v) => set({ flyTo: v }),
}));
