import { execute, query, queryOne } from '../db';

/**
 * Chiffres réels de l'espace de travail, affichés dans les paramètres.
 *
 * Tout est compté en une seule requête : quatre `COUNT` sur des tables indexées
 * coûtent moins qu'un aller-retour IPC supplémentaire par ligne.
 */
export interface WorkspaceStats {
  folders: number;
  boards: number;
  nodes: number;
  edges: number;
  assets: number;
  /** Somme des tailles des médias importés, en octets. */
  assetBytes: number;
  /** Taille du fichier SQLite, hors journal WAL, en octets. */
  dbBytes: number;
}

interface CountsRow {
  folders: number;
  boards: number;
  nodes: number;
  edges: number;
  assets: number;
  asset_bytes: number | null;
}

export async function getWorkspaceStats(): Promise<WorkspaceStats> {
  const counts = await queryOne<CountsRow>(
    `SELECT
       (SELECT COUNT(*) FROM items WHERE type = 'folder')  AS folders,
       (SELECT COUNT(*) FROM items WHERE type = 'board')   AS boards,
       (SELECT COUNT(*) FROM canvas_nodes)                 AS nodes,
       (SELECT COUNT(*) FROM canvas_edges)                 AS edges,
       (SELECT COUNT(*) FROM media_assets)                 AS assets,
       (SELECT SUM(file_size) FROM media_assets)           AS asset_bytes`,
  );

  return {
    folders: counts?.folders ?? 0,
    boards: counts?.boards ?? 0,
    nodes: counts?.nodes ?? 0,
    edges: counts?.edges ?? 0,
    assets: counts?.assets ?? 0,
    assetBytes: counts?.asset_bytes ?? 0,
    dbBytes: await getDatabaseBytes(),
  };
}

/**
 * `page_count * page_size` : la taille réelle du fichier, y compris les pages
 * libérées par les suppressions et jamais rendues au système — c'est
 * précisément ce que `VACUUM` récupère.
 */
async function getDatabaseBytes(): Promise<number> {
  const rows = await query<{ bytes: number }>(
    `SELECT (SELECT * FROM pragma_page_count()) * (SELECT * FROM pragma_page_size()) AS bytes`,
  );
  return rows[0]?.bytes ?? 0;
}

/**
 * Réécrit la base sans les pages libres et renvoie le nombre d'octets rendus.
 *
 * `VACUUM` demande un verrou exclusif : il échoue tant qu'une écriture est en
 * cours. L'appelant remonte le message tel quel plutôt que de réessayer en
 * boucle — c'est une action de maintenance déclenchée à la main.
 */
export async function compactDatabase(): Promise<number> {
  const before = await getDatabaseBytes();
  await execute('VACUUM');
  const after = await getDatabaseBytes();
  return Math.max(0, before - after);
}

/** Formate un nombre d'octets pour l'affichage (`1,2 Mo`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[unit]}`;
}
