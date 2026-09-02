import { execute, fromJson, query, toJson, transaction } from '../db';
import type {
  CanvasEdgeRow,
  CanvasNodeRow,
  CanvasNodeType,
  NodeSearchHitRow,
} from '../../types/database';
import {
  EDGE_DEFAULTS,
  extractSearchText,
  type BoardyEdge,
  type BoardyNode,
  type CanvasNodeData,
} from '../../types/canvas';

/**
 * Accès SQLite au contenu d'un tableau blanc.
 *
 * Toutes les écritures passent par des lots transactionnels : le store appelle
 * ces fonctions depuis un flush débouncé, jamais pendant une frame d'animation.
 */

// -----------------------------------------------------------------------------
// Lecture
// -----------------------------------------------------------------------------

function toBoardyNode(row: CanvasNodeRow): BoardyNode {
  const node = {
    id: row.id,
    type: row.type,
    position: { x: row.position_x, y: row.position_y },
    data: fromJson<CanvasNodeData>(row.data_json, {} as CanvasNodeData),
    zIndex: row.z_index,
    ...(row.width !== null ? { width: row.width } : {}),
    ...(row.height !== null ? { height: row.height } : {}),
    ...(row.parent_node_id !== null
      ? { parentId: row.parent_node_id, extent: 'parent' as const }
      : {}),
  };
  return node as BoardyNode;
}

function toBoardyEdge(row: CanvasEdgeRow): BoardyEdge {
  const stored = fromJson<Record<string, string | number>>(row.style_json, {});
  return {
    // Flèche et épaisseur ne sont pas persistées : c'est l'aspect commun des
    // liens, pas une propriété de chacun. Sans cette ligne, un tableau rechargé
    // retomberait sur le trait fin sans flèche de React Flow.
    ...EDGE_DEFAULTS,
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    sourceHandle: row.source_handle,
    targetHandle: row.target_handle,
    animated: row.animated === 1,
    ...(row.label !== null ? { label: row.label } : {}),
    // Le style enregistré pour ce lien précis l'emporte sur le défaut.
    style: { ...EDGE_DEFAULTS.style, ...stored },
    data: { style: stored },
  };
}

export interface BoardContent {
  nodes: BoardyNode[];
  edges: BoardyEdge[];
}

/** Charge nœuds et liens d'un tableau en deux requêtes indexées. */
export async function loadBoard(boardId: string): Promise<BoardContent> {
  const [nodeRows, edgeRows] = await Promise.all([
    query<CanvasNodeRow>(
      `SELECT id, board_id, type, position_x, position_y, width, height,
              z_index, parent_node_id, data_json, created_at, updated_at
         FROM canvas_nodes
        WHERE board_id = ?
        ORDER BY z_index, created_at`,
      [boardId],
    ),
    query<CanvasEdgeRow>(
      `SELECT id, board_id, source_node_id, target_node_id, source_handle,
              target_handle, label, animated, style_json, created_at
         FROM canvas_edges
        WHERE board_id = ?`,
      [boardId],
    ),
  ]);

  return {
    nodes: nodeRows.map(toBoardyNode),
    edges: edgeRows.map(toBoardyEdge),
  };
}

// -----------------------------------------------------------------------------
// Écriture — nœuds
// -----------------------------------------------------------------------------

export async function insertNode(
  boardId: string,
  node: BoardyNode,
): Promise<void> {
  const type = node.type as CanvasNodeType;
  await transaction([
    {
      sql: `INSERT INTO canvas_nodes
              (id, board_id, type, position_x, position_y, width, height,
               z_index, parent_node_id, data_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        node.id,
        boardId,
        type,
        node.position.x,
        node.position.y,
        node.width ?? null,
        node.height ?? null,
        node.zIndex ?? 0,
        node.parentId ?? null,
        toJson(node.data),
      ],
    },
    searchIndexStatement(node.id, boardId, extractSearchText(type, node.data)),
  ]);
}

/** Géométrie d'un nœud, telle que produite par un déplacement ou un resize. */
export interface NodeGeometryPatch {
  id: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  zIndex: number;
  parentNodeId: string | null;
}

/**
 * Écrit la géométrie de plusieurs nœuds d'un coup.
 *
 * C'est le chemin chaud : déplacer une sélection de 50 notes ne doit produire
 * qu'une transaction, pas 50 fsync.
 */
export async function persistGeometry(
  patches: readonly NodeGeometryPatch[],
): Promise<void> {
  if (patches.length === 0) return;
  await transaction(
    patches.map((p) => ({
      sql: `UPDATE canvas_nodes
               SET position_x = ?, position_y = ?, width = ?, height = ?,
                   z_index = ?, parent_node_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
      params: [p.x, p.y, p.width, p.height, p.zIndex, p.parentNodeId, p.id],
    })),
  );
}

