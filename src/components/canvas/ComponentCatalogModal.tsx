import { useState, useMemo } from 'react';
import {
  Columns3,
  FileType2,
  Github,
  Group,
  Image as ImageIcon,
  ListChecks,
  Search,
  Sparkles,
  StickyNote,
  Tag,
  Type,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface CatalogItem {
  id: string;
  category: 'notes' | 'organisation' | 'media' | 'integrations';
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  action: () => void;
}

interface ComponentCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (toolId: string) => void;
}

export function ComponentCatalogModal({
  isOpen,
  onClose,
  onSelectTool,
}: ComponentCatalogModalProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const items: CatalogItem[] = useMemo(
    () => [
      {
        id: 'note-sticky',
        category: 'notes',
        title: 'Post-it',
        description: 'Carte carrée rapide et colorée pour des idées et rappels.',
        icon: StickyNote,
        action: () => onSelectTool('note-sticky'),
      },
      {
        id: 'note-text',
        category: 'notes',
        title: 'Bloc de texte',
        description: 'Éditeur de texte riche avec mise en forme, titres et listes.',
        icon: Type,
        action: () => onSelectTool('note-text'),
      },
      {
        id: 'todo-list',
        category: 'organisation',
        title: 'Liste de tâches (To-do)',
        description: 'Checklist interactive avec cases à cocher et compteur.',
        icon: ListChecks,
        action: () => onSelectTool('todo-list'),
      },
      {
        id: 'kanban',
        category: 'organisation',
        title: 'Tableau Kanban',
        description: 'Organisez vos tâches en colonnes déplaçables (À faire, En cours, Terminé).',
        icon: Columns3,
        action: () => onSelectTool('kanban'),
      },
      {
        id: 'group',
        category: 'organisation',
        title: 'Groupe / Cadre',
        description: 'Délimitez une zone visuelle pour rassembler plusieurs tuiles.',
        icon: Group,
        action: () => onSelectTool('group'),
      },
      {
        id: 'import-image',
        category: 'media',
        title: 'Image',
        description: 'Importez des images PNG, JPG, GIF ou WebP sur votre tableau.',
        icon: ImageIcon,
        action: () => onSelectTool('import-image'),
      },
      {
        id: 'import-pdf',
        category: 'media',
        title: 'Document PDF',
        description: 'Affichez et lisez des documents PDF directement sur le canvas.',
        icon: FileType2,
        action: () => onSelectTool('import-pdf'),
      },
      {
        id: 'github-repo',
        category: 'integrations',
        title: 'GitHub — Dépôt épinglé',
        description:
          'Description, étoiles, tickets, langages et contributeurs, lus sur GitHub.',
        icon: Github,
        badge: 'Intégration',
        action: () => onSelectTool('github-repo'),
      },
      {
        id: 'github-profile',
        category: 'integrations',
        title: 'GitHub — Profil',
        description:
          "Identité, abonnés, dépôts et rythme de contribution sur l'année écoulée.",
        icon: UserRound,
        badge: 'Intégration',
        action: () => onSelectTool('github-profile'),
      },
      {
        id: 'github-release',
        category: 'integrations',
        title: 'GitHub — Dernière release',
        description:
          'Version publiée la plus récente et ses notes, classées par nature.',
        icon: Tag,
        badge: 'Intégration',
        action: () => onSelectTool('github-release'),
      },
    ],
    [onSelectTool],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, selectedCategory]);

  if (!isOpen) return null;

  const categories = [
    { id: 'all', label: 'Tous' },
    { id: 'notes', label: 'Notes & Écriture' },
    { id: 'organisation', label: 'Organisation' },
    { id: 'media', label: 'Médias' },
    { id: 'integrations', label: 'Intégrations & GitHub' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans-google"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-3xl bg-white dark:bg-[#1E2025] border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[#0B57D0]/10 dark:bg-[#A8C7FA]/20 text-[#0B57D0] dark:text-[#A8C7FA]">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1F1F1F] dark:text-[#E3E2E6]">
                Bibliothèque de composants
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Insérez des cartes, médias et intégrations sur votre tableau
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-slate-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="px-6 pt-4 pb-2 flex flex-col gap-3">
          <div className="flex items-center gap-2.5 rounded-2xl bg-black/5 dark:bg-white/5 px-4 py-2.5 border border-black/5 dark:border-white/5 focus-within:ring-2 focus-within:ring-[#0B57D0] dark:focus-within:ring-[#A8C7FA] transition-all">
            <Search className="size-4 text-slate-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un composant, une note, GitHub…"
              className="w-full bg-transparent text-sm text-[#1F1F1F] dark:text-[#E3E2E6] outline-none placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
                  selectedCategory === cat.id
                    ? 'bg-[#0B57D0] text-white dark:bg-[#A8C7FA] dark:text-[#041E49]'
                    : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-black/10 dark:hover:bg-white/10',
                ].join(' ')}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Items Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.action();
                  onClose();
                }}
                className="group flex items-center gap-3.5 p-3.5 rounded-2xl border border-black/5 dark:border-white/5 bg-[#F8F9FA] dark:bg-[#252830] hover:bg-[#E9EEF6] dark:hover:bg-[#2D313A] hover:border-[#0B57D0]/30 dark:hover:border-[#A8C7FA]/30 hover:shadow-md transition-all text-left cursor-pointer active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-[#1B1D22] text-[#0B57D0] dark:text-[#A8C7FA] shadow-xs group-hover:scale-110 group-hover:bg-[#0B57D0] group-hover:text-white dark:group-hover:bg-[#A8C7FA] dark:group-hover:text-[#041E49] transition-all">
                  <item.icon className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-[#1F1F1F] dark:text-[#E3E2E6] truncate">
                      {item.title}
                    </h3>
                    {item.badge && (
                      <span className="shrink-0 rounded-full bg-[#0B57D0]/10 dark:bg-[#A8C7FA]/20 px-2 py-0.5 text-[9px] font-bold text-[#0B57D0] dark:text-[#A8C7FA]">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {filteredItems.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-400">
              Aucun composant ne correspond à votre recherche « {search} ».
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
