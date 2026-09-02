import { create } from 'zustand';

import {
  forgetToken,
  getAccount,
  saveToken,
  type GithubAccount,
} from '../lib/github';

/**
 * État du rattachement à GitHub, partagé par les tuiles du canvas et par la
 * page des paramètres.
 *
 * Le jeton lui-même n'entre jamais ici : il reste dans le trousseau du système
 * et n'est manipulé que par Rust. Ce store ne retient que ce qui doit être
 * affiché — le compte, l'état de la vérification, le dernier échec.
 */

export type GithubStatus =
  | 'unknown'
  | 'checking'
  | 'connected'
  | 'disconnected'
  | 'error';

interface GithubState {
  status: GithubStatus;
  account: GithubAccount | null;
  error: string | null;
  /**
   * Interroge le trousseau une seule fois par session : trois tuiles montées
   * ensemble ne doivent pas déclencher trois appels à `/user`.
   */
  ensureAccount: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  connect: (token: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
}

/** Vérification en cours, partagée entre appelants simultanés. */
let pending: Promise<void> | null = null;

export const useGithubStore = create<GithubState>((set, get) => {
  const load = async () => {
    set({ status: 'checking', error: null });
    try {
      const account = await getAccount();
      set({
        account,
        status: account ? 'connected' : 'disconnected',
        error: null,
      });
    } catch (error) {
      set({ account: null, status: 'error', error: String(error) });
    }
  };

  return {
    status: 'unknown',
    account: null,
    error: null,

    async ensureAccount() {
      if (get().status !== 'unknown') return;
      pending ??= load().finally(() => {
        pending = null;
      });
      await pending;
    },

    async refreshAccount() {
      pending ??= load().finally(() => {
        pending = null;
      });
      await pending;
    },

    async connect(token) {
      set({ status: 'checking', error: null });
      try {
        const account = await saveToken(token);
        set({ account, status: 'connected', error: null });
        return true;
      } catch (error) {
        // Le jeton refusé n'écrase pas celui qui fonctionnait peut-être déjà :
        // `github_save_token` ne l'écrit qu'après validation.
        set({ status: 'error', error: String(error) });
        return false;
      }
    },

    async disconnect() {
      try {
        await forgetToken();
        set({ account: null, status: 'disconnected', error: null });
      } catch (error) {
        set({ status: 'error', error: String(error) });
      }
    },
  };
});
