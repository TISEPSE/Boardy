import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Check, Plus, X } from 'lucide-react';

import { NodeShell } from './NodeShell';
import { useCanvasStore } from '../../stores/useCanvasStore';
import { createId } from '../../lib/id';
import type { NoteColor, TodoItem, TodoListNode as TodoListNodeType } from '../../types/canvas';

function TodoListNodeComponent({ id, data, selected }: NodeProps<TodoListNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

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

  const setItems = (items: TodoItem[]) => updateNodeData(id, { items });

  const patchItem = (itemId: string, patch: Partial<TodoItem>) =>
    setItems(
      data.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );

  const addItem = () => {
    const newId = createId();
    setItems([...data.items, { id: newId, text: '', done: false }]);
    setIsTyping(true);
    queueMicrotask(() => {
      const el = document.getElementById(`todo-input-${newId}`);
      el?.focus();
    });
  };

  const done = data.items.filter((item) => item.done).length;

  return (
    <NodeShell
      nodeId={id}
      selected={selected ?? false}
      isEditing={renamingTitle || isTyping}
      color={data.color ?? 'white'}
      onColorChange={(color: NoteColor) => updateNodeData(id, { color })}
      onRename={handleRename}
      minWidth={220}
      minHeight={150}
      header={
        <>
          <input
            ref={titleInputRef}
            value={data.title}
            placeholder="Titre de la liste"
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
              renamingTitle ? 'nodrag nopan pointer-events-auto bg-white/80 dark:bg-[#111318]/80 ring-1 ring-[#0B57D0] dark:ring-[#A8C7FA] rounded px-1.5 py-0.5' : 'pointer-events-none select-none',
            ].join(' ')}
          />
          <span className="shrink-0 font-mono-google text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {done}/{data.items.length}
          </span>
        </>
      }
    >
      <div
        className={[
          'size-full overflow-y-auto px-3.5 py-2 font-sans-google nodrag nopan transition-colors',
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
              done: boolean;
            };
            if (!payload.itemId) return;

            // If dropped in the same list, skip
            if (payload.sourceNodeId === id) return;

            // 1. Remove from source list
            const allNodes = useCanvasStore.getState().nodes;
            const sourceNode = allNodes.find((n) => n.id === payload.sourceNodeId);
            if (sourceNode && sourceNode.type === 'todo_list') {
              const srcData = sourceNode.data as { items?: TodoItem[] };
              if (srcData.items) {
                useCanvasStore.getState().updateNodeData(payload.sourceNodeId, {
                  items: srcData.items.filter((it) => it.id !== payload.itemId),
                });
              }
            }

            // 2. Add to this target list
            const isDoneList = data.title.toLowerCase().includes('termin') || data.title.toLowerCase().includes('fait');
            setItems([
              ...data.items,
              {
                id: payload.itemId,
                text: payload.text,
                done: isDoneList ? true : payload.done,
              },
            ]);
          } catch (err) {
            console.error('Erreur lors du déplacement de la tâche', err);
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ul className="flex flex-col gap-1">
          {data.items.map((item) => (
            <li
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    sourceNodeId: id,
                    itemId: item.id,
                    text: item.text,
                    done: item.done,
                  }),
                );
                e.dataTransfer.effectAllowed = 'move';
              }}
              className="group/item flex items-center gap-2 rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors cursor-grab active:cursor-grabbing"
            >
              <button
                type="button"
                aria-label={item.done ? 'Marquer non fait' : 'Marquer fait'}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  patchItem(item.id, { done: !item.done });
                }}
                className={[
                  'pointer-events-auto flex size-4 shrink-0 items-center justify-center rounded-[5px] transition-all cursor-pointer',
                  item.done
                    ? 'bg-[#2E7D32] border border-[#2E7D32] text-white'
                    : 'border border-slate-300 dark:border-slate-600 bg-transparent text-transparent hover:border-[#2E7D32]',
                ].join(' ')}
              >
                <Check className="size-3 stroke-[3]" />
              </button>
              <textarea
                id={`todo-input-${item.id}`}
                rows={1}
                value={item.text}
                placeholder="Nouvelle tâche"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    addItem();
                  }
                  if (event.key === 'Escape') setIsTyping(false);
                }}
                onChange={(event) => {
                  patchItem(item.id, { text: event.target.value });
                  event.target.style.height = 'auto';
                  event.target.style.height = `${event.target.scrollHeight}px`;
                }}
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = `${el.scrollHeight}px`;
                  }
                }}
                className={[
                  'pointer-events-auto min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 cursor-text leading-snug resize-none overflow-hidden break-words',
                  item.done ? 'text-slate-400 line-through dark:text-slate-500' : 'text-[#1F1F1F] dark:text-[#E3E2E6]',
                ].join(' ')}
              />
              <button
                type="button"
                aria-label="Retirer la tâche"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setItems(data.items.filter((entry) => entry.id !== item.id));
                }}
                className="pointer-events-auto shrink-0 size-5.5 flex items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-rose-100 hover:text-rose-600 group-hover/item:opacity-100 dark:hover:bg-rose-950/60 dark:hover:text-rose-400 cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            addItem();
          }}
          className="pointer-events-auto mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <Plus className="size-3.5" /> Ajouter une tâche
        </button>
      </div>
    </NodeShell>
  );
}

export const TodoListNode = memo(TodoListNodeComponent);
