/**
 * Ordonnancement des fratries de la barre latérale.
 *
 * `items.position` est un INTEGER : plutôt que d'intercaler des valeurs
 * fractionnaires, on renumérote la fratrie concernée de 0 à n-1 après chaque
 * déplacement. Une fratrie compte typiquement quelques dizaines d'éléments, et
 * la renumérotation part en une seule transaction — c'est plus simple à
 * raisonner qu'un index fractionnaire, et sans dérive numérique.
 */

/** Déplace `from` vers `to` en renvoyant un nouveau tableau. */
export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from < 0 || from >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(clamp(to, 0, next.length), 0, moved);
  return next;
}

/** Insère `id` à `index`, en le retirant d'abord s'il est déjà présent. */
export function arrayInsertAt(
  list: readonly string[],
  id: string,
  index: number,
): string[] {
  const without = list.filter((entry) => entry !== id);
  without.splice(clamp(index, 0, without.length), 0, id);
  return without;
}

/** Associe à chaque identifiant sa position finale (0..n-1). */
export function reindex(orderedIds: readonly string[]): Array<{
  id: string;
  position: number;
}> {
  return orderedIds.map((id, position) => ({ id, position }));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
