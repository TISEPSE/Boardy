import type { ItemType } from './database';

export type { ItemType };

/**
 * Élément de l'arborescence latérale (dossier ou tableau), forme domaine.
 * Volontairement plat : la hiérarchie vit dans l'index `childrenByParent` du
 * store, pas dans des tableaux imbriqués — on évite ainsi de recopier des
 * sous-arbres entiers à chaque renommage.
 */
export interface TreeItem {
  id: string;
  parentId: string | null;
  title: string;
  type: ItemType;
  icon: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Clé d'indexation des enfants : `null` (racine) est normalisé en `'root'`. */
export const ROOT_KEY = 'root' as const;
export type ParentKey = string;

export function parentKey(parentId: string | null): ParentKey {
  return parentId ?? ROOT_KEY;
}

/** Ligne prête à l'affichage, produite par le sélecteur `selectVisibleRows`. */
export interface FlatTreeRow {
  item: TreeItem;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

/** Cible d'un glisser-déposer @dnd-kit résolue en intention métier. */
export interface DropTarget {
  /** Nouveau parent (`null` = racine). */
  parentId: string | null;
  /** Index d'insertion parmi les enfants de `parentId`. */
  index: number;
}
