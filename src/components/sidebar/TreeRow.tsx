import { memo, useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { useTreeStore } from '../../stores/useTreeStore';
import { INDENTATION_WIDTH } from '../../lib/treeProjection';
import type { FlatTreeRow } from '../../types/tree';

interface TreeRowProps {
  row: FlatTreeRow;
  /** Profondeur à afficher : celle projetée pendant un drag, sinon la réelle. */
  depth: number;
  isActive: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  /** Rendu dans le `DragOverlay` : pas de sortable, pas d'actions. */
  isOverlay?: boolean;
}

/**
 * Ligne de l'arborescence.
 *
 * Mémoïsée : un drag re-rend la liste à chaque frame, et seule la ligne
 * survolée change réellement de props.
 */
export const TreeRow = memo(function TreeRow({
  row,
  depth,
  isActive,
  isSelected,
  isRenaming,
  isOverlay = false,
}: TreeRowProps) {
  const { item, hasChildren, isExpanded } = row;

  const toggleExpanded = useTreeStore((s) => s.toggleExpanded);
  const selectItem = useTreeStore((s) => s.selectItem);
  const openBoard = useTreeStore((s) => s.openBoard);
  const beginRename = useTreeStore((s) => s.beginRename);
  const renameItem = useTreeStore((s) => s.renameItem);
  const createItem = useTreeStore((s) => s.createItem);
  const deleteItem = useTreeStore((s) => s.deleteItem);

  const sortable = useSortable({ id: item.id, disabled: isOverlay });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;

  const isFolder = item.type === 'folder';

  const handleActivate = () => {
    selectItem(item.id);
    if (isFolder) toggleExpanded(item.id);
    else openBoard(item.id);
  };

  return (
    <li
      ref={isOverlay ? undefined : setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        paddingLeft: `${depth * INDENTATION_WIDTH}px`,
      }}
      className={[
        'group relative list-none my-0.5',
        isDragging && !isOverlay ? 'opacity-40' : '',
        isOverlay ? 'rounded-full bg-white shadow-xl dark:bg-slate-800' : '',
      ].join(' ')}
    >
      <div
        {...(isOverlay || isRenaming ? {} : attributes)}
        {...(isOverlay || isRenaming ? {} : listeners)}
        onClick={isRenaming ? undefined : handleActivate}
        className={[
          'flex h-8 cursor-pointer items-center gap-2 rounded-full px-2.5 text-xs font-medium transition-all duration-150',
          isActive
            ? 'bg-[#d3e3fd] text-[#041e49] font-bold shadow-xs dark:bg-[#004a77] dark:text-[#c2e7ff]'
            : isSelected
              ? 'bg-slate-200/70 text-slate-900 dark:bg-slate-800/80 dark:text-slate-100'
              : 'text-slate-700 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:bg-slate-800/50',
        ].join(' ')}
      >
        <span
          role="button"
          tabIndex={-1}
          aria-label={isExpanded ? 'Replier' : 'Déplier'}
          onClick={(event) => {
            event.stopPropagation();
            if (isFolder) toggleExpanded(item.id);
          }}
          className="flex size-4 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          {isFolder && hasChildren ? (
            isExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )
          ) : null}
        </span>

        <span className={isActive ? 'shrink-0 text-[#0b57d0] dark:text-[#a8c7fa]' : 'shrink-0 text-slate-500 dark:text-slate-400'}>
          {item.icon ? (
            <span className="text-sm leading-none">{item.icon}</span>
          ) : isFolder ? (
            isExpanded ? (
              <FolderOpen className="size-4" />
            ) : (
              <Folder className="size-4" />
            )
          ) : (
            <FileText className="size-4" />
          )}
        </span>

        {isRenaming && !isOverlay ? (
          <RenameInput
            initialValue={item.title}
            onCommit={(value) => void renameItem(item.id, value.trim() || item.title)}
            onCancel={() => beginRename(null)}
          />
        ) : (
          <span className="truncate">{item.title}</span>
        )}

        {!isOverlay && !isRenaming && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {isFolder && (
              <IconButton
                label="Nouveau tableau dans ce dossier"
                onClick={() => void createItem('board', item.id)}
              >
                <Plus className="size-3.5" />
              </IconButton>
            )}
            {/* Le renommage est une action explicite, à côté de la suppression :
                le déclencher au double-clic sur la ligne le rendait accidentel,
                puisque le clic sert déjà à ouvrir le tableau. */}
            <IconButton label="Renommer" onClick={() => beginRename(item.id)}>
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton
              label="Supprimer"
              onClick={() => void deleteItem(item.id)}
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </span>
        )}
      </div>
    </li>
  );
});

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-300/60 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
    >
      {children}
    </button>
  );
}

function RenameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      autoFocus
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') onCommit(value);
        if (event.key === 'Escape') onCancel();
      }}
      onKeyUp={(event) => event.stopPropagation()}
      className="min-w-0 flex-1 rounded-full border border-[#0b57d0] bg-white px-2 py-0.5 text-xs outline-none shadow-xs dark:bg-slate-900 dark:border-[#a8c7fa]"
    />
  );
}
