import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Trame de fond du canvas, projetée sur `<Background variant>` de React Flow. */
export type CanvasBackground = 'dots' | 'grid' | 'lines' | 'plain';

/** Pas d'aimantation, en pixels du repère du canvas. */
export const GRID_SIZE = 16;

interface SettingsState {
  theme: ThemeMode;
  isSettingsOpen: boolean;
  isSidebarOpen: boolean;
  canvasBackground: CanvasBackground;
  showMinimap: boolean;
  snapToGrid: boolean;
  setTheme: (theme: ThemeMode) => void;
  openSettings: () => void;
  closeSettings: () => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCanvasBackground: (background: CanvasBackground) => void;
  setShowMinimap: (visible: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      isSettingsOpen: false,
      isSidebarOpen: true,
      canvasBackground: 'dots',
      showMinimap: true,
      snapToGrid: false,
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        applyTheme(next);
      },
      toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      setCanvasBackground: (canvasBackground) => set({ canvasBackground }),
      setShowMinimap: (showMinimap) => set({ showMinimap }),
      setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
    }),
    { name: 'boardy-settings' },
  ),
);

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  if (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
