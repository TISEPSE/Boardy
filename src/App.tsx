import { useEffect } from 'react';

import { BoardCanvas } from './components/canvas/BoardCanvas';
import { BoardsDashboard } from './components/dashboard/BoardsDashboard';
import { SettingsPage } from './components/settings/SettingsPage';
import { useTreeStore } from './stores/useTreeStore';
import { useSettingsStore, applyTheme } from './stores/useSettingsStore';

export function App() {
  const loadTree = useTreeStore((s) => s.loadTree);
  const activeBoardId = useTreeStore((s) => s.activeBoardId);
  const theme = useSettingsStore((s) => s.theme);
  const isSettingsOpen = useSettingsStore((s) => s.isSettingsOpen);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyTheme('system');
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [theme]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  return (
    <div className="flex h-full w-full bg-[#F0F4F9] text-[#1F1F1F] dark:bg-[#111318] dark:text-[#E3E2E6] font-sans-google overflow-hidden">
      {isSettingsOpen ? (
        <SettingsPage />
      ) : activeBoardId ? (
        <BoardCanvas key={activeBoardId} boardId={activeBoardId} />
      ) : (
        <BoardsDashboard />
      )}
    </div>
  );
}
