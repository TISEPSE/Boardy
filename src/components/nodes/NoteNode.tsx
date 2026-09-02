import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { NodeProps } from '@xyflow/react';

import { NodeShell } from './NodeShell';
import { useCanvasStore } from '../../stores/useCanvasStore';
import type { NoteColor, NoteNode as NoteNodeType } from '../../types/canvas';

/**
 * Note libre : post-it ou document, selon `data.variant`.
 *
 * Deux modes, et un seul à la fois :
 *
 * - **repos** — l'éditeur ne reçoit aucun pointeur, le clic traverse jusqu'au
 *   nœud React Flow. La tuile se sélectionne et se déplace depuis n'importe
 *   quel point, et `Suppr` la supprime (React Flow ignore les frappes émises
 *   depuis un `contenteditable`, d'où l'obligation de rendre le focus).
 * - **édition** — déclenchée au double-clic. Le corps devient `nodrag nopan
 *   nowheel` pour que le canvas ne capte plus rien, et les touches restent dans
 *   l'éditeur.
 *
 * L'état vit en local : il ne survit pas au tableau, ne se persiste pas, et ne
 * concerne qu'un nœud à la fois.
 */
function NoteNodeComponent({ id, data, selected }: NodeProps<NoteNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const isBrandNew = useRef(!data.doc && (!data.plainText || data.plainText.trim() === '')).current;
  const [editing, setEditing] = useState(isBrandNew);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleRename = useCallback(() => {
    setRenamingTitle(true);
    queueMicrotask(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, []);

  const updateRef = useRef((doc: unknown, plainText: string) => {
    updateNodeData(id, { doc, plainText });
  });

  useEffect(() => {
    updateRef.current = (doc: unknown, plainText: string) => {
      updateNodeData(id, { doc, plainText });
    };
  }, [id, updateNodeData]);

  const isSticky = data.variant === 'sticky';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: { depth: 50 },
        heading: { levels: [1, 2, 3, 4] },
      }),
    ],
    content: (data.doc as JSONContent | null) ?? '',
    editable: isBrandNew,
    onUpdate: ({ editor: instance }) => {
      updateRef.current(instance.getJSON(), instance.getText());
    },
    editorProps: {
      attributes: {
        class: isSticky
          ? 'text-sm font-semibold leading-relaxed outline-none w-full text-center flex flex-col justify-center min-h-full'
          : 'text-sm leading-relaxed outline-none min-h-full',
      },
    },
  });

  // TipTap reste monté : seul son mode bascule, ce qui évite de reconstruire le
  // document — et donc de perdre l'historique d'annulation — à chaque va-et-vient.
  useEffect(() => {
    editor?.setEditable(editing);
  }, [editor, editing]);

  // Focus automatique immédiat lors de la création d'une nouvelle note
  useEffect(() => {
    if (isBrandNew && editor) {
      queueMicrotask(() => {
        editor.chain().focus('end').run();
      });
    }
  }, [editor, isBrandNew]);

  // Désélectionner la tuile suffit à sortir de l'édition : pas d'écouteur global
  // à poser ni à nettoyer.
  useEffect(() => {
    if (!selected) {
      setEditing(false);
      setRenamingTitle(false);
    }
  }, [selected]);

  const beginEditing = useCallback(() => {
    setEditing(true);
    // `setEditable` est appliqué par l'effet ci-dessus, après ce rendu : on
    // laisse passer le cycle avant de réclamer le focus.
    queueMicrotask(() => editor?.chain().focus().run());
  }, [editor]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditing(false);
        editor?.commands.blur();
        return;
      }
      // En édition, aucune frappe ne doit atteindre les raccourcis du canvas.
      event.stopPropagation();
    },
    [editor],
  );

  return (
    <NodeShell
      nodeId={id}
      selected={selected ?? false}
      isEditing={editing || renamingTitle}
      color={data.color}
      onColorChange={(color: NoteColor) => updateNodeData(id, { color })}
      onRename={!isSticky ? handleRename : undefined}
      resizable={!isSticky}
      surface={isSticky ? 'sticky' : 'document'}
      minWidth={isSticky ? 220 : 220}
      minHeight={isSticky ? 220 : 160}
      header={
        !isSticky ? (
          <div className="flex items-center gap-2 w-full">
            <input
              ref={titleInputRef}
              value={data.title || ''}
              placeholder="Titre du bloc de texte"
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
              onBlur={() => setRenamingTitle(false)}
              onChange={(event) => updateNodeData(id, { title: event.target.value })}
              className={[
                'min-w-0 flex-1 bg-transparent font-sans-google font-semibold text-xs text-[#1F1F1F] dark:text-[#E3E2E6] outline-none placeholder:text-slate-400 transition-all',
                renamingTitle ? 'nodrag nopan pointer-events-auto bg-white/80 dark:bg-[#111318]/80 ring-1 ring-[#0B57D0] dark:ring-[#A8C7FA] rounded px-1.5 py-0.5' : 'pointer-events-none select-none',
              ].join(' ')}
            />
          </div>
        ) : undefined
      }
    >
      <div
        className={[
          'size-full overflow-y-auto px-4 py-3 text-[#1F1F1F] dark:text-[#E3E2E6] font-sans-google',
          isSticky
            ? 'flex flex-col items-center justify-center text-center'
            : 'text-xs leading-relaxed',
          editing
            ? 'nodrag nopan nowheel cursor-text'
            : 'cursor-grab select-none active:cursor-grabbing',
        ].join(' ')}
        onDoubleClick={beginEditing}
        onKeyDown={editing ? handleKeyDown : undefined}
      >
        <EditorContent
          editor={editor}
          className={editing ? 'size-full flex flex-col justify-center' : 'pointer-events-none size-full flex flex-col justify-center'}
        />
      </div>
    </NodeShell>
  );
}

export const NoteNode = memo(NoteNodeComponent);
