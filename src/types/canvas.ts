import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type {
  GithubProfile,
  GithubRelease,
  GithubRepository,
} from '../lib/github';
import type { CanvasNodeType } from './database';

export type { CanvasNodeType };

export const CANVAS_NODE_TYPES = [
  'note',
  'todo_list',
  'image',
  'pdf',
  'group',
  'kanban',
  'github_repo',
  'github_profile',
  'github_release',
] as const satisfies readonly CanvasNodeType[];

// -----------------------------------------------------------------------------
// Contenu des nœuds (désérialisé depuis canvas_nodes.data_json)
// -----------------------------------------------------------------------------
// React Flow v12 contraint `Node<T>` à `T extends Record<string, unknown>`,
// d'où l'extension explicite sur chaque interface de données.

/** Palette des notes — alignée sur les tokens Tailwind du thème. */
export type NoteColor =
  | 'yellow'
  | 'amber'
  | 'lime'
  | 'sky'
  | 'violet'
  | 'rose'
  | 'slate'
  | 'white';

/**
 * Carte de texte. `variant` distingue le post-it du document rédigé : la
 * persistance est identique, seuls le rendu et l'éditeur diffèrent.
 */
export interface NoteNodeData extends Record<string, unknown> {
  variant: 'sticky' | 'rich_text' | 'markdown';
  title: string;
  /** Document TipTap (JSONContent). `null` tant que l'éditeur n'a pas monté. */
  doc: unknown | null;
  /** Rendu à plat du document, alimente `node_search_fts.content_text`. */
  plainText: string;
  color?: NoteColor;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoListNodeData extends Record<string, unknown> {
  title: string;
  items: TodoItem[];
  color?: NoteColor;
}

export interface ImageNodeData extends Record<string, unknown> {
  /** Référence `media_assets.id`. */
  assetId: string;
  /** Légende affichée sous l'image, indexée par la recherche. */
  caption: string;
  naturalWidth: number | null;
  naturalHeight: number | null;
}

export interface PdfNodeData extends Record<string, unknown> {
  assetId: string;
  title: string;
  /** Page affichée dans la vignette d'aperçu (1-indexée). */
  previewPage: number;
  pageCount: number | null;
}

export interface GroupNodeData extends Record<string, unknown> {
  title: string;
  color?: NoteColor;
  locked?: boolean;
}

export interface KanbanCard {
  id: string;
  text: string;
}

export interface KanbanNodeData extends Record<string, unknown> {
  title: string;
  cards: KanbanCard[];
  color?: NoteColor;
}

/**
 * Socle commun aux tuiles GitHub. La charge utile est recopiée dans
 * `data_json` : un tableau s'affiche donc immédiatement à l'ouverture, hors
 * ligne comme en ligne, et sans consommer le quota d'API à chaque chargement.
 * `fetchedAt` (ISO 8601) date ce cache, `error` retient le dernier échec pour
 * que la tuile puisse l'expliquer au lieu de rester vide.
 */
export interface GithubNodeBase<T> extends Record<string, unknown> {
  payload: T | null;
  fetchedAt: string | null;
  error: string | null;
}

/** `owner/name` est la clé de rafraîchissement, saisie par l'utilisateur. */
export interface GithubRepoNodeData extends GithubNodeBase<GithubRepository> {
  owner: string;
  name: string;
}

/** `login` vide signifie « le porteur du jeton ». */
export interface GithubProfileNodeData extends GithubNodeBase<GithubProfile> {
  login: string;
}

/**
 * `payload` reste `null` quand le dépôt n'a publié aucune release : c'est un
 * résultat valide, que `fetchedAt` distingue d'un cache jamais rempli.
 */
export interface GithubReleaseNodeData extends GithubNodeBase<GithubRelease> {
  owner: string;
  name: string;
}

/** Union des formes de contenu, discriminée par le type de nœud. */
export type CanvasNodeData =
  | NoteNodeData
  | TodoListNodeData
  | ImageNodeData
  | PdfNodeData
  | GroupNodeData
  | KanbanNodeData
  | GithubRepoNodeData
  | GithubProfileNodeData
  | GithubReleaseNodeData;

// -----------------------------------------------------------------------------
// Nœuds et liens React Flow
// -----------------------------------------------------------------------------

export type NoteNode = Node<NoteNodeData, 'note'>;
export type TodoListNode = Node<TodoListNodeData, 'todo_list'>;
export type ImageNode = Node<ImageNodeData, 'image'>;
export type PdfNode = Node<PdfNodeData, 'pdf'>;
export type GroupNode = Node<GroupNodeData, 'group'>;
export type KanbanNode = Node<KanbanNodeData, 'kanban'>;
export type GithubRepoNode = Node<GithubRepoNodeData, 'github_repo'>;
export type GithubProfileNode = Node<GithubProfileNodeData, 'github_profile'>;
export type GithubReleaseNode = Node<GithubReleaseNodeData, 'github_release'>;

export type BoardyNode =
  | NoteNode
  | TodoListNode
  | ImageNode
  | PdfNode
  | GroupNode
  | KanbanNode
  | GithubRepoNode
  | GithubProfileNode
  | GithubReleaseNode;

export type ArchipelNode = BoardyNode;

export interface BoardyEdgeData extends Record<string, unknown> {
  label?: string;
  style: Record<string, string | number>;
}

export type ArchipelEdgeData = BoardyEdgeData;

export type BoardyEdge = Edge<BoardyEdgeData>;

export type ArchipelEdge = BoardyEdge;

/**
 * Aspect commun des liens : trait épais et flèche pleine côté cible, pour que
 * le sens de lecture soit immédiat.
 */
export const EDGE_DEFAULTS = {
  type: 'deletable',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: 'var(--boardy-accent)',
  },
  style: { strokeWidth: 2 },
  interactionWidth: 24,
} as const;

