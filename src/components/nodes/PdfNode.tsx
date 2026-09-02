import { memo, useCallback, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { FileWarning } from 'lucide-react';

import { NodeShell } from './NodeShell';
import { useCanvasStore } from '../../stores/useCanvasStore';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import type { PdfNode as PdfNodeType } from '../../types/canvas';

function PdfNodeComponent({ id, data, selected }: NodeProps<PdfNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { url, isLoading } = useAssetUrl(data.assetId);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleRename = useCallback(() => {
    setRenamingTitle(true);
    queueMicrotask(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, []);

  return (
    <NodeShell
      nodeId={id}
      selected={selected ?? false}
      isEditing={renamingTitle}
      color="rose"
      onRename={handleRename}
      minWidth={240}
      minHeight={260}
      header={
        <input
          ref={titleInputRef}
          value={data.title}
          placeholder="Document PDF"
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
            'min-w-0 flex-1 bg-transparent font-sans-google font-semibold text-xs text-[#1F1F1F] dark:text-[#E3E2E6] outline-none placeholder:text-slate-400 transition-all',
            renamingTitle ? 'nodrag nopan pointer-events-auto bg-white/80 dark:bg-[#111318]/80 ring-1 ring-[#0B57D0] dark:ring-[#A8C7FA] rounded px-1.5 py-0.5' : 'pointer-events-none select-none',
          ].join(' ')}
        />
      }
    >
      <div
        onWheel={(e) => e.stopPropagation()}
        className="nodrag nopan nowheel flex flex-col size-full bg-white dark:bg-[#1B1D22] font-sans-google overflow-hidden"
      >
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="grid size-full place-items-center font-mono-google text-xs text-slate-400">
              Chargement…
            </div>
          ) : url ? (
            <iframe
              className="nodrag nopan nowheel size-full border-0 rounded-b-xl"
              title={data.title || 'Aperçu PDF'}
              src={`${url}#toolbar=0&navpanes=0&view=FitH`}
            />
          ) : (
            <div className="grid size-full place-items-center p-4">
              <span className="flex flex-col items-center gap-1.5 font-mono-google text-xs text-slate-400">
                <FileWarning className="size-6 text-rose-500" />
                Document PDF
              </span>
            </div>
          )}
        </div>
      </div>
    </NodeShell>
  );
}

export const PdfNode = memo(PdfNodeComponent);
