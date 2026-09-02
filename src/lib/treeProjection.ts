import { arrayMove, clamp } from './ordering';
import type { DropTarget, FlatTreeRow } from '../types/tree';

/**
 * Projection d'un glisser-déposer sur l'arborescence.
 *
 * @dnd-kit/sortable ne connaît qu'une liste plate : c'est le décalage
 * horizontal du pointeur qui exprime l'intention « rentrer dans le dossier
 * au-dessus » ou « ressortir d'un niveau ». On traduit ici ce décalage en une
 * profondeur, puis en un couple (parent, index) que le store sait persister.
 *
 * Fonctions pures, sans dépendance à React : c'est la partie qu'on veut pouvoir
 * raisonner et tester isolément.
 */

/** Largeur d'un niveau d'indentation, en pixels. */
export const INDENTATION_WIDTH = 16;

export interface Projection extends DropTarget {
  /** Profondeur affichée pendant le survol, pour l'indicateur visuel. */
  depth: number;
}

/**
 * Retire de la liste plate les descendants des identifiants donnés.
 * Pendant un drag, on ne veut ni afficher ni viser le sous-arbre déplacé.
 */
export function removeDescendants(
  rows: readonly FlatTreeRow[],
  ids: readonly string[],
): FlatTreeRow[] {
  const excluded = new Set(ids);
  const out: FlatTreeRow[] = [];
  let cutoffDepth: number | null = null;

  for (const row of rows) {
    if (cutoffDepth !== null) {
      if (row.depth > cutoffDepth) continue;
      cutoffDepth = null;
    }
    if (excluded.has(row.item.id)) {
      cutoffDepth = row.depth;
    }
    out.push(row);
  }
  return out;
}

/**
 * Calcule la cible d'insertion.
 *
 * @param rows       lignes visibles, descendants de l'élément déplacé exclus
 * @param offsetX    décalage horizontal cumulé depuis le début du drag
 */
export function getProjection(
  rows: readonly FlatTreeRow[],
  activeId: string,
  overId: string,
  offsetX: number,
  indentationWidth = INDENTATION_WIDTH,
): Projection | null {
  const activeIndex = rows.findIndex((row) => row.item.id === activeId);
  const overIndex = rows.findIndex((row) => row.item.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;

  const reordered = arrayMove(rows, activeIndex, overIndex);
  const previous = reordered[overIndex - 1];
  const next = reordered[overIndex + 1];
  const active = rows[activeIndex];

  const dragDepth = Math.round(offsetX / indentationWidth);
  const projectedDepth = active.depth + dragDepth;

  // On ne peut descendre d'un niveau que sous un dossier : un tableau est une
  // feuille, le trigger `trg_items_leaf_board_*` refuserait l'écriture.
  const maxDepth = previous
    ? previous.item.type === 'folder'
      ? previous.depth + 1
      : previous.depth
    : 0;
  const minDepth = next ? next.depth : 0;
  const depth = clamp(projectedDepth, minDepth, maxDepth);

  const parentId = resolveParentId(reordered, overIndex, depth, previous);

  // Index parmi les frères déjà présents avant le point d'insertion.
  let index = 0;
  for (let i = 0; i < overIndex; i += 1) {
    const row = reordered[i];
    if (row.item.id === activeId) continue;
    if ((row.item.parentId ?? null) === parentId) index += 1;
  }

  return { parentId, index, depth };
}

function resolveParentId(
  reordered: readonly FlatTreeRow[],
  overIndex: number,
  depth: number,
  previous: FlatTreeRow | undefined,
): string | null {
  if (depth === 0 || !previous) return null;
  if (depth === previous.depth) return previous.item.parentId;
  if (depth > previous.depth) return previous.item.id;

  // On est remonté de plusieurs niveaux : on reprend le parent du dernier
  // élément rencontré à la profondeur visée.
  for (let i = overIndex - 1; i >= 0; i -= 1) {
    const row = reordered[i];
    if (row.depth === depth) return row.item.parentId;
  }
  return null;
}