/** Associe un type de nœud à sa forme de données, pour les fabriques typées. */
export interface CanvasNodeDataMap {
  note: NoteNodeData;
  todo_list: TodoListNodeData;
  image: ImageNodeData;
  pdf: PdfNodeData;
  group: GroupNodeData;
  kanban: KanbanNodeData;
  github_repo: GithubRepoNodeData;
  github_profile: GithubProfileNodeData;
  github_release: GithubReleaseNodeData;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** Dimensions par défaut à la création, en accord avec le DDL. */
export const DEFAULT_NODE_SIZE: Record<
  CanvasNodeType,
  { width: number; height: number }
> = {
  note: { width: 280, height: 200 },
  todo_list: { width: 280, height: 240 },
  image: { width: 320, height: 240 },
  pdf: { width: 320, height: 420 },
  group: { width: 640, height: 480 },
  kanban: { width: 260, height: 350 },
  // Formats calqués sur la maquette : le dépôt est la tuile large, le profil
  // une colonne, la release une bande basse.
  github_repo: { width: 420, height: 300 },
  github_profile: { width: 320, height: 400 },
  github_release: { width: 360, height: 280 },
};

/**
 * Format d'une note selon sa variante. `DEFAULT_NODE_SIZE` est indexé par type
 * de nœud, or post-it et document partagent le type `note` : le carré du
 * premier participe autant à sa reconnaissance que sa couleur.
 */
export const NOTE_VARIANT_SIZE: Record<
  NoteNodeData['variant'],
  { width: number; height: number }
> = {
  sticky: { width: 220, height: 220 },
  rich_text: { width: 320, height: 260 },
  markdown: { width: 320, height: 260 },
};

/** Contenu initial d'un nœud fraîchement créé. */
export const DEFAULT_NODE_DATA: {
  [K in CanvasNodeType]: () => CanvasNodeDataMap[K];
} = {
  note: () => ({
    variant: 'sticky',
    title: '',
    doc: null,
    plainText: '',
    color: 'yellow',
  }),
  todo_list: () => ({ title: 'À faire', items: [] }),
  image: () => ({
    assetId: '',
    caption: '',
    naturalWidth: null,
    naturalHeight: null,
  }),
  pdf: () => ({ assetId: '', title: '', previewPage: 1, pageCount: null }),
  group: () => ({ title: 'Groupe', color: 'slate' }),
  kanban: () => ({
    title: 'Colonne Kanban',
    color: 'amber',
    cards: [{ id: '1', text: 'Nouvelle tâche' }],
  }),
  github_repo: () => ({
    owner: '',
    name: '',
    payload: null,
    fetchedAt: null,
    error: null,
  }),
  github_profile: () => ({
    login: '',
    payload: null,
    fetchedAt: null,
    error: null,
  }),
  github_release: () => ({
    owner: '',
    name: '',
    payload: null,
    fetchedAt: null,
    error: null,
  }),
};

/**
 * Texte indexable d'un nœud. Centralisé ici pour que la recherche globale reste
 * cohérente quel que soit l'appelant (création, édition, réindexation).
 */
export function extractSearchText(
  type: CanvasNodeType,
  data: CanvasNodeData,
): string {
  switch (type) {
    case 'note': {
      const d = data as NoteNodeData;
      return [d.title, d.plainText].filter(Boolean).join('\n');
    }
    case 'todo_list': {
      const d = data as TodoListNodeData;
      return [d.title, ...d.items.map((i) => i.text)].filter(Boolean).join('\n');
    }
    case 'image':
      return (data as ImageNodeData).caption;
    case 'pdf':
      return (data as PdfNodeData).title;
    case 'group':
      return (data as GroupNodeData).title;
    case 'kanban': {
      const d = data as KanbanNodeData;
      return [d.title, ...d.cards.map((k) => k.text)].filter(Boolean).join('\n');
    }
    case 'github_repo': {
      const d = data as GithubRepoNodeData;
      return [`${d.owner}/${d.name}`, d.payload?.description]
        .filter(Boolean)
        .join('\n');
    }
    case 'github_profile': {
      const d = data as GithubProfileNodeData;
      return [d.login, d.payload?.name, d.payload?.bio]
        .filter(Boolean)
        .join('\n');
    }
    case 'github_release': {
      const d = data as GithubReleaseNodeData;
      const release = d.payload;
      return [
        `${d.owner}/${d.name}`,
        release?.tagName,
        release?.name,
        ...(release?.entries.map((entry) => entry.text) ?? []),
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
}
