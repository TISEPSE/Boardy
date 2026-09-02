import { useEffect, useState } from 'react';

import * as mediaRepo from '../lib/repo/mediaRepo';

/**
 * Résout un `assetId` en URL affichable (`asset://`).
 *
 * Un cache module évite de refaire l'aller-retour SQLite + résolution de chemin
 * à chaque montage : sur un tableau qui contient vingt images, le même média
 * revient souvent, et le canvas monte/démonte les nœuds au fil du zoom.
 */
const urlCache = new Map<string, Promise<string | null>>();

function loadUrl(assetId: string): Promise<string | null> {
  let pending = urlCache.get(assetId);
  if (!pending) {
    pending = mediaRepo
      .getAsset(assetId)
      .then((asset) => (asset ? mediaRepo.resolveAssetUrl(asset) : null))
      .catch(() => null);
    urlCache.set(assetId, pending);
  }
  return pending;
}

export interface AssetUrlState {
  url: string | null;
  isLoading: boolean;
}

export function useAssetUrl(assetId: string | null | undefined): AssetUrlState {
  const [state, setState] = useState<AssetUrlState>({
    url: null,
    isLoading: Boolean(assetId),
  });

  useEffect(() => {
    if (!assetId) {
      setState({ url: null, isLoading: false });
      return;
    }

    let cancelled = false;
    setState({ url: null, isLoading: true });

    void loadUrl(assetId).then((url) => {
      if (!cancelled) setState({ url, isLoading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return state;
}

/** À appeler après remplacement ou suppression d'un média. */
export function invalidateAssetUrl(assetId: string): void {
  urlCache.delete(assetId);
}
