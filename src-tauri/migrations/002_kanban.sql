-- =============================================================================
-- Archipel — Migration 002 : Support du type de nœud kanban
-- =============================================================================

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS canvas_nodes_new (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK(type IN ('note', 'todo_list', 'image', 'pdf', 'group', 'kanban')),
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
    id, board_id, type, position_x, position_y, width, height, z_index, parent_node_id, data_json, created_at, updated_at
)
SELECT
    id, board_id, type, position_x, position_y, width, height, z_index, parent_node_id, data_json, created_at, updated_at
FROM canvas_nodes;

DROP TABLE canvas_nodes;

ALTER TABLE canvas_nodes_new RENAME TO canvas_nodes;

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_board  ON canvas_nodes(board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_parent ON canvas_nodes(parent_node_id);

PRAGMA foreign_keys = ON;
