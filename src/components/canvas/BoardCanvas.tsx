import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Viewport as FlowViewport,
} from '@xyflow/react';
import { ChevronLeft, Download, Settings, Sparkles, Upload } from 'lucide-react';

import { nodeTypes } from '../nodes';
import { CanvasToolbar } from './CanvasToolbar';
import { useCanvasStore } from '../../stores/useCanvasStore';
import { GRID_SIZE, useSettingsStore } from '../../stores/useSettingsStore';
import { useTreeStore } from '../../stores/useTreeStore';
import { useFileDrop, type DropPoint } from '../../hooks/useFileDrop';
import {
  EDGE_DEFAULTS,
  NOTE_VARIANT_SIZE,
  type BoardyEdge,
  type BoardyNode,
} from '../../types/canvas';

import { DeletableEdge } from './DeletableEdge';

const edgeTypes = {
  deletable: DeletableEdge,
};

/** `plain` n'a pas de variante : le composant `<Background>` n'est alors pas rendu. */
const BACKGROUND_VARIANTS = {
  dots: BackgroundVariant.Dots,
  grid: BackgroundVariant.Cross,
  lines: BackgroundVariant.Lines,
} as const;

interface BoardCanvasProps {
  boardId: string;
}

export function BoardCanvas({ boardId }: BoardCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner boardId={boardId} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ boardId }: BoardCanvasProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const status = useCanvasStore((s) => s.status);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const loadBoard = useCanvasStore((s) => s.loadBoard);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const addNode = useCanvasStore((s) => s.addNode);
  const deleteEdges = useCanvasStore((s) => s.deleteEdges);
  const importFiles = useCanvasStore((s) => s.importFiles);
  const setCatalogOpen = useCanvasStore((s) => s.setCatalogOpen);

  const { setViewport: applyViewport, screenToFlowPosition } = useReactFlow();
  const restoredFor = useRef<string | null>(null);

  useEffect(() => {
    void loadBoard(boardId);
  }, [boardId, loadBoard]);

  useEffect(() => {
    if (status !== 'ready' || restoredFor.current === boardId) return;
    restoredFor.current = boardId;
    void applyViewport(useCanvasStore.getState().viewport);
  }, [status, boardId, applyViewport]);

  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: FlowViewport) => setViewport(viewport),
    [setViewport],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__controls') ||
        target.closest('.react-flow__minimap')
      ) {
        return;
      }

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const size = NOTE_VARIANT_SIZE.sticky;
      void addNode(
        'note',
        { x: position.x - size.width / 2, y: position.y - size.height / 2 },
        undefined,
        size,
      );
    },
    [addNode, screenToFlowPosition],
  );

  const handleFileDrop = useCallback(
    (paths: string[], point: DropPoint) => {
      const position = screenToFlowPosition(point);
      void importFiles(paths, { x: position.x - 160, y: position.y - 120 });
    },
    [importFiles, screenToFlowPosition],
  );

  const isFileOver = useFileDrop(handleFileDrop);

  const closeActiveBoard = useTreeStore((s) => s.closeActiveBoard);
  const renameItem = useTreeStore((s) => s.renameItem);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const canvasBackground = useSettingsStore((s) => s.canvasBackground);
  const showMinimap = useSettingsStore((s) => s.showMinimap);
  const snapToGrid = useSettingsStore((s) => s.snapToGrid);
  const currentBoard = useTreeStore((s) => s.itemsById[boardId]);

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const aGroup = a.type === 'group' ? 0 : 1;
      const bGroup = b.type === 'group' ? 0 : 1;
      return aGroup - bGroup;
    });
  }, [nodes]);

  return (
    <div className="relative flex flex-col size-full bg-[#F0F4F9] dark:bg-[#111318] font-sans-google">
      {/* Fullscreen Header Bar */}
      <header className="h-14 shrink-0 flex items-center justify-between px-4 bg-white/80 dark:bg-[#14161D]/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 z-30 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            title="Retour aux tableaux"
            aria-label="Retour aux tableaux"
            onClick={() => closeActiveBoard()}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-full text-slate-600 hover:bg-black/5 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white transition-all cursor-pointer font-medium text-xs mr-1 border border-black/5 dark:border-white/5"
          >
            <ChevronLeft className="size-4" />
            <span>Tableaux</span>
          </button>

          <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-1" />

          {/* Editable board title */}
          <input
            value={currentBoard?.title ?? ''}
            onChange={(e) => {
              if (boardId) void renameItem(boardId, e.target.value);
            }}
            placeholder="Nom du tableau"
            className="bg-transparent font-bold text-sm text-[#1F1F1F] dark:text-[#E3E2E6] outline-none hover:bg-black/5 dark:hover:bg-white/5 focus:bg-white dark:focus:bg-[#1E2025] focus:ring-1 focus:ring-[#0B57D0] rounded-lg px-2 py-1 transition-all max-w-[260px] truncate"
          />
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 px-3 border border-black/10 dark:border-white/10 rounded-full font-medium text-xs text-[#1F1F1F] dark:text-[#E3E2E6] hover:bg-black/5 dark:hover:bg-white/5 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="size-3.5 text-slate-500 dark:text-slate-400" />
            Exporter
          </button>

          <button
            type="button"
            onClick={() => setCatalogOpen(true)}
            className="flex h-8 items-center gap-1.5 px-3.5 rounded-full bg-[#0B57D0] hover:bg-[#0842A0] dark:bg-[#A8C7FA] dark:hover:bg-[#8AB4F8] text-white dark:text-[#041E49] font-semibold text-xs transition-colors shadow-md shadow-[#0B57D0]/20 cursor-pointer"
          >
            <Sparkles className="size-3.5" />
            Composants
          </button>

          <button
            type="button"
            title="Paramètres"
            onClick={() => openSettings()}
            className="flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10 transition-colors cursor-pointer ml-1"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </header>

      {/* Main React Flow Canvas */}
      <div className="relative flex-1 min-h-0">
        <ReactFlow<BoardyNode, BoardyEdge>
          nodes={sortedNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgeClick={(_event, edge) => void deleteEdges([edge.id])}
          onConnect={onConnect}
          onMoveEnd={handleMoveEnd}
          onDoubleClick={handleDoubleClick}
          defaultEdgeOptions={EDGE_DEFAULTS}
          connectionLineStyle={{ stroke: 'var(--boardy-accent)', strokeWidth: 3 }}
          connectionMode={ConnectionMode.Loose}
          selectNodesOnDrag={false}
          elevateNodesOnSelect={false}
          deleteKeyCode={['Backspace', 'Delete']}
          multiSelectionKeyCode={['Meta', 'Control']}
          snapToGrid={snapToGrid}
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          minZoom={0.1}
          maxZoom={2.5}
        >
          {canvasBackground !== 'plain' && (
            <Background
              variant={BACKGROUND_VARIANTS[canvasBackground]}
              gap={canvasBackground === 'dots' ? 22 : GRID_SIZE * 2}
              size={1.2}
              lineWidth={1}
              color="rgba(160, 160, 160, 0.3)"
            />
          )}
          {showMinimap && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              switch (n.type) {
                case 'note':
                  return '#FDE047';
                case 'todo_list':
                  return '#86EFAC';
                case 'pdf':
                  return '#FDA4AF';
                case 'image':
                  return '#93C5FD';
                case 'group':
                  return 'rgba(148, 163, 184, 0.4)';
                default:
                  return '#CBD5E1';
              }
            }}
            nodeStrokeColor="rgba(0, 0, 0, 0.15)"
            nodeBorderRadius={4}
            maskColor="rgba(15, 23, 42, 0.16)"
            maskStrokeColor="var(--boardy-accent)"
            maskStrokeWidth={2.5}
          />
          )}
          <Controls showInteractive={false} />
        </ReactFlow>

        <CanvasToolbar />

        {isFileOver && (
          <div className="pointer-events-none absolute inset-4 z-50 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--boardy-accent)] bg-[var(--boardy-accent)]/10 backdrop-blur-sm">
            <span className="flex items-center gap-3 rounded-full bg-[#FFFDF9] dark:bg-[#232220] px-6 py-3.5 text-sm font-semibold text-[var(--boardy-text-primary)] shadow-xl">
              <Upload className="size-5 animate-bounce text-[var(--boardy-accent)]" />
              Déposez vos images ou PDF sur le tableau
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
