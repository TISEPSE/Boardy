import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

import { execute, queryOne } from '../db';
import { createId } from '../id';
import type { MediaAssetRow } from '../../types/database';

/** Catalogue des médias locaux (`app_data_dir/media/`). */

export interface MediaAsset {
  id: string;
  fileName: string;
  fileType: string;
  /** Chemin relatif au répertoire de données, ex. `media/<hash>.pdf`. */
  localPath: string;
  fileSize: number;
}

function toMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    localPath: row.local_path,
    fileSize: row.file_size,
  };
}

export async function getAsset(id: string): Promise<MediaAsset | null> {
  const row = await queryOne<MediaAssetRow>(
    `SELECT id, file_name, file_type, local_path, file_size, content_hash, created_at
       FROM media_assets WHERE id = ?`,
    [id],
  );
  return row ? toMediaAsset(row) : null;
}

export async function insertAsset(asset: MediaAsset & { contentHash?: string }) {
  await execute(
    `INSERT INTO media_assets
        (id, file_name, file_type, local_path, file_size, content_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      asset.id,
      asset.fileName,
      asset.fileType,
      asset.localPath,
      asset.fileSize,
      asset.contentHash ?? null,
    ],
  );
}

async function findAssetByHash(hash: string): Promise<MediaAsset | null> {
  const row = await queryOne<MediaAssetRow>(
    `SELECT id, file_name, file_type, local_path, file_size, content_hash, created_at
       FROM media_assets WHERE content_hash = ?`,
    [hash],
  );
  return row ? toMediaAsset(row) : null;
}

/** Ce que la commande Rust renvoie après avoir copié le fichier. */
interface ImportedAsset {
  file_name: string;
  file_type: string;
  local_path: string;
  file_size: number;
  content_hash: string;
}

/**
 * Importe un fichier local : copie côté Rust, puis enregistrement au catalogue.
 *
 * La déduplication se joue à deux niveaux — Rust ne recopie pas un contenu déjà
 * présent sur le disque, et on réutilise ici la ligne `media_assets` existante.
 * Coller deux fois le même polycopié ne crée donc ni doublon fichier ni doublon
 * en base.
 */
export async function importFile(sourcePath: string): Promise<MediaAsset> {
  const imported = await invoke<ImportedAsset>('import_canvas_asset', {
    sourcePath,
  });

  const existing = await findAssetByHash(imported.content_hash);
  if (existing) return existing;

  const asset: MediaAsset = {
    id: createId(),
    fileName: imported.file_name,
    fileType: imported.file_type,
    localPath: imported.local_path,
    fileSize: imported.file_size,
  };
  await insertAsset({ ...asset, contentHash: imported.content_hash });
  return asset;
}

/** Extensions proposées dans le sélecteur de fichiers. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];
export const PDF_EXTENSIONS = ['pdf'];

export function isPdf(asset: MediaAsset): boolean {
  return asset.fileType === 'application/pdf';
}

/**
 * URL affichable par le webview pour un média local.
 *
 * `local_path` est stocké en relatif : le répertoire de données change d'un
 * poste à l'autre, et une base copiée sur une autre machine doit rester lisible.
 * La résolution en chemin absolu se fait donc au moment de l'affichage.
 */
export async function resolveAssetUrl(asset: MediaAsset): Promise<string> {
  const base = await appDataDir();
  const absolute = await join(base, asset.localPath);
  return convertFileSrc(absolute);
}
