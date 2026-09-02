import { useMemo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import * as treeRepo from '../lib/repo/treeRepo';
import { useSettingsStore } from './useSettingsStore';
import { arrayInsertAt } from '../lib/ordering';
import {
  parentKey,
  ROOT_KEY,
  type DropTarget,
  type FlatTreeRow,
  type ItemType,
  type ParentKey,
  type TreeItem,
} from '../types/tree';

/**
 * État de l'arborescence de la barre latérale.
 *
 * Forme normalisée : `itemsById` + `childrenByParent`. Renommer un élément ne
 * touche qu'une entrée du dictionnaire, alors qu'un arbre imbriqué obligerait à
 * recréer toute la chaîne de parents — et donc à re-rendre le sidebar entier.
 */

export type TreeStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TreeState {
  status: TreeStatus;
  error: string | null;

  itemsById: Record<string, TreeItem>;
  /** Enfants ordonnés, indexés par parent (`'root'` pour la racine). */
  childrenByParent: Record<ParentKey, string[]>;

  expandedIds: Record<string, boolean>;
  selectedId: string | null;
  /** Tableau actuellement affiché dans le canvas. */
  activeBoardId: string | null;
  /** Élément en cours de renommage inline. */
  renamingId: string | null;
}

interface TreeActions {
  loadTree: () => Promise<void>;

  createItem: (type: ItemType, parentId?: string | null) => Promise<TreeItem | null>;
  renameItem: (id: string, title: string) => Promise<void>;
  setItemIcon: (id: string, icon: string | null) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  moveItem: (id: string, target: DropTarget) => Promise<void>;

  toggleExpanded: (id: string) => void;
  setExpanded: (id: string, expanded: boolean) => void;
  selectItem: (id: string | null) => void;
  openBoard: (id: string) => void;
  closeActiveBoard: () => void;
  beginRename: (id: string | null) => void;
}

export type TreeStore = TreeState & TreeActions;

const initialState: TreeState = {
  status: 'idle',
  error: null,
  itemsById: {},
  childrenByParent: { [ROOT_KEY]: [] },
  expandedIds: {},
  selectedId: null,
  activeBoardId: null,
  renamingId: null,
};

// -----------------------------------------------------------------------------
// Helpers sur l'état normalisé
// -----------------------------------------------------------------------------

function indexItems(items: readonly TreeItem[]): Pick<
  TreeState,
  'itemsById' | 'childrenByParent'
> {
  const itemsById: Record<string, TreeItem> = {};
  const childrenByParent: Record<ParentKey, string[]> = { [ROOT_KEY]: [] };

  const sorted = [...items].sort((a, b) => a.position - b.position);
  for (const item of sorted) {
    itemsById[item.id] = item;
    const key = parentKey(item.parentId);
    (childrenByParent[key] ??= []).push(item.id);
  }
  return { itemsById, childrenByParent };
}

/** Un dossier ne peut pas être glissé dans sa propre descendance. */
function isDescendant(
  itemsById: Record<string, TreeItem>,
  ancestorId: string,
  candidateId: string | null,
): boolean {
  let cursor = candidateId;
  while (cursor !== null) {
    if (cursor === ancestorId) return true;
    cursor = itemsById[cursor]?.parentId ?? null;
  }
  return false;
}

/** Identifiants du sous-arbre, `rootId` inclus. */
function collectSubtree(
  childrenByParent: Record<ParentKey, string[]>,
  rootId: string,
): string[] {
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    out.push(id);
    stack.push(...(childrenByParent[id] ?? []));
  }
  return out;
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const useTreeStore = create<TreeStore>()(
  immer((set, get) => ({
    ...initialState,

    async loadTree() {
      set((s) => {
        s.status = 'loading';
        s.error = null;
      });
      try {
        const items = await treeRepo.listItems();
        const { itemsById, childrenByParent } = indexItems(items);
        set((s) => {
          s.itemsById = itemsById;
          s.childrenByParent = childrenByParent;
          s.status = 'ready';
          if (!s.activeBoardId) {
            const firstBoard = items.find((it) => it.type === 'board');
            if (firstBoard) {
              s.activeBoardId = firstBoard.id;
              s.selectedId = firstBoard.id;
            }
          }
        });
      } catch (error) {
        set((s) => {
          s.status = 'error';
          s.error = error instanceof Error ? error.message : String(error);
        });
      }
    },

    async createItem(type, parentId = null) {
      try {
        const item = await treeRepo.createItem({ type, parentId });
        set((s) => {
          s.itemsById[item.id] = item;
          const key = parentKey(item.parentId);
          (s.childrenByParent[key] ??= []).push(item.id);
          if (item.parentId) s.expandedIds[item.parentId] = true;
          s.selectedId = item.id;
          if (item.type === 'board') s.activeBoardId = item.id;
        });
        return item;
      } catch (error) {
        set((s) => {
          s.error = error instanceof Error ? error.message : String(error);
        });
        return null;
      }
    },

    async renameItem(id, title) {
      const previous = get().itemsById[id]?.title;

      // La saisie se referme dans tous les cas, y compris quand le titre n'a pas
      // bougé : sortir avant de la fermer la laissait ouverte définitivement.
      set((s) => {
        s.renamingId = null;
      });
      if (previous === undefined || previous === title) return;

      set((s) => {
        s.itemsById[id].title = title;
      });
      try {
        await treeRepo.renameItem(id, title);
      } catch (error) {
        // Retour à l'état affiché avant la saisie : l'utilisateur voit que le
        // renommage n'a pas pris, plutôt qu'un titre fantôme non persisté.
        set((s) => {
          if (s.itemsById[id]) s.itemsById[id].title = previous;
          s.error = error instanceof Error ? error.message : String(error);
        });
      }
    },

    async setItemIcon(id, icon) {
      const previous = get().itemsById[id]?.icon ?? null;
      set((s) => {
        if (s.itemsById[id]) s.itemsById[id].icon = icon;
      });
      try {
        await treeRepo.setItemIcon(id, icon);
      } catch (error) {
        set((s) => {
          if (s.itemsById[id]) s.itemsById[id].icon = previous;
          s.error = error instanceof Error ? error.message : String(error);
        });
      }
    },

    async deleteItem(id) {
      const state = get();
      const item = state.itemsById[id];
      if (!item) return;

      const removed = collectSubtree(state.childrenByParent, id);
      const removedSet = new Set(removed);

      set((s) => {
        for (const removedId of removed) {
          delete s.itemsById[removedId];
          delete s.childrenByParent[removedId];
          delete s.expandedIds[removedId];
        }
        const key = parentKey(item.parentId);
        s.childrenByParent[key] = (s.childrenByParent[key] ?? []).filter(
          (childId) => childId !== id,
        );
        if (s.selectedId && removedSet.has(s.selectedId)) s.selectedId = null;
        if (s.activeBoardId && removedSet.has(s.activeBoardId)) s.activeBoardId = null;
        if (s.renamingId && removedSet.has(s.renamingId)) s.renamingId = null;
      });

      try {
        await treeRepo.deleteItem(id);
      } catch (error) {
        // La suppression en base a échoué : on recharge plutôt que de tenter de
        // reconstruire un sous-arbre entier de mémoire.
        set((s) => {
          s.error = error instanceof Error ? error.message : String(error);
        });
        await get().loadTree();
      }
    },

    async moveItem(id, target) {
      const state = get();
      const item = state.itemsById[id];
      if (!item) return;

      // Garde-fous : pas de cycle, pas d'enfant sous un tableau.
      if (isDescendant(state.itemsById, id, target.parentId)) return;
      if (target.parentId && state.itemsById[target.parentId]?.type === 'board') return;

      const sourceKey = parentKey(item.parentId);
      const targetKey = parentKey(target.parentId);
      const sameParent = sourceKey === targetKey;

      const sourceBefore = state.childrenByParent[sourceKey] ?? [];
      const targetBefore = state.childrenByParent[targetKey] ?? [];

      const nextTarget = arrayInsertAt(
        sameParent ? sourceBefore : targetBefore,
        id,
        target.index,
      );
      const nextSource = sameParent
        ? nextTarget
        : sourceBefore.filter((childId) => childId !== id);

      set((s) => {
        s.itemsById[id].parentId = target.parentId;
        s.childrenByParent[targetKey] = nextTarget;
        s.childrenByParent[sourceKey] = nextSource;
        nextTarget.forEach((childId, position) => {
          if (s.itemsById[childId]) s.itemsById[childId].position = position;
        });
        if (!sameParent) {
          nextSource.forEach((childId, position) => {
            if (s.itemsById[childId]) s.itemsById[childId].position = position;
          });
          if (target.parentId) s.expandedIds[target.parentId] = true;
        }
      });

      try {
        await treeRepo.moveItem({
          id,
          parentId: target.parentId,
          targetSiblingIds: nextTarget,
          sourceSiblingIds: sameParent ? undefined : nextSource,
        });
      } catch (error) {
        set((s) => {
          s.error = error instanceof Error ? error.message : String(error);
        });
        await get().loadTree();
      }
    },

    toggleExpanded(id) {
      set((s) => {
        s.expandedIds[id] = !s.expandedIds[id];
      });
    },

    setExpanded(id, expanded) {
      set((s) => {
        s.expandedIds[id] = expanded;
      });
    },

    selectItem(id) {
      set((s) => {
        s.selectedId = id;
      });
    },

    openBoard(id) {
      if (get().itemsById[id]?.type !== 'board') return;
      set((s) => {
        s.selectedId = id;
        s.activeBoardId = id;
      });
      // Ouvrir un tableau est la sortie naturelle de l'écran des paramètres :
      // celui-ci n'a donc pas de bouton « Fermer » dans son en-tête.
      useSettingsStore.getState().closeSettings();
    },

    closeActiveBoard() {
      set((s) => {
        s.activeBoardId = null;
      });
    },

    beginRename(id) {
      set((s) => {
        s.renamingId = id;
      });
    },
  })),
);

// -----------------------------------------------------------------------------
// Sélecteurs
// -----------------------------------------------------------------------------

/**
 * Aplatit l'arbre en lignes visibles (dossiers repliés exclus).
 *
 * C'est la forme attendue par `SortableContext` de @dnd-kit : une liste
 * ordonnée d'identifiants, la profondeur servant uniquement à l'indentation.
 */
export function buildVisibleRows(
  itemsById: Record<string, TreeItem>,
  childrenByParent: Record<ParentKey, string[]>,
  expandedIds: Record<string, boolean>,
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];

  const walk = (parentId: string | null, depth: number) => {
    for (const id of childrenByParent[parentKey(parentId)] ?? []) {
      const item = itemsById[id];
      if (!item) continue;
      const children = childrenByParent[id] ?? [];
      const isExpanded = expandedIds[id] === true;
      rows.push({ item, depth, hasChildren: children.length > 0, isExpanded });
      if (isExpanded && children.length > 0) walk(id, depth + 1);
    }
  };

  walk(null, 0);
  return rows;
}

