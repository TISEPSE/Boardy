/**
 * Ordonnancement des écritures différées.
 *
 * Le canvas doit rester à 60 FPS pendant qu'on déplace une note : les mutations
 * vont d'abord en mémoire (Zustand), et la persistance SQLite est regroupée ici.
 */

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Exécute immédiatement l'appel en attente, s'il y en a un. */
  flush: () => void;
  /** Annule l'appel en attente sans l'exécuter. */
  cancel: () => void;
  /** Un appel est-il en attente ? */
  isPending: () => boolean;
}

/**
 * Debounce classique, avec en plus un `maxWait` : sur un glissement continu de
 * plusieurs secondes, le debounce seul ne déclencherait jamais d'écriture et un
 * crash perdrait tout. `maxWait` garantit une sauvegarde au moins toutes les
 * `maxWait` ms tant que des changements arrivent.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
  maxWait = wait * 4,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstCallAt = 0;
  let pendingArgs: A | null = null;

  const invoke = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const args = pendingArgs;
    pendingArgs = null;
    firstCallAt = 0;
    if (args) fn(...args);
  };

  const debounced = ((...args: A) => {
    pendingArgs = args;
    const now = Date.now();
    if (firstCallAt === 0) firstCallAt = now;

    if (timer !== null) clearTimeout(timer);

    const remainingMax = maxWait - (now - firstCallAt);
    timer = setTimeout(invoke, Math.max(0, Math.min(wait, remainingMax)));
  }) as Debounced<A>;

  debounced.flush = () => {
    if (pendingArgs !== null) invoke();
  };
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
    firstCallAt = 0;
  };
  debounced.isPending = () => pendingArgs !== null;

  return debounced;
}

/** Délai de regroupement des écritures du canvas, en millisecondes. */
export const PERSIST_DEBOUNCE_MS = 500;

/** Écriture forcée au plus tard toutes les 2 s pendant une interaction continue. */
export const PERSIST_MAX_WAIT_MS = 2000;
