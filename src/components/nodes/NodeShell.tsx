import type { ReactNode } from 'react';
import { Handle, NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import { Palette, Pencil, Trash2 } from 'lucide-react';

import { useCanvasStore } from '../../stores/useCanvasStore';
import type { NoteColor } from '../../types/canvas';

/**
 * Enveloppe commune à tous les nœuds : cadre, poignées de connexion,
 * redimensionnement et barre d'outils flottante.
 *
 * Les classes de couleur sont écrites en toutes lettres : Tailwind v4 analyse
 * les sources statiquement, une classe composée à l'exécution
 * (`bg-${color}-100`) ne serait jamais générée.
 */
const COLOR_CLASSES: Record<NoteColor, string> = {
  yellow: 'bg-[#fef7e0] border-[#f5e49a] text-slate-800 dark:bg-[#342900] dark:border-[#524100] dark:text-amber-100',
  amber: 'bg-[#fff0d4] border-[#ffd699] text-slate-800 dark:bg-[#3d2400] dark:border-[#5e3800] dark:text-amber-100',
  lime: 'bg-[#e6f4ea] border-[#b7e1cd] text-slate-800 dark:bg-[#11321d] dark:border-[#1d5230] dark:text-emerald-100',
  sky: 'bg-[#e8f0fe] border-[#aecbfa] text-slate-800 dark:bg-[#0c2d58] dark:border-[#174ea6] dark:text-blue-100',
  violet: 'bg-[#f3e8fd] border-[#d7aefb] text-slate-800 dark:bg-[#32174d] dark:border-[#542880] dark:text-purple-100',
  rose: 'bg-[#fce8e6] border-[#f6aea9] text-slate-800 dark:bg-[#461215] dark:border-[#731f24] dark:text-rose-100',
  slate: 'bg-[#E0E4EB] border-[#CBD2DC] text-slate-900 dark:bg-[#282B33] dark:border-[#3E434F] dark:text-slate-100',
  white: 'bg-white border-slate-200/90 text-slate-900 dark:bg-[#1E2025] dark:border-slate-700/80 dark:text-slate-100',
};

export const SWATCH_CLASSES: Record<NoteColor, string> = {
  yellow: 'bg-[#fdd835]',
  amber: 'bg-[#fb8c00]',
  lime: 'bg-[#43a047]',
  sky: 'bg-[#1e88e5]',
  violet: 'bg-[#8e24aa]',
  rose: 'bg-[#e53935]',
  slate: 'bg-slate-400',
  white: 'bg-white border border-slate-300 dark:border-slate-600 dark:bg-slate-200',
};

export const NOTE_COLORS = Object.keys(COLOR_CLASSES) as NoteColor[];

/**
 * Aspect du cadre. Les notes n'ont plus de titre : c'est la seule chose qui
 * distingue un post-it d'un document, la différence doit donc se lire d'un coup
 * d'œil, de loin et sans survol.
 *
 * - `sticky`   : carré, coins nets, ombre portée franche — un papier posé.
 * - `document` : coins arrondis, liseré supérieur, ombre discrète — une feuille.
 * - `panel`    : l'aspect historique, conservé pour les listes, PDF et groupes.
 */
export type NodeSurface = 'sticky' | 'document' | 'panel';

const SURFACE_CLASSES: Record<NodeSurface, string> = {
  sticky: 'rounded-xl border border-black/5 dark:border-white/5 shadow-md shadow-black/4',
  document: 'rounded-2xl border border-black/5 dark:border-white/5 shadow-md shadow-black/4',
  panel: 'rounded-2xl border border-black/5 dark:border-white/5 shadow-md shadow-black/4',
};

const HANDLE_POSITIONS = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

interface NodeShellProps {
  nodeId: string;
  selected: boolean;
  isEditing?: boolean;
  color?: NoteColor;
  onColorChange?: (color: NoteColor) => void;
  onRename?: () => void;
  resizable?: boolean;
  minWidth?: number;
  minHeight?: number;
  surface?: NodeSurface;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function NodeShell({
  nodeId,
  selected,
  isEditing = false,
  color = 'slate',
  onColorChange,
  onRename,
  resizable = true,
  minWidth = 160,
  minHeight = 100,
  surface = 'panel',
  header,
  children,
  className = '',
}: NodeShellProps) {
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);

  return (
    <>
      {resizable && (
        <NodeResizer
          isVisible={selected && !isEditing}
          minWidth={minWidth}
          minHeight={minHeight}
          lineClassName="!border-transparent"
          lineStyle={{ borderColor: 'transparent' }}
          handleClassName="!size-3.5 !rounded-md !bg-[var(--boardy-accent)] !border-2 !border-white dark:!border-slate-900 !shadow-md hover:!scale-125 transition-transform"
        />
      )}

      <NodeToolbar
        isVisible={selected && !isEditing}
        position={Position.Top}
        offset={14}
        className="!z-[9999]"
      >
        <div className="flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-4 py-1.5 shadow-2xl backdrop-blur-md dark:border-slate-800/90 dark:bg-[#1B1D22]/95 text-xs font-semibold text-[#1F1F1F] dark:text-[#E3E2E6]">
          {onColorChange && (
            <div className="flex items-center gap-2 pr-2 border-r border-black/10 dark:border-white/10">
              <Palette className="size-4 text-slate-400 shrink-0" />
              <div className="flex items-center gap-1.5">
                {NOTE_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`Couleur ${swatch}`}
                    onClick={() => onColorChange(swatch)}
                    className={`size-4.5 rounded-full transition-transform hover:scale-125 focus:outline-none cursor-pointer ${SWATCH_CLASSES[swatch]}`}
                  />
                ))}
              </div>
            </div>
          )}
          {onRename && (
            <button
              type="button"
              aria-label="Renommer le nœud"
              onClick={onRename}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[#0B57D0] hover:bg-[#0B57D0]/10 dark:text-[#A8C7FA] dark:hover:bg-[#A8C7FA]/20 transition-colors cursor-pointer"
            >
              <Pencil className="size-4" />
              <span>Renommer</span>
            </button>
          )}
          <button
            type="button"
            aria-label="Supprimer le nœud"
            onClick={() => void deleteNodes([nodeId])}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
          >
            <Trash2 className="size-4" />
            <span>Supprimer</span>
          </button>
        </div>
      </NodeToolbar>

      <div
        className={[
          'flex size-full flex-col overflow-hidden transition-all duration-200',
          SURFACE_CLASSES[surface],
          COLOR_CLASSES[color],
          selected && !isEditing
            ? 'ring-2 ring-[var(--boardy-accent)] border-transparent shadow-xl'
            : 'hover:shadow-lg',
          className,
        ].join(' ')}
      >
        {header && (
          <div className="flex items-center gap-2 border-b border-black/5 dark:border-white/5 px-3 py-2 text-xs font-semibold text-[#1F1F1F] dark:text-[#E3E2E6]">
            {header}
          </div>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </div>

      {!isEditing &&
        HANDLE_POSITIONS.map(({ id, position }) => (
          <Handle
            key={id}
            id={id}
            type="source"
            position={position}
            className="react-flow__handle"
          />
        ))}
    </>
  );
}
