/**
 * Miroir strict des lignes SQLite (src-tauri/migrations/001_init.sql).
 *
 * Ces types décrivent la donnée BRUTE telle que renvoyée par tauri-plugin-sql :
 * snake_case, booléens en 0/1, dates en chaînes SQLite, JSON non parsé.
 * Ils ne sortent jamais de la couche `src/lib/repo/*` — l'UI consomme les
 * modèles de domaine de `tree.ts` et `canvas.ts`.
 */

/** DATETIME SQLite, format `YYYY-MM-DD HH:MM:SS` (UTC). */
export type SqlDateTime = string;

/** BOOLEAN SQLite : 0 = false, 1 = true. */
export type SqlBool = 0 | 1;

export type ItemType = 'folder' | 'board';

export interface ItemRow {
  id: string;
  parent_id: string | null;
  title: string;
  type: ItemType;
  icon: string | null;
  position: number;
  created_at: SqlDateTime;
  updated_at: SqlDateTime;
}

export type CanvasNodeType =
  | 'note'
  | 'todo_list'
  | 'image'
  | 'pdf'
  | 'group'
  | 'kanban'
  | 'github_repo'
  | 'github_profile'
  | 'github_release';

export interface CanvasNodeRow {
  id: string;
  board_id: string;
  type: CanvasNodeType;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  z_index: number;
  parent_node_id: string | null;
  /** JSON sérialisé — voir `CanvasNodeData` dans `canvas.ts`. */
  data_json: string;
  created_at: SqlDateTime;
  updated_at: SqlDateTime;
}

export interface CanvasEdgeRow {
  id: string;
  board_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  label: string | null;
  animated: SqlBool;
  /** JSON sérialisé — `React.CSSProperties` appliqué au tracé. */
  style_json: string;
  created_at: SqlDateTime;
}

export interface MediaAssetRow {
  id: string;
  file_name: string;
  file_type: string;
  local_path: string;
  file_size: number;
  content_hash: string | null;
  created_at: SqlDateTime;
}

export interface NodeSearchHitRow {
  node_id: string;
  board_id: string;
  content_text: string;
  /** Score FTS5 : plus il est bas, plus le résultat est pertinent. */
  rank: number;
}

export interface AppSettingRow {
  key: string;
  value_json: string;
  updated_at: SqlDateTime;
}
