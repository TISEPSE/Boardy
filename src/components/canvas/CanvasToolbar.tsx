import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useReactFlow } from '@xyflow/react';
import {
  FileType2,
  Group,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  StickyNote,
  Type,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useCanvasStore } from '../../stores/useCanvasStore';
import { createId } from '../../lib/id';
import { IMAGE_EXTENSIONS, PDF_EXTENSIONS } from '../../lib/repo/mediaRepo';
import {
  NOTE_VARIANT_SIZE,
  type CanvasNodeDataMap,
  type CanvasNodeType,
} from '../../types/canvas';
import { ComponentCatalogModal } from './ComponentCatalogModal';

interface CreateTool<T extends CanvasNodeType = CanvasNodeType> {
  kind: 'create';
  type: T;
  label: string;
  icon: LucideIcon;
  data?: Partial<CanvasNodeDataMap[T]>;
}

interface ImportTool {
  kind: 'import';
  label: string;
  icon: LucideIcon;
  /** Libellé et extensions du filtre présenté par le sélecteur système. */
  filterName: string;
  extensions: string[];
}

type Tool = CreateTool | ImportTool;

const TOOLS: Tool[] = [
  {
    kind: 'create',
    type: 'note',
    label: 'Post-it',
    icon: StickyNote,
    data: { variant: 'sticky', color: 'yellow' },
  },
  {
    kind: 'create',
    type: 'note',
    label: 'Bloc de texte',
    icon: Type,
    data: { variant: 'rich_text', color: 'slate', title: '' },
  },
  { kind: 'create', type: 'todo_list', label: 'Liste', icon: ListChecks },
  {
    kind: 'import',
    label: 'Image',
    icon: ImageIcon,
    filterName: 'Images',
    extensions: IMAGE_EXTENSIONS,
  },
  {
    kind: 'import',
    label: 'PDF',
    icon: FileType2,
    filterName: 'Documents PDF',
    extensions: PDF_EXTENSIONS,
  },
  { kind: 'create', type: 'group', label: 'Groupe', icon: Group },
];

/**
 * Palette d'insertion rapide + modal de catalogue étendu.
 */
export function CanvasToolbar() {
  const isCatalogOpen = useCanvasStore((s) => s.isCatalogOpen);
  const setCatalogOpen = useCanvasStore((s) => s.setCatalogOpen);
  const addNode = useCanvasStore((s) => s.addNode);
  const importFiles = useCanvasStore((s) => s.importFiles);
  const importing = useCanvasStore((s) => s.importing);
  const error = useCanvasStore((s) => s.error);
  const { screenToFlowPosition } = useReactFlow();

  const dropSpot = useCallback(() => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const jitter = () => (Math.random() - 0.5) * 60;
    return { x: center.x - 140 + jitter(), y: center.y - 100 + jitter() };
  }, [screenToFlowPosition]);

  const run = async (tool: Tool) => {
    if (tool.kind === 'create') {
      const variant =
        tool.type === 'note'
          ? (tool.data as Partial<CanvasNodeDataMap['note']> | undefined)?.variant
          : undefined;
      await addNode(
        tool.type,
        dropSpot(),
        tool.data,
        variant ? NOTE_VARIANT_SIZE[variant] : undefined,
      );
      return;
    }

    const selection = await open({
      multiple: true,
      filters: [{ name: tool.filterName, extensions: tool.extensions }],
    });
    if (!selection) return;

    const paths = Array.isArray(selection) ? selection : [selection];
    await importFiles(paths, dropSpot());
  };

  const handleSelectFromCatalog = async (toolId: string) => {
    switch (toolId) {
      case 'note-sticky':
        await addNode('note', dropSpot(), { variant: 'sticky', color: 'yellow' }, NOTE_VARIANT_SIZE.sticky);
        break;
      case 'note-text':
      case 'note-rich':
      case 'note-markdown':
        await addNode('note', dropSpot(), { variant: 'rich_text', color: 'slate', title: '' }, NOTE_VARIANT_SIZE.rich_text);
        break;
      case 'todo-list':
        await addNode('todo_list', dropSpot());
        break;
      case 'kanban': {
        const spot = dropSpot();
        await addNode(
          'group',
          spot,
          { title: 'Tableau Kanban', color: 'slate', locked: true },
          { width: 880, height: 420 },
        );
        await addNode(
          'kanban',
          { x: spot.x + 24, y: spot.y + 42 },
          {
            title: 'À faire',
            color: 'amber',
            cards: [
              { id: createId(), text: 'Rédiger la documentation' },
              { id: createId(), text: 'Revoir le design' },
            ],
          },
          { width: 260, height: 335 },
        );
        await addNode(
          'kanban',
          { x: spot.x + 304, y: spot.y + 42 },
          {
            title: 'En cours',
            color: 'sky',
            cards: [
              { id: createId(), text: 'Développement de fonctionnalités' },
            ],
          },
          { width: 260, height: 335 },
        );
        await addNode(
          'kanban',
          { x: spot.x + 584, y: spot.y + 42 },
          {
            title: 'Terminé',
            color: 'lime',
            cards: [
              { id: createId(), text: 'Initialisation du projet' },
            ],
          },
          { width: 260, height: 335 },
        );
        break;
      }
      case 'group':
        await addNode('group', dropSpot(), { color: 'sky' });
        break;
      case 'import-image': {
        const sel = await open({
          multiple: true,
          filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
        });
        if (sel) {
          const paths = Array.isArray(sel) ? sel : [sel];
          await importFiles(paths, dropSpot());
        }
        break;
      }
      case 'import-pdf': {
        const sel = await open({
          multiple: true,
          filters: [{ name: 'Documents PDF', extensions: PDF_EXTENSIONS }],
        });
        if (sel) {
          const paths = Array.isArray(sel) ? sel : [sel];
          await importFiles(paths, dropSpot());
        }
        break;
      }
      // Les tuiles GitHub se configurent elles-mêmes : posées vides, elles
      // demandent leur cible puis interrogent l'API. Aucune donnée d'exemple.
      case 'github-repo':
        await addNode('github_repo', dropSpot());
        break;
      case 'github-profile':
        await addNode('github_profile', dropSpot());
        break;
      case 'github-release':
        await addNode('github_release', dropSpot());
        break;
    }
  };

  return (
    <>
      <ComponentCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelectTool={(id) => void handleSelectFromCatalog(id)}
      />

      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-40">
        {error && (
          <p className="pointer-events-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-800 shadow-md dark:border-rose-900 dark:bg-rose-950/90 dark:text-rose-200">
            {error}
          </p>
        )}

        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-black/5 bg-white/90 p-1.5 shadow-xl shadow-black/5 backdrop-blur-md dark:border-white/5 dark:bg-[#1B1D22]/90">
          {TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              onClick={() => void run(tool)}
              className="flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-[#1F1F1F] transition-all hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] active:scale-95 dark:text-[#E3E2E6] dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA] cursor-pointer shrink-0"
            >
              <tool.icon className="size-4 text-slate-500 transition-colors group-hover:text-[#0B57D0] dark:text-slate-400 shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap">{tool.label}</span>
            </button>
          ))}

          {importing > 0 && (
            <>
              <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/10" />
              <span
                title={`Import de ${importing} fichier(s)`}
                className="flex items-center gap-1.5 px-2.5 text-xs font-mono-google text-slate-500"
              >
                <Loader2 className="size-4 animate-spin text-[#0B57D0] dark:text-[#A8C7FA]" />
                {importing}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
}
