import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Columns3,
  Folder,
  LayoutDashboard,
  ListChecks,
  Moon,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Settings,
  StickyNote,
  Sun,
  Trash2,
} from 'lucide-react';

import { useTreeStore } from '../../stores/useTreeStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { createId } from '../../lib/id';
import * as canvasRepo from '../../lib/repo/canvasRepo';
import type { TreeItem } from '../../types/tree';

export function BoardsDashboard() {
  const itemsById = useTreeStore((s) => s.itemsById);
  const openBoard = useTreeStore((s) => s.openBoard);
  const createItem = useTreeStore((s) => s.createItem);
  const deleteItem = useTreeStore((s) => s.deleteItem);
  const renameItem = useTreeStore((s) => s.renameItem);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const openSettings = useSettingsStore((s) => s.openSettings);

  const [search, setSearch] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Liste de tous les tableaux (type === 'board')
  const boards: TreeItem[] = useMemo(() => {
    return Object.values(itemsById)
      .filter((item) => item.type === 'board')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [itemsById]);

  const filteredBoards = useMemo(() => {
    if (!search.trim()) return boards;
    const q = search.toLowerCase();
    return boards.filter((b) => b.title.toLowerCase().includes(q));
  }, [boards, search]);

  // Création avec template
  const handleCreateTemplate = async (template: 'blank' | 'kanban' | 'brainstorm' | 'todo') => {
    let title = 'Nouveau tableau';
    if (template === 'kanban') title = 'Tableau Kanban';
    if (template === 'brainstorm') title = 'Session Brainstorming';
    if (template === 'todo') title = 'Suivi de Projet';

    const board = await createItem('board', null);
    if (!board) return;

    if (title !== 'Nouveau tableau') {
      await renameItem(board.id, title);
    }

    // Pré-remplissage selon le template
    if (template === 'kanban') {
      const spot = { x: 100, y: 100 };
      await canvasRepo.insertNode(board.id, {
        id: createId(),
        type: 'group',
        position: spot,
        width: 880,
        height: 420,
        zIndex: -1,
        data: { title: 'Tableau Kanban', color: 'slate', locked: true },
      });
      await canvasRepo.insertNode(board.id, {
        id: createId(),
        type: 'kanban',
        position: { x: spot.x + 24, y: spot.y + 42 },
        width: 260,
        height: 335,
        zIndex: 0,
        data: {
          title: 'À faire',
          color: 'amber',
          cards: [
            { id: createId(), text: 'Rédiger la documentation' },
            { id: createId(), text: 'Revoir le design UX' },
          ],
        },
      });
      await canvasRepo.insertNode(board.id, {
        id: createId(),
        type: 'kanban',
        position: { x: spot.x + 304, y: spot.y + 42 },
        width: 260,
        height: 335,
        zIndex: 0,
        data: {
          title: 'En cours',
          color: 'sky',
          cards: [{ id: createId(), text: 'Développement fonctionnalités' }],
        },
      });
      await canvasRepo.insertNode(board.id, {
        id: createId(),
        type: 'kanban',
        position: { x: spot.x + 584, y: spot.y + 42 },
        width: 260,
        height: 335,
        zIndex: 0,
        data: {
          title: 'Terminé',
          color: 'lime',
          cards: [{ id: createId(), text: 'Initialisation du projet' }],
        },
      });
    } else if (template === 'brainstorm') {
      await canvasRepo.insertNode(board.id, {
        id: createId(),
        type: 'note',
        position: { x: 120, y: 120 },
        width: 220,
        height: 220,
        zIndex: 0,
        data: {
          variant: 'sticky',
          title: '',
          doc: null,
          plainText: 'Idée principale : Simplifier la navigation',
          color: 'yellow',
        },
      });
      await canvasRepo.insertNode(board.id, {
        id: createId(),
        type: 'note',
        position: { x: 380, y: 120 },
        width: 220,
        height: 220,
        zIndex: 0,
        data: {
          variant: 'sticky',
          title: '',
          doc: null,
          plainText: 'Proposition : Mode plein écran immersif',
          color: 'sky',
        },
      });
      await canvasRepo.insertNode(board.id, {
        id: createId(),
        type: 'note',
        position: { x: 250, y: 380 },
        width: 220,
        height: 220,
        zIndex: 0,
        data: {
          variant: 'sticky',
          title: '',
          doc: null,
          plainText: 'Points clés à retenir & feedback utilisateur',
          color: 'rose',
        },
      });
    } else if (template === 'todo') {
      await canvasRepo.insertNode(board.id, {
        id: createId(),
        type: 'todo_list',
        position: { x: 160, y: 140 },
        width: 300,
        height: 280,
        zIndex: 0,
        data: {
          title: 'Objectifs de la semaine',
          color: 'sky',
          items: [
            { id: createId(), text: 'Finaliser le tableau Kanban', done: true },
            { id: createId(), text: 'Tester les performances SQLite', done: false },
            { id: createId(), text: 'Préparer la release v0.2.0', done: false },
          ],
        },
      });
    }

    openBoard(board.id);
  };

  const handleStartRename = (board: TreeItem) => {
    setRenamingId(board.id);
    setRenameValue(board.title);
    setActiveMenuId(null);
  };

  const handleSaveRename = (boardId: string) => {
    if (renameValue.trim()) {
      void renameItem(boardId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="flex size-full flex-col bg-[#F8F9FC] text-[#1F1F1F] dark:bg-[#0E1015] dark:text-[#E3E2E6] font-sans-google select-none overflow-y-auto">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/80 px-8 backdrop-blur-md dark:border-white/[0.06] dark:bg-[#14161D]/80">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-[#0B57D0] text-white shadow-md shadow-[#0B57D0]/25 dark:bg-[#A8C7FA] dark:text-[#041E49]">
            <LayoutDashboard className="size-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-[#1F1F1F] dark:text-[#E3E2E6]">
              Boardy
            </span>
            <span className="ml-2 rounded-full bg-[#0B57D0]/10 dark:bg-[#A8C7FA]/20 px-2 py-0.5 text-[10px] font-bold text-[#0B57D0] dark:text-[#A8C7FA]">
              v0.1
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-80 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un tableau..."
            className="w-full rounded-full border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03] pl-9 pr-4 py-1.5 text-xs text-[#1F1F1F] dark:text-[#E3E2E6] outline-none placeholder:text-slate-400 focus:border-[#0B57D0] dark:focus:border-[#A8C7FA] transition-colors"
          />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Changer de thème"
            onClick={toggleTheme}
            className="flex size-9 items-center justify-center rounded-full text-slate-500 hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            type="button"
            title="Paramètres"
            onClick={() => openSettings()}
            className="flex size-9 items-center justify-center rounded-full text-slate-500 hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl px-8 py-8 flex flex-col gap-10">
        {/* Hero Section: Quick Starter Templates */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#1F1F1F] dark:text-[#E3E2E6]">
                Créer un tableau
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Démarrez d'une page blanche ou choisissez un modèle prêt à l'emploi.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Blank Board (Primary Card) */}
            <button
              type="button"
              onClick={() => void handleCreateTemplate('blank')}
              className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-[#0B57D0]/20 bg-gradient-to-br from-[#0B57D0] to-[#0842A0] p-5 text-left text-white shadow-lg shadow-[#0B57D0]/20 transition-all hover:scale-[1.02] hover:shadow-xl cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
                  <Plus className="size-6 stroke-[2.5]" />
                </div>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold">
                  Nouveau
                </span>
              </div>
              <div className="mt-8">
                <h2 className="text-sm font-bold">Tableau vierge</h2>
                <p className="mt-1 text-[11px] text-white/80 leading-relaxed">
                  Espace infini avec notes, listes, images et PDF.
                </p>
              </div>
            </button>

            {/* Kanban Template */}
            <button
              type="button"
              onClick={() => void handleCreateTemplate('kanban')}
              className="group flex flex-col justify-between rounded-3xl border border-black/5 bg-white p-5 text-left shadow-xs transition-all hover:border-[#0B57D0]/30 hover:shadow-md dark:border-white/5 dark:bg-[#16181E] cursor-pointer"
            >
              <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Columns3 className="size-5" />
              </div>
              <div className="mt-8">
                <h2 className="text-sm font-bold text-[#1F1F1F] dark:text-[#E3E2E6] group-hover:text-[#0B57D0] dark:group-hover:text-[#A8C7FA] transition-colors">
                  Tableau Kanban
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  3 colonnes avec glisser-déposer de cartes de tâches.
                </p>
              </div>
            </button>

            {/* Brainstorming Template */}
            <button
              type="button"
              onClick={() => void handleCreateTemplate('brainstorm')}
              className="group flex flex-col justify-between rounded-3xl border border-black/5 bg-white p-5 text-left shadow-xs transition-all hover:border-[#0B57D0]/30 hover:shadow-md dark:border-white/5 dark:bg-[#16181E] cursor-pointer"
            >
              <div className="flex size-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <StickyNote className="size-5" />
              </div>
              <div className="mt-8">
                <h2 className="text-sm font-bold text-[#1F1F1F] dark:text-[#E3E2E6] group-hover:text-[#0B57D0] dark:group-hover:text-[#A8C7FA] transition-colors">
                  Brainstorming
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Post-its colorés pour poser et organiser vos idées.
                </p>
              </div>
            </button>

            {/* Todo / Project Template */}
            <button
              type="button"
              onClick={() => void handleCreateTemplate('todo')}
              className="group flex flex-col justify-between rounded-3xl border border-black/5 bg-white p-5 text-left shadow-xs transition-all hover:border-[#0B57D0]/30 hover:shadow-md dark:border-white/5 dark:bg-[#16181E] cursor-pointer"
            >
              <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ListChecks className="size-5" />
              </div>
              <div className="mt-8">
                <h2 className="text-sm font-bold text-[#1F1F1F] dark:text-[#E3E2E6] group-hover:text-[#0B57D0] dark:group-hover:text-[#A8C7FA] transition-colors">
                  Suivi de projet
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Listes de tâches interactives avec cases à cocher.
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Existing Boards Grid */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1F1F1F] dark:text-[#E3E2E6]">
              Mes tableaux récents ({filteredBoards.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredBoards.map((board) => (
              <div
                key={board.id}
                onClick={() => openBoard(board.id)}
                className="group relative flex flex-col justify-between rounded-3xl border border-black/5 bg-white p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#0B57D0]/30 hover:shadow-lg dark:border-white/5 dark:bg-[#16181E] cursor-pointer min-h-[170px]"
              >
                {/* Visual Thumbnail Banner */}
                <div className="flex h-20 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B57D0]/5 to-[#0B57D0]/10 dark:from-[#A8C7FA]/5 dark:to-[#A8C7FA]/10 border border-black/5 dark:border-white/5 group-hover:scale-[1.01] transition-transform">
                  <LayoutDashboard className="size-7 text-[#0B57D0]/70 dark:text-[#A8C7FA]/70" />
                </div>

                {/* Board Info & Menu */}
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {renamingId === board.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') handleSaveRename(board.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={() => handleSaveRename(board.id)}
                        className="w-full rounded-md border border-[#0B57D0] px-1.5 py-0.5 text-xs font-bold text-[#1F1F1F] dark:text-[#E3E2E6] outline-none"
                      />
                    ) : (
                      <h3 className="truncate text-xs font-bold text-[#1F1F1F] group-hover:text-[#0B57D0] dark:text-[#E3E2E6] dark:group-hover:text-[#A8C7FA] transition-colors">
                        {board.title}
                      </h3>
                    )}
                    <p className="mt-1 text-[10px] text-slate-400">
                      Modifié le {new Date(board.updatedAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>

                  {/* Context Menu Button */}
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Options du tableau"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === board.id ? null : board.id);
                      }}
                      className="flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200 transition-colors"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>

                    {activeMenuId === board.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-8 z-40 w-36 rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#1E2025]"
                      >
                        <button
                          type="button"
                          onClick={() => handleStartRename(board)}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10 transition-colors"
                        >
                          <Pencil className="size-3.5 text-slate-400" />
                          <span>Renommer</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
                            void deleteItem(board.id);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                          <span>Supprimer</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Open Hover Indicator */}
                <div className="mt-2 flex items-center justify-end text-[11px] font-semibold text-[#0B57D0] opacity-0 group-hover:opacity-100 dark:text-[#A8C7FA] transition-opacity">
                  <span>Ouvrir</span>
                  <ArrowRight className="ml-1 size-3" />
                </div>
              </div>
            ))}
          </div>

          {filteredBoards.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-black/10 py-16 text-center dark:border-white/10">
              <Folder className="size-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Aucun tableau ne correspond à votre recherche.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
