-- =============================================================================
-- Boardy — Migration 003 : types de nœuds GitHub
-- =============================================================================
-- SQLite ne sait pas modifier une contrainte CHECK : il faut reconstruire la
-- table. Deux pièges, dont la migration 002 a fait les frais :
--
--   1. `PRAGMA foreign_keys = OFF` est SANS EFFET ici — sqlx exécute chaque
--      migration dans une transaction, et ce pragma y est ignoré. Le
--      `DROP TABLE canvas_nodes` déclenche donc les ON DELETE CASCADE et vide
--      `canvas_edges`. On sauvegarde les liens avant, on les restaure après.
--   2. Supprimer la table supprime aussi ses déclencheurs. Celui qui purge
--      l'index de recherche est recréé en fin de migration (002 l'a perdu).
--
-- En revanche le DROP ne *fait pas* jouer les déclencheurs (SQLite documente ce
-- DELETE implicite comme silencieux) : `node_search_fts` n'est pas purgé.
-- =============================================================================

CREATE TABLE canvas_edges_backup_003 AS SELECT * FROM canvas_edges;

CREATE TABLE canvas_nodes_new (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK(type IN (
        'note', 'todo_list', 'image', 'pdf', 'group', 'kanban',
        'github_repo', 'github_profile', 'github_release'
    )),
    position_x  REAL NOT NULL DEFAULT 0,
    position_y  REAL NOT NULL DEFAULT 0,
    width       REAL DEFAULT 280,
    height      REAL DEFAULT 200,
    z_index     INTEGER NOT NULL DEFAULT 0,
    parent_node_id TEXT REFERENCES canvas_nodes_new(id) ON DELETE CASCADE,
    data_json   TEXT NOT NULL DEFAULT '{}',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO canvas_nodes_new (
    id, board_id, type, position_x, position_y, width, height,
    z_index, parent_node_id, data_json, created_at, updated_at
)
SELECT
    id, board_id, type, position_x, position_y, width, height,
    z_index, parent_node_id, data_json, created_at, updated_at
FROM canvas_nodes;

DROP TABLE canvas_nodes;

-- Le renommage réécrit aussi la référence `parent_node_id` de la table
-- elle-même, et redonne une cible aux clés étrangères de `canvas_edges`.
ALTER TABLE canvas_nodes_new RENAME TO canvas_nodes;

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_board  ON canvas_nodes(board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_parent ON canvas_nodes(parent_node_id);

INSERT INTO canvas_edges SELECT * FROM canvas_edges_backup_003;
DROP TABLE canvas_edges_backup_003;

-- Déclencheur perdu lors de la reconstruction (identique à 001_init.sql).
CREATE TRIGGER IF NOT EXISTS trg_canvas_nodes_fts_delete
AFTER DELETE ON canvas_nodes
BEGIN
    DELETE FROM node_search_fts WHERE node_id = OLD.id;
END;
