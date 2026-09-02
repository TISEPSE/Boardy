import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Columns3, Plus, X } from 'lucide-react';

import { NodeShell } from './NodeShell';
import { useCanvasStore } from '../../stores/useCanvasStore';
import { createId } from '../../lib/id';
import type {
  KanbanCard,
  KanbanNode as KanbanNodeType,
  NoteColor,
} from '../../types/canvas';

function KanbanNodeComponent({ id, data, selected }: NodeProps<KanbanNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const cards: KanbanCard[] = data.cards ?? [];

  const setCards = (nextCards: KanbanCard[]) => updateNodeData(id, { cards: nextCards });

  const patchCard = (cardId: string, text: string) => {
    setCards(cards.map((c) => (c.id === cardId ? { ...c, text } : c)));
  };

  const addCard = () => {
    const newId = createId();
    setCards([...cards, { id: newId, text: 'Nouvelle tâche' }]);
    setIsTyping(true);
    queueMicrotask(() => {
      const el = document.getElementById(`kanban-input-${newId}`);
      el?.focus();
    });
  };

  const removeCard = (cardId: string) => {
    setCards(cards.filter((c) => c.id !== cardId));
  };

  const handleRename = useCallback(() => {
    setRenamingTitle(true);
    queueMicrotask(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    if (!selected) {
      setRenamingTitle(false);
      setIsTyping(false);
    }
  }, [selected]);

  return (
    <NodeShell
      nodeId={id}
      selected={selected ?? false}
      isEditing={renamingTitle || isTyping}
      color={data.color ?? 'amber'}
      onColorChange={(color: NoteColor) => updateNodeData(id, { color })}
      onRename={handleRename}
      minWidth={220}
      minHeight={160}
      header={
        <div className="flex w-full items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Columns3 className="size-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <input
              ref={titleInputRef}
              value={data.title}
              placeholder="Nom de la colonne"
              readOnly={!renamingTitle}
              onPointerDown={(e) => renamingTitle && e.stopPropagation()}
              onMouseDown={(e) => renamingTitle && e.stopPropagation()}
              onClick={(e) => renamingTitle && e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleRename();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') setRenamingTitle(false);
              }}
              onKeyUp={(e) => e.stopPropagation()}
              onBlur={() => setRenamingTitle(false)}
              onChange={(event) => updateNodeData(id, { title: event.target.value })}
              className={[
                'min-w-0 flex-1 bg-transparent font-sans-google font-bold text-xs text-[#1F1F1F] dark:text-[#E3E2E6] outline-none placeholder:text-slate-400 transition-all',
                renamingTitle
                  ? 'nodrag nopan pointer-events-auto bg-white/80 dark:bg-[#111318]/80 ring-1 ring-[#0B57D0] dark:ring-[#A8C7FA] rounded px-1.5 py-0.5'
                  : 'pointer-events-none select-none',
              ].join(' ')}
            />
          </div>
          <span className="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 font-mono-google text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            {cards.length}
          </span>
        </div>
      }
    >
      <div
        className={[
          'size-full overflow-y-auto p-2.5 font-sans-google nodrag nopan transition-colors flex flex-col gap-2',
          isDragOver ? 'bg-[#0B57D0]/5 dark:bg-[#A8C7FA]/10 ring-2 ring-inset ring-[#0B57D0]/40 rounded-b-2xl' : '',
        ].join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!isDragOver) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          try {
            const raw = e.dataTransfer.getData('application/json');
            if (!raw) return;
            const payload = JSON.parse(raw) as {
              sourceNodeId: string;
              itemId: string;
              text: string;
            };
            if (!payload.itemId) return;

            // If dropped in the same column, skip
            if (payload.sourceNodeId === id) return;

            // 1. Remove from source node (kanban or todo_list)
            const allNodes = useCanvasStore.getState().nodes;
            const sourceNode = allNodes.find((n) => n.id === payload.sourceNodeId);
            if (sourceNode) {
              if (sourceNode.type === 'kanban') {
                const srcData = sourceNode.data as { cards?: KanbanCard[] };
                if (srcData.cards) {
                  useCanvasStore.getState().updateNodeData(payload.sourceNodeId, {
                    cards: srcData.cards.filter((it) => it.id !== payload.itemId),
                  });
                }
              } else if (sourceNode.type === 'todo_list') {
                const srcData = sourceNode.data as { items?: Array<{ id: string }> };
                if (srcData.items) {
                  useCanvasStore.getState().updateNodeData(payload.sourceNodeId, {
                    items: srcData.items.filter((it) => it.id !== payload.itemId),
                  });
                }
              }
            }

            // 2. Add to this target column
            setCards([...cards, { id: payload.itemId, text: payload.text }]);
          } catch (err) {
            console.error('Erreur lors du déplacement de la carte', err);
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5 flex-1 min-h-[40px]">
          {cards.map((card) => (
            <div
              key={card.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    sourceNodeId: id,
                    itemId: card.id,
                    text: card.text,
                  }),
                );
                e.dataTransfer.effectAllowed = 'move';
              }}
              className="group/card relative flex items-start gap-2 rounded-xl border border-black/5 bg-white/95 dark:bg-[#1E2025]/95 p-2.5 shadow-xs transition-all hover:shadow-md dark:border-white/5 cursor-grab active:cursor-grabbing"
            >
              <textarea
                id={`kanban-input-${card.id}`}
                rows={1}
                value={card.text}
                placeholder="Tâche..."
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    addCard();
                  }
                  if (event.key === 'Escape') setIsTyping(false);
                }}
                onChange={(event) => {
                  patchCard(card.id, event.target.value);
                  event.target.style.height = 'auto';
                  event.target.style.height = `${event.target.scrollHeight}px`;
                }}
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = `${el.scrollHeight}px`;
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-xs text-[#1F1F1F] dark:text-[#E3E2E6] outline-none placeholder:text-slate-400 cursor-text leading-snug resize-none overflow-hidden break-words"
              />
              <button
                type="button"
                aria-label="Supprimer la carte"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  removeCard(card.id);
                }}
                className="pointer-events-auto shrink-0 size-5 flex items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-rose-100 hover:text-rose-600 group-hover/card:opacity-100 dark:hover:bg-rose-950/60 dark:hover:text-rose-400 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}

          {cards.length === 0 && (
            <div className="flex h-16 w-full items-center justify-center rounded-xl border border-dashed border-black/10 dark:border-white/10 text-[11px] font-medium text-slate-400">
              Glissez une carte ici
            </div>
          )}
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            addCard();
          }}
          className="pointer-events-auto flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/10 dark:border-white/10 py-1.5 text-xs font-semibold text-slate-500 hover:border-[#0B57D0]/40 hover:text-[#0B57D0] dark:text-slate-400 dark:hover:border-[#A8C7FA]/40 dark:hover:text-[#A8C7FA] transition-all cursor-pointer bg-white/40 dark:bg-white/5"
        >
          <Plus className="size-3.5" />
          <span>Ajouter une carte</span>
        </button>
      </div>
    </NodeShell>
  );
}

export const KanbanNode = memo(KanbanNodeComponent);
