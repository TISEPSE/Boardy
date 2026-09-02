import { execute, query, transaction } from '../db';
import { createId } from '../id';
import { reindex } from '../ordering';
import type { ItemRow, ItemType } from '../../types/database';
import type { TreeItem } from '../../types/tree';

/**
 * Accès SQLite à l'arborescence de la barre latérale.
 *
 * Seule couche autorisée à manipuler des lignes brutes : elle traduit
 * `ItemRow` (snake_case) en `TreeItem` (domaine) et inversement.
 */

function toTreeItem(row: ItemRow): TreeItem {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    type: row.type,
    icon: row.icon,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Charge l'arbre complet en une requête.
 *
 * Un chargement paresseux par dossier multiplierait les allers-retours IPC pour
 * quelques milliers de lignes au plus — l'arbre d'un étudiant tient largement en
 * mémoire, et le tri est fait par l'index `idx_items_parent_position`.
 */
export async function listItems(): Promise<TreeItem[]> {
  const rows = await query<ItemRow>(
    `SELECT id, parent_id, title, type, icon, position, created_at, updated_at
       FROM items
      ORDER BY parent_id, position, created_at`,
  );
  return rows.map(toTreeItem);
}

export interface CreateItemInput {
  type: ItemType;
  parentId?: string | null;
  title?: string;
  icon?: string | null;
  /** Position dans la fratrie ; par défaut, ajouté à la fin. */
  position?: number;
}

export async function createItem(input: CreateItemInput): Promise<TreeItem> {
  const id = createId();
  const parentId = input.parentId ?? null;
  const title = input.title ?? (input.type === 'folder' ? 'Nouveau dossier' : 'Nouveau tableau');
  const icon = input.icon ?? null;
  const position = input.position ?? (await nextPosition(parentId));

  await execute(
    `INSERT INTO items (id, parent_id, title, type, icon, position)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, parentId, title, input.type, icon, position],
  );

  const [row] = await query<ItemRow>(
    `SELECT id, parent_id, title, type, icon, position, created_at, updated_at
       FROM items WHERE id = ?`,
    [id],
  );
  return toTreeItem(row);
}

async function nextPosition(parentId: string | null): Promise<number> {
  const rows = await query<{ next: number }>(
    parentId === null
      ? `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM items WHERE parent_id IS NULL`
      : `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM items WHERE parent_id = ?`,
    parentId === null ? [] : [parentId],
  );
  return rows[0]?.next ?? 0;
}

export async function renameItem(id: string, title: string): Promise<void> {
  await execute(
    `UPDATE items SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [title, id],
  );
}

export async function setItemIcon(id: string, icon: string | null): Promise<void> {
  await execute(
    `UPDATE items SET icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [icon, id],
  );
}

/** Supprime un élément ; `ON DELETE CASCADE` emporte le sous-arbre et son canvas. */
export async function deleteItem(id: string): Promise<void> {
  await execute(`DELETE FROM items WHERE id = ?`, [id]);
}

/**
 * Applique un glisser-déposer : rattache `id` à `parentId` et renumérote la
 * fratrie d'arrivée (et celle de départ si elle diffère).
 *
 * Le tout en une transaction : un déplacement à moitié écrit laisserait deux
 * éléments sur la même position et un ordre non déterministe au rechargement.
 */
export async function moveItem(params: {
  id: string;
  parentId: string | null;
  /** Fratrie de destination dans son ordre final, `id` inclus. */
  targetSiblingIds: readonly string[];
  /** Fratrie d'origine après retrait de `id`, si le parent a changé. */
  sourceSiblingIds?: readonly string[];
}): Promise<void> {
  const statements: Array<{ sql: string; params: unknown[] }> = [
    {
      sql: `UPDATE items SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params: [params.parentId, params.id],
    },
  ];

  for (const { id, position } of reindex(params.targetSiblingIds)) {
    statements.push({
      sql: `UPDATE items SET position = ? WHERE id = ?`,
      params: [position, id],
    });
  }

  if (params.sourceSiblingIds) {
    for (const { id, position } of reindex(params.sourceSiblingIds)) {
      statements.push({
        sql: `UPDATE items SET position = ? WHERE id = ?`,
        params: [position, id],
      });
    }
  }

  await transaction(statements);
}

/** Renumérote une fratrie sans changer de parent (tri interne). */
export async function reorderSiblings(
  orderedIds: readonly string[],
): Promise<void> {
  await transaction(
    reindex(orderedIds).map(({ id, position }) => ({
      sql: `UPDATE items SET position = ? WHERE id = ?`,
      params: [position, id],
    })),
  );
}
