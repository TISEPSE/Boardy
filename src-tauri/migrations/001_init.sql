-- =============================================================================
-- Archipel — Migration 001 : schéma initial
-- =============================================================================
-- NOTE : `PRAGMA journal_mode = WAL` n'est PAS ici. Les migrations sqlx tournent
-- dans une transaction, et ce pragma ne peut pas s'exécuter dans ce contexte.
-- Il est appliqué à l'ouverture de la base (voir src/lib/db.ts).
-- `PRAGMA foreign_keys` est activé par défaut par sqlx sur chaque connexion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Arborescence de la barre latérale (dossiers + tableaux)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES items(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Sans titre',
    type        TEXT NOT NULL CHECK(type IN ('folder', 'board')),
    icon        TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tri des fratries : requête de rendu du sidebar = un seul index scan.
CREATE INDEX IF NOT EXISTS idx_items_parent_position ON items(parent_id, position);
CREATE INDEX IF NOT EXISTS idx_items_type            ON items(type);

-- Un tableau est une feuille : il ne peut pas contenir d'enfants.
CREATE TRIGGER IF NOT EXISTS trg_items_leaf_board_insert
BEFORE INSERT ON items
WHEN NEW.parent_id IS NOT NULL
 AND (SELECT type FROM items WHERE id = NEW.parent_id) = 'board'
BEGIN
    SELECT RAISE(ABORT, 'un tableau ne peut pas contenir d''éléments');
END;

CREATE TRIGGER IF NOT EXISTS trg_items_leaf_board_update
BEFORE UPDATE OF parent_id ON items
WHEN NEW.parent_id IS NOT NULL
 AND (SELECT type FROM items WHERE id = NEW.parent_id) = 'board'
BEGIN
    SELECT RAISE(ABORT, 'un tableau ne peut pas contenir d''éléments');
END;

-- Un élément ne peut pas être son propre parent (les cycles plus profonds sont
-- interdits côté applicatif, cf. treeRepo.moveItem).
CREATE TRIGGER IF NOT EXISTS trg_items_no_self_parent
BEFORE UPDATE OF parent_id ON items
WHEN NEW.parent_id = NEW.id
BEGIN
    SELECT RAISE(ABORT, 'un élément ne peut pas être son propre parent');
END;

CREATE TRIGGER IF NOT EXISTS trg_items_touch
AFTER UPDATE ON items
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- -----------------------------------------------------------------------------
-- 2. Nœuds posés sur le tableau blanc
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canvas_nodes (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK(type IN ('note', 'todo_list', 'image', 'pdf', 'group')),
    position_x  REAL NOT NULL DEFAULT 0,
    position_y  REAL NOT NULL DEFAULT 0,
    width       REAL DEFAULT 280,
    height      REAL DEFAULT 200,
    z_index     INTEGER NOT NULL DEFAULT 0,
    parent_node_id TEXT REFERENCES canvas_nodes(id) ON DELETE CASCADE, -- appartenance à un groupe
    data_json   TEXT NOT NULL DEFAULT '{}',  -- contenu, état éditeur, chemins d'images
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chargement d'un tableau : SELECT ... WHERE board_id = ?
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_board  ON canvas_nodes(board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_parent ON canvas_nodes(parent_node_id);

-- -----------------------------------------------------------------------------
-- 3. Liens entre nœuds
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canvas_edges (
    id              TEXT PRIMARY KEY,
    board_id        TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    source_node_id  TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    target_node_id  TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    source_handle   TEXT,   -- poignée React Flow (top/right/bottom/left)
    target_handle   TEXT,
    label           TEXT,
    animated        BOOLEAN DEFAULT 0,
    style_json      TEXT DEFAULT '{}',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (source_node_id <> target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_edges_board  ON canvas_edges(board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_source ON canvas_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_target ON canvas_edges(target_node_id);

-- Anti-doublon : COALESCE car en SQLite deux NULL sont considérés distincts
-- dans un index UNIQUE, ce qui laisserait passer des liens identiques.
CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_edges_unique ON canvas_edges(
    source_node_id, COALESCE(source_handle, ''),
    target_node_id, COALESCE(target_handle, '')
);

-- -----------------------------------------------------------------------------
-- 4. Catalogue des médias locaux (app_data_dir/media/)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_assets (
    id           TEXT PRIMARY KEY,
    file_name    TEXT NOT NULL,           -- nom d'origine, affiché à l'utilisateur
    file_type    TEXT NOT NULL,           -- 'image/png', 'application/pdf', ...
    local_path   TEXT NOT NULL,           -- chemin relatif dans AppData (media/<hash>.<ext>)
    file_size    INTEGER NOT NULL,
    content_hash TEXT,                    -- déduplication (BLAKE3/SHA-256 du fichier)
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_hash ON media_assets(content_hash)
    WHERE content_hash IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. Recherche plein texte globale (Ctrl+K)
-- -----------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS node_search_fts USING fts5(
    node_id      UNINDEXED,
    board_id     UNINDEXED,
    content_text,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- Table autonome (pas de content='canvas_nodes') : le texte cherchable est le
-- rendu à plat de data_json, calculé côté TS avant écriture. On synchronise donc
-- les suppressions/déplacements ici, et les mises à jour de contenu via
-- canvasRepo.indexNodeText().
CREATE TRIGGER IF NOT EXISTS trg_canvas_nodes_fts_delete
AFTER DELETE ON canvas_nodes
BEGIN
    DELETE FROM node_search_fts WHERE node_id = OLD.id;
END;

-- -----------------------------------------------------------------------------
-- 6. Réglages applicatifs (viewport du dernier tableau, préférences, ...)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
