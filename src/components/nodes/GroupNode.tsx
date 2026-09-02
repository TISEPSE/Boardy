import { memo, useCallback, useRef, useState } from 'react';
import { NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Lock, Palette, Pencil, Trash2, Unlock } from 'lucide-react';

import { useCanvasStore } from '../../stores/useCanvasStore';
import type { GroupNode as GroupNodeType, NoteColor } from '../../types/canvas';
import { NOTE_COLORS, SWATCH_CLASSES } from './NodeShell';

const GROUP_COLOR_STYLES: Record<NoteColor, { border: string; bg: string; dot: string }> = {
  yellow: {
    border: 'border-amber-400 dark:border-amber-500',
    bg: 'bg-amber-400/15 dark:bg-amber-400/20',
    dot: 'bg-amber-500',
  },
  amber: {
    border: 'border-amber-500 dark:border-amber-600',
    bg: 'bg-amber-500/15 dark:bg-amber-500/20',
    dot: 'bg-amber-600',
  },
  lime: {
    border: 'border-emerald-500 dark:border-emerald-400',
    bg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  sky: {
    border: 'border-blue-500 dark:border-blue-400',
    bg: 'bg-blue-500/15 dark:bg-blue-500/20',
    dot: 'bg-blue-500',
  },
  violet: {
    border: 'border-purple-500 dark:border-purple-400',
    bg: 'bg-purple-500/15 dark:bg-purple-500/20',
    dot: 'bg-purple-500',
  },
  rose: {
    border: 'border-rose-500 dark:border-rose-400',
    bg: 'bg-rose-500/15 dark:bg-rose-500/20',
    dot: 'bg-rose-500',
  },
  slate: {
    border: 'border-slate-400 dark:border-slate-500',
    bg: 'bg-slate-500/12 dark:bg-slate-400/18',
    dot: 'bg-slate-500',
  },
  white: {
    border: 'border-slate-300 dark:border-slate-600',
    bg: 'bg-white/40 dark:bg-white/5',
    dot: 'bg-slate-300',
  },
};

function GroupNodeComponent({ id, data, selected }: NodeProps<GroupNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const groupColor: NoteColor = data.color ?? 'sky';
  const colorStyle = GROUP_COLOR_STYLES[groupColor] || GROUP_COLOR_STYLES.sky;

  const handleRename = useCallback(() => {
    setRenamingTitle(true);
    queueMicrotask(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, []);

  return (
    <>
      <NodeResizer
        isVisible={(selected ?? false) && !renamingTitle}
        minWidth={240}
        minHeight={180}
        lineClassName="!border-transparent"
        lineStyle={{ borderColor: 'transparent' }}
        handleClassName="!size-3.5 !rounded-md !bg-[var(--boardy-accent)] !border-2 !border-white dark:!border-slate-900 !shadow-md hover:!scale-125 transition-transform"
      />

      <NodeToolbar
        isVisible={(selected ?? false) && !renamingTitle}
        position={Position.Top}
        offset={14}
        className="!z-[9999]"
      >
        <div className="nodrag nopan pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-4 py-1.5 shadow-2xl backdrop-blur-md dark:border-slate-800/90 dark:bg-[#1B1D22]/95 text-xs font-semibold text-[#1F1F1F] dark:text-[#E3E2E6]">
          <div className="flex items-center gap-2 pr-2 border-r border-black/10 dark:border-white/10">
            <Palette className="size-4 text-slate-400 shrink-0" />
            <div className="flex items-center gap-1.5">
              {NOTE_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Couleur ${swatch}`}
                  onClick={() => updateNodeData(id, { color: swatch })}
                  className={`size-4.5 rounded-full transition-transform hover:scale-125 focus:outline-none cursor-pointer ${SWATCH_CLASSES[swatch]}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            aria-label={data.locked ? 'Déverrouiller le groupe' : 'Verrouiller le groupe'}
            onClick={() => updateNodeData(id, { locked: !data.locked })}
            className={[
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors cursor-pointer',
              data.locked
                ? 'bg-[#0B57D0]/15 text-[#0B57D0] dark:bg-[#A8C7FA]/20 dark:text-[#A8C7FA] font-bold'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
            ].join(' ')}
          >
            {data.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
            <span>{data.locked ? 'Verrouillé' : 'Verrouiller'}</span>
          </button>

          <button
            type="button"
            aria-label="Renommer le groupe"
            onClick={handleRename}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[#0B57D0] hover:bg-[#0B57D0]/10 dark:text-[#A8C7FA] dark:hover:bg-[#A8C7FA]/20 transition-colors cursor-pointer"
          >
            <Pencil className="size-4" />
            <span>Renommer</span>
          </button>
          <button
            type="button"
            aria-label="Supprimer le groupe"
            onClick={() => void deleteNodes([id])}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
          >
            <Trash2 className="size-4" />
            <span>Supprimer</span>
          </button>
        </div>
      </NodeToolbar>

      <div
        className={[
          'relative size-full rounded-3xl border-2 border-dashed transition-all duration-200 pointer-events-auto',
          colorStyle.border,
          colorStyle.bg,
          selected && !renamingTitle ? 'shadow-md border-solid' : '',
        ].join(' ')}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!renamingTitle) handleRename();
          }}
          className={[
            'absolute -top-3.5 left-5 z-10 flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E2025] px-3.5 py-1 shadow-xs font-sans-google max-w-[calc(100%-40px)] cursor-pointer select-none transition-shadow',
            renamingTitle ? 'nodrag nopan ring-2 ring-[#0B57D0] dark:ring-[#A8C7FA]' : 'hover:shadow-sm',
          ].join(' ')}
        >
          {data.locked && <Lock className="size-3 text-[#0B57D0] dark:text-[#A8C7FA] shrink-0" />}

          {renamingTitle ? (
            <input
              ref={titleInputRef}
              autoFocus
              value={data.title ?? ''}
              placeholder="Nom du groupe"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') setRenamingTitle(false);
              }}
              onBlur={() => setRenamingTitle(false)}
              onChange={(event) => updateNodeData(id, { title: event.target.value })}
              className="nodrag nopan min-w-[60px] bg-transparent font-bold text-xs sm:text-sm text-[#1F1F1F] dark:text-[#E3E2E6] outline-none placeholder:text-slate-400"
              style={{
                width: `${Math.max(1, (data.title || 'Nom du groupe').length + 1)}ch`,
              }}
            />
          ) : (
            <span className="font-bold text-xs sm:text-sm text-[#1F1F1F] dark:text-[#E3E2E6] whitespace-nowrap leading-normal">
              {data.title || 'Nom du groupe'}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export const GroupNode = memo(GroupNodeComponent);
