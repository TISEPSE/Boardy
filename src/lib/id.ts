/**
 * Identifiants d'entités. Générés côté client pour que l'UI puisse afficher un
 * nœud immédiatement (mise à jour optimiste) sans attendre l'aller-retour SQLite.
 */
export function createId(): string {
  return crypto.randomUUID();
}