/** Écrit le contenu d'un nœud et réindexe son texte cherchable. */
export async function persistNodeData(
  boardId: string,
  nodeId: string,
  type: CanvasNodeType,
  data: CanvasNodeData,
): Promise<void> {
  await transaction([
    {
      sql: `UPDATE canvas_nodes
               SET data_json = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
      params: [toJson(data), nodeId],
    },
    // Purge obligatoire avant réinsertion : FTS5 n'a pas de contrainte d'unicité
    // sur `node_id`, une simple insertion dupliquerait le nœud dans l'index.
    { sql: `DELETE FROM node_search_fts WHERE node_id = ?`, params: [nodeId] },
    searchIndexStatement(nodeId, boardId, extractSearchText(type, data)),
  ]);
}

/** Suppression ; les liens attachés partent en cascade, l'index FTS aussi. */
export async function deleteNodes(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await execute(`DELETE FROM canvas_nodes WHERE id IN (${placeholders})`, [...ids]);
}

// -----------------------------------------------------------------------------
// Écriture — liens
// -----------------------------------------------------------------------------

export async function insertEdge(
  boardId: string,
  edge: BoardyEdge,
): Promise<void> {
  await execute(
    `INSERT OR IGNORE INTO canvas_edges
        (id, board_id, source_node_id, target_node_id, source_handle,
         target_handle, label, animated, style_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      edge.id,
      boardId,
      edge.source,
      edge.target,
      edge.sourceHandle ?? null,
      edge.targetHandle ?? null,
      typeof edge.label === 'string' ? edge.label : null,
      edge.animated ? 1 : 0,
      toJson(edge.data?.style ?? edge.style ?? {}),
    ],
  );
}

export async function updateEdgeLabel(
  edgeId: string,
  label: string | null,
): Promise<void> {
  await execute(`UPDATE canvas_edges SET label = ? WHERE id = ?`, [label, edgeId]);
}

export async function deleteEdges(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await execute(`DELETE FROM canvas_edges WHERE id IN (${placeholders})`, [...ids]);
}

// -----------------------------------------------------------------------------
// Recherche plein texte
// -----------------------------------------------------------------------------

/**
 * `node_search_fts` est une table FTS5 autonome (le texte cherchable est un
 * rendu à plat de `data_json`, calculé côté TS). On remplace donc la ligne
 * plutôt que de compter sur un trigger de contenu externe.
 */
function searchIndexStatement(nodeId: string, boardId: string, text: string) {
  return {
    sql: `INSERT INTO node_search_fts (node_id, board_id, content_text)
          VALUES (?, ?, ?)`,
    params: [nodeId, boardId, text],
  };
}

/** Réindexe un nœud : purge puis réinsertion, en une transaction. */
export async function indexNodeText(
  nodeId: string,
  boardId: string,
  text: string,
): Promise<void> {
  await transaction([
    { sql: `DELETE FROM node_search_fts WHERE node_id = ?`, params: [nodeId] },
    searchIndexStatement(nodeId, boardId, text),
  ]);
}

export interface SearchHit {
  nodeId: string;
  boardId: string;
  snippet: string;
}

/** Recherche globale (Ctrl+K) sur l'ensemble des tableaux. */
export async function searchNodes(
  term: string,
  limit = 30,
): Promise<SearchHit[]> {
  const trimmed = term.trim();
  if (trimmed.length === 0) return [];

  // Requête préfixe sur chaque mot, avec échappement des guillemets FTS5.
  const matchExpr = trimmed
    .split(/\s+/)
    .map((word) => `"${word.replace(/"/g, '""')}"*`)
    .join(' ');

  const rows = await query<Pick<NodeSearchHitRow, 'node_id' | 'board_id'> & {
    snippet: string;
  }>(
    `SELECT node_id, board_id,
            snippet(node_search_fts, 2, '<mark>', '</mark>', '…', 12) AS snippet
       FROM node_search_fts
      WHERE node_search_fts MATCH ?
      ORDER BY rank
      LIMIT ?`,
    [matchExpr, limit],
  );

  return rows.map((row) => ({
    nodeId: row.node_id,
    boardId: row.board_id,
    snippet: row.snippet,
  }));
}
