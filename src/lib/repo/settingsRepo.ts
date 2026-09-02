import { execute, fromJson, queryOne, toJson } from '../db';
import type { AppSettingRow } from '../../types/database';

/** Réglages clé/valeur : viewport par tableau, dernier tableau ouvert, thème… */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await queryOne<Pick<AppSettingRow, 'value_json'>>(
    `SELECT value_json FROM app_settings WHERE key = ?`,
    [key],
  );
  return fromJson<T>(row?.value_json ?? null, fallback);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await execute(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = CURRENT_TIMESTAMP`,
    [key, toJson(value)],
  );
}

export const viewportKey = (boardId: string) => `viewport:${boardId}`;
export const LAST_BOARD_KEY = 'ui:lastBoardId';
