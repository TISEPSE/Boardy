import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';

/**
 * Accès unique à la base SQLite locale.
 *
 * `Database.load` ouvre un pool côté Rust ; on mémoïse la promesse pour que des
 * appels concurrents au démarrage (sidebar + canvas) partagent la même
 * connexion au lieu d'en ouvrir plusieurs.
 */
const DB_URL = 'sqlite:boardy.db';

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  dbPromise ??= Database.load(DB_URL).then(async (db) => {
    // WAL : lectures concurrentes pendant une écriture, et surtout des commits
    // beaucoup moins coûteux — le canvas écrit par lots toutes les 500 ms.
    // Le pragma ne peut pas vivre dans une migration (sqlx les enveloppe dans
    // une transaction), il est donc appliqué ici, à l'ouverture.
    await db.execute('PRAGMA journal_mode = WAL');
    return db;
  });
  return dbPromise;
}

/** À n'utiliser que dans les tests, pour repartir d'un pool neuf. */
export function resetDb(): void {
  dbPromise = null;
}

/** `SELECT` typé. */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

/** `SELECT` renvoyant au plus une ligne. */
export async function queryOne<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** `INSERT` / `UPDATE` / `DELETE`. */
export async function execute(sql: string, params: unknown[] = []) {
  const db = await getDb();
  return db.execute(sql, params);
}

/**
 * Exécute plusieurs écritures dans une seule transaction.
 *
 * Déléguée à la commande Rust `db_transaction`, et non au plugin SQL : celui-ci
 * sert chaque `execute` depuis un pool de 10 connexions, si bien qu'un
 * `BEGIN IMMEDIATE` envoyé par IPC ouvrait la transaction sur une connexion qui
 * retournait aussitôt au pool. Les instructions suivantes tombaient alors sur
 * d'autres connexions (`database is locked (5)`) et le `COMMIT` n'atteignait
 * jamais la bonne, laissant le verrou d'écriture WAL tenu jusqu'à la fermeture
 * de l'application. Côté Rust, le pool est limité à une connexion et la
 * transaction passe par `sqlx::Transaction`.
 *
 * Indispensable pour les flushs par lot du canvas, où l'on écrit des dizaines
 * de nœuds d'un coup — sans transaction, chaque `UPDATE` déclencherait son
 * propre fsync.
 */
export async function transaction(
  statements: Array<{ sql: string; params?: unknown[] }>,
): Promise<void> {
  if (statements.length === 0) return;

  await invoke('db_transaction', {
    statements: statements.map(({ sql, params }) => ({ sql, params: params ?? [] })),
  });
}

/** Sérialise `data_json` / `style_json` avec une valeur de repli sûre. */
export function toJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

/** Désérialise une colonne JSON en tolérant une valeur corrompue. */
export function fromJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn('[boardy] colonne JSON illisible, valeur par défaut utilisée');
    return fallback;
  }
}
