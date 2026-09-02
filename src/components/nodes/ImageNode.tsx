import { memo, useCallback, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { ImageOff } from 'lucide-react';

import { NodeShell } from './NodeShell';
import { useCanvasStore } from '../../stores/useCanvasStore';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import type { ImageNode as ImageNodeType } from '../../types/canvas';

function ImageNodeComponent({ id, data, selected }: NodeProps<ImageNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const resizeNode = useCanvasStore((s) => s.resizeNode);
  const { url, isLoading } = useAssetUrl(data.assetId);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const captionInputRef = useRef<HTMLInputElement>(null);

  const handleRename = useCallback(() => {
    setRenamingTitle(true);
    queueMicrotask(() => {
      captionInputRef.current?.focus();
      captionInputRef.current?.select();
    });
  }, []);

  return (
    <NodeShell
      nodeId={id}
      selected={selected ?? false}
      isEditing={renamingTitle}
      color="sky"
      onRename={handleRename}
      minWidth={160}
      minHeight={140}
      header={
        <input
          ref={captionInputRef}
          value={data.caption || ''}
          placeholder="Légende d'image"
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
          onChange={(event) => updateNodeData(id, { caption: event.target.value })}
          className={[
            'min-w-0 flex-1 bg-transparent font-sans-google font-semibold text-xs text-[#1F1F1F] dark:text-[#E3E2E6] outline-none placeholder:text-slate-400 transition-all',
            renamingTitle ? 'nodrag nopan pointer-events-auto bg-white/80 dark:bg-[#111318]/80 ring-1 ring-[#0B57D0] dark:ring-[#A8C7FA] rounded px-1.5 py-0.5' : 'pointer-events-none select-none',
          ].join(' ')}
        />
      }
    >
      <div className="grid size-full place-items-center overflow-hidden bg-slate-900/5 dark:bg-black/30">
        {isLoading ? (
          <span className="text-xs font-medium text-slate-400">Chargement…</span>
        ) : url ? (
          <img
            src={url}
            alt={data.caption || 'Image'}
            draggable={false}
            className="size-full object-contain"
            onLoad={(event) => {
              const img = event.currentTarget;
              if (img.naturalWidth && img.naturalHeight && data.naturalWidth === null) {
                updateNodeData(id, {
                  naturalWidth: img.naturalWidth,
                  naturalHeight: img.naturalHeight,
                });
                const maxWidth = 380;
                const targetWidth = Math.min(maxWidth, Math.max(220, img.naturalWidth));
                const targetHeight = Math.round((targetWidth * img.naturalHeight) / img.naturalWidth) + 36;
                resizeNode(id, { width: targetWidth, height: targetHeight });
              }
            }}
          />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-xs text-slate-400">
            <ImageOff className="size-6 text-slate-400" />
            Média introuvable
          </span>
        )}
      </div>
    </NodeShell>
  );
}

export const ImageNode = memo(ImageNodeComponent);