export function selectVisibleRows(state: TreeStore): FlatTreeRow[] {
  return buildVisibleRows(state.itemsById, state.childrenByParent, state.expandedIds);
}

/**
 * Version React de `selectVisibleRows`.
 *
 * À utiliser dans les composants : passer `selectVisibleRows` directement à
 * `useTreeStore` renverrait un tableau neuf à chaque rendu, que Zustand compare
 * par référence — d'où des re-rendus en boucle. On mémoïse donc sur les trois
 * tranches d'état dont dérive la liste, elles-mêmes stables grâce à Immer.
 */
export function useVisibleRows(): FlatTreeRow[] {
  const itemsById = useTreeStore((s) => s.itemsById);
  const childrenByParent = useTreeStore((s) => s.childrenByParent);
  const expandedIds = useTreeStore((s) => s.expandedIds);

  return useMemo(
    () => buildVisibleRows(itemsById, childrenByParent, expandedIds),
    [itemsById, childrenByParent, expandedIds],
  );
}

export function selectChildren(state: TreeStore, parentId: string | null): TreeItem[] {
  return (state.childrenByParent[parentKey(parentId)] ?? [])
    .map((id) => state.itemsById[id])
    .filter((item): item is TreeItem => item !== undefined);
}

/** Chemin racine → élément, pour un fil d'Ariane. */
export function selectBreadcrumb(state: TreeStore, id: string | null): TreeItem[] {
  const path: TreeItem[] = [];
  let cursor = id;
  while (cursor !== null) {
    const item = state.itemsById[cursor];
    if (!item) break;
    path.unshift(item);
    cursor = item.parentId;
  }
  return path;
}

export function selectActiveBoard(state: TreeStore): TreeItem | null {
  return state.activeBoardId ? (state.itemsById[state.activeBoardId] ?? null) : null;
}
