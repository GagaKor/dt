import type { Floor, FloorInput } from '@dt/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Floor edits that are not saved yet, per site. They outlive the settings page so a trip to
// device placement (or a reload) does not throw them away; saving or reverting clears them.
export interface FloorDraftState {
  drafts: Record<string, FloorInput[]>;
  setDraft(siteId: string, floors: FloorInput[]): void;
  clearDraft(siteId: string): void;
}

export const useFloorDraftStore = create<FloorDraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (siteId, floors) => set((s) => ({ drafts: { ...s.drafts, [siteId]: floors } })),
      clearDraft: (siteId) =>
        set((s) => {
          const { [siteId]: _dropped, ...rest } = s.drafts;
          return { drafts: rest };
        }),
    }),
    { name: 'dt.floorDrafts', storage: createJSONStorage(() => sessionStorage) },
  ),
);

const editable = (f: FloorInput) => [f.id ?? null, f.name, f.elevationMin, f.elevationMax];

/** Whether a draft differs from the saved floors in anything the floor editor can change. */
export function floorsChanged(draft: FloorInput[], saved: Floor[]): boolean {
  return JSON.stringify(draft.map(editable)) !== JSON.stringify(saved.map(editable));
}
