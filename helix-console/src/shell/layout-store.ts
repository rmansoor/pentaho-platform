import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Shell layout state. Only `railCollapsed` is persisted (per browser), so a user who collapses
 * the rail to get the full width keeps it that way across reloads. The mobile drawer always
 * starts closed.
 */
export interface LayoutState {
  railCollapsed: boolean;
  drawerOpen: boolean;
  toggleRail: () => void;
  setRailCollapsed: (collapsed: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
}

export const LAYOUT_STORAGE_KEY = 'helix.console.layout';

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      railCollapsed: false,
      drawerOpen: false,
      toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ railCollapsed: s.railCollapsed }),
    },
  ),
);
