import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  FolderPlus,
  SquarePlus,
  Settings,
  Folder,
  PanelLeftClose,
} from 'lucide-react';

import { TreeRow } from './TreeRow';
import { useTreeStore, useVisibleRows } from '../../stores/useTreeStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import {
  getProjection,
  removeDescendants,
  type Projection,
} from '../../lib/treeProjection';

export function Sidebar() {
  const rows = useVisibleRows();
  const status = useTreeStore((s) => s.status);
  const selectedId = useTreeStore((s) => s.selectedId);
  const activeBoardId = useTreeStore((s) => s.activeBoardId);
  const renamingId = useTreeStore((s) => s.renamingId);
  const createItem = useTreeStore((s) => s.createItem);
  const moveItem = useTreeStore((s) => s.moveItem);
  const setExpanded = useTreeStore((s) => s.setExpanded);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const isSidebarOpen = useSettingsStore((s) => s.isSidebarOpen);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  // Pendant le drag, le sous-arbre déplacé disparaît de la liste.
  const visibleRows = useMemo(() => {
    return draggedId ? removeDescendants(rows, [draggedId]) : rows;
  }, [rows, draggedId]);

  const projection: Projection | null = useMemo(
    () =>
      draggedId && overId
        ? getProjection(visibleRows, draggedId, overId, offsetX)
        : null,
    [visibleRows, draggedId, overId, offsetX],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reset = () => {
    setDraggedId(null);
    setOverId(null);
    setOffsetX(0);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setDraggedId(id);
    setOverId(id);
    setExpanded(id, false);
  };

  const handleDragMove = ({ delta }: DragMoveEvent) => setOffsetX(delta.x);

  const handleDragOver = ({ over }: DragOverEvent) =>
    setOverId(over ? String(over.id) : null);

  const handleDragEnd = ({ active }: DragEndEvent) => {
    const id = String(active.id);
    if (projection) {
      void moveItem(id, { parentId: projection.parentId, index: projection.index });
    }
    reset();
  };

  const draggedRow = draggedId
    ? rows.find((row) => row.item.id === draggedId)
    : undefined;

  return (
    <aside
      className={[
        'flex shrink-0 flex-col border-r border-black/5 bg-[#E9EEF6] dark:border-white/5 dark:bg-[#1B1D22] font-sans-google select-none transition-all duration-300 ease-in-out overflow-hidden',
        isSidebarOpen ? 'w-60 opacity-100' : 'w-0 opacity-0 border-r-0 pointer-events-none',
      ].join(' ')}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-2 px-3.5 pt-4 pb-3 border-b border-black/5 dark:border-white/5 min-w-[240px]">
        <div className="flex size-7.5 items-center justify-center rounded-xl bg-[#0B57D0] text-white font-bold shadow-md dark:bg-[#A8C7FA] dark:text-[#041E49]">
          <span className="text-xs font-extrabold">B</span>
        </div>
        <span className="text-sm font-bold tracking-tight text-[#1F1F1F] dark:text-[#E3E2E6]">
          Boardy
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="font-mono-google text-[8px] font-medium text-slate-500 dark:text-slate-400 bg-black/5 dark:bg-white/10 rounded-full px-1.5 py-0.5">
            LOCAL
          </span>
          <button
            type="button"
            title="Paramètres"
            aria-label="Paramètres"
            onClick={openSettings}
            className="flex size-7 items-center justify-center rounded-xl text-slate-500 hover:bg-black/5 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100 transition-all cursor-pointer"
          >
            <Settings className="size-4" />
          </button>
          <button
            type="button"
            title="Masquer la barre latérale (Ctrl+B)"
            aria-label="Masquer la barre latérale"
            onClick={toggleSidebar}
            className="flex size-7 items-center justify-center rounded-xl text-slate-500 hover:bg-black/5 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100 transition-all cursor-pointer"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </div>

      {/* Primary Action Button (FAB style) */}
      <div className="px-3 pt-4 pb-3 flex gap-2">
        <button
          type="button"
          onClick={() => void createItem('board', null)}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B57D0] px-3 py-2 text-xs font-semibold text-white shadow-md shadow-[#0B57D0]/20 transition-all hover:bg-[#0842A0] hover:shadow-lg active:scale-[0.98] dark:bg-[#A8C7FA] dark:text-[#041E49] dark:hover:bg-[#8AB4F8]"
        >
          <SquarePlus className="size-3.5" />
          Nouveau
        </button>
        <button
          type="button"
          title="Nouveau dossier"
          aria-label="Nouveau dossier"
          onClick={() => void createItem('folder', null)}
          className="flex size-8 items-center justify-center rounded-xl bg-white/70 dark:bg-[#272A30] text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-[#32353C] shadow-xs transition-colors shrink-0"
        >
          <FolderPlus className="size-3.5" />
        </button>
      </div>

      {/* Section Label */}
      <div className="px-3.5 pt-2 pb-1 flex items-center justify-between">
        <span className="font-mono-google text-[9px] font-medium tracking-wider text-slate-500 dark:text-slate-400 uppercase">
          ESPACE DE TRAVAIL
        </span>
      </div>

      {status === 'loading' && (
        <p className="px-4 py-2 font-mono-google text-xs text-slate-500 dark:text-slate-400">
          Chargement…
        </p>
      )}
      {status === 'ready' && rows.length === 0 && (
        <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Aucun tableau pour l'instant.
        </div>
      )}

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={reset}
        >
          <SortableContext
            items={visibleRows.map((row) => row.item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-1">
              {visibleRows.map((row) => (
                <TreeRow
                  key={row.item.id}
                  row={row}
                  depth={
                    projection && row.item.id === draggedId
                      ? projection.depth
                      : row.depth
                  }
                  isActive={row.item.id === activeBoardId}
                  isSelected={row.item.id === selectedId}
                  isRenaming={row.item.id === renamingId}
                />
              ))}
            </ul>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {draggedRow ? (
              <TreeRow
                row={draggedRow}
                depth={0}
                isActive={false}
                isSelected={false}
                isRenaming={false}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Bottom Section: Separator & Fixed Items */}
      <div className="px-3 py-2 border-t border-black/5 dark:border-white/5 flex flex-col gap-1">
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/5 cursor-pointer transition-colors">
          <Folder className="size-4 text-slate-400 shrink-0" />
          <span>Projets perso</span>
        </div>
      </div>
    </aside>
  );
}
