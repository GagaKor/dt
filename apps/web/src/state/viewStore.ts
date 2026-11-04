import { create } from 'zustand';
import type { ViewPose } from '../three/viewPresets';

export interface ViewState {
  selectedFloorId: string | null;
  setSelectedFloor(id: string | null): void;
  /** Pending camera move; SiteCanvas consumes it and resets it to null. */
  flyTo: ViewPose | null;
  requestFlyTo(v: ViewPose | null): void;
}

export const useViewStore = create<ViewState>()((set) => ({
  selectedFloorId: null,
  setSelectedFloor: (id) => set({ selectedFloorId: id }),
  flyTo: null,
  requestFlyTo: (v) => set({ flyTo: v }),
}));
