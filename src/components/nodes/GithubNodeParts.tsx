import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Copy,
  Github,
  Loader2,
  Pencil,
  RefreshCw,
  Settings2,
} from 'lucide-react';

import { useCanvasStore } from '../../stores/useCanvasStore';
import { useGithubStore } from '../../stores/useGithubStore';
import { useSettingsStore } from '../../stores/useSettingsStore';

/* -------------------------------------------------------------------------- */
/*  Chargement                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Au-delà de ce délai, une tuile déjà remplie se rafraîchit d'elle-même à
 * l'ouverture du tableau. En deçà, elle affiche son cache : ouvrir un tableau
 * de dix tuiles ne doit pas coûter dix requêtes à chaque fois.
 */
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface ResourceOptions<T> {
  nodeId: string;
  /** `false` tant que la cible n'est pas renseignée (dépôt vide, par exemple). */
  ready: boolean;
  /** Identifie la cible : un changement relance le chargement. */
  target: string;
  fetchedAt: string | null;
  load: () => Promise<T | null>;
}

/**
 * Remplit `payload` / `fetchedAt` / `error` du nœud, et expose un
 * rafraîchissement manuel.
 *
 * Le résultat est écrit dans les données du nœud, donc persisté : la tuile
 * s'affiche instantanément au chargement suivant, y compris hors ligne.
 */
export function useGithubResource<T>({
  nodeId,
  ready,
  target,
  fetchedAt,
  load,
}: ResourceOptions<T>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const status = useGithubStore((s) => s.status);
  const ensureAccount = useGithubStore((s) => s.ensureAccount);
  const [loading, setLoading] = useState(false);

  // Le chargeur change à chaque rendu ; le garder dans une ref évite d'en faire
  // une dépendance d'effet, ce qui relancerait une requête en boucle.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void ensureAccount();
  }, [ensureAccount]);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await loadRef.current();
      updateNodeData(nodeId, {
        payload,
        fetchedAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      updateNodeData(nodeId, { error: String(error) });
    } finally {
      setLoading(false);
    }
  }, [nodeId, updateNodeData]);

  // `fetchedAt` fait partie des dépendances : c'est ce qui permet de relancer
  // après une remise à zéro du cache, même si la cible n'a pas changé. Le cycle
  // se referme de lui-même — la requête écrit un horodatage récent, et la passe
  // suivante s'arrête sur le test d'âge.
  useEffect(() => {
    if (!ready || status !== 'connected') return;
    const age = fetchedAt ? Date.now() - Date.parse(fetchedAt) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(age) && age < CACHE_MAX_AGE_MS) return;
    void run();
  }, [ready, status, target, fetchedAt, run]);

  return { loading, refresh: run };
}

/* -------------------------------------------------------------------------- */
/*  Habillage                                                                 */
/* -------------------------------------------------------------------------- */

/** En-tête commun : marque GitHub, intitulé de la cible, bouton de relecture. */
export function GithubHeader({
  title,
  subtitle,
  loading,
  onRefresh,
  onEditTarget,
  copyUrl,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  onRefresh?: () => void;
  onEditTarget?: () => void;
  copyUrl?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!copyUrl) return;
    void navigator.clipboard.writeText(copyUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className="flex items-center gap-2 border-b border-black/[0.07] px-3 py-2 dark:border-white/[0.07]">
      <Github className="size-4 shrink-0 text-[#24292F] dark:text-[#E6EDF3]" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono-google text-[12px] font-semibold leading-tight">
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-[10px] leading-tight text-[#5F6368] dark:text-[#9AA0A6]">
            {subtitle}
          </p>
        )}
      </div>
      {copyUrl && (
        <button
          type="button"
          title={copied ? 'Lien copié' : 'Copier le lien'}
          aria-label="Copier le lien"
          onClick={copy}
          className="nodrag flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA]"
        >
          <Copy className={copied ? 'size-3.5 text-[#0B57D0] dark:text-[#A8C7FA]' : 'size-3.5'} />
        </button>
      )}
      {onEditTarget && (
        <button
          type="button"
          title="Changer de cible"
          aria-label="Changer de cible"
          onClick={onEditTarget}
          className="nodrag flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA]"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {onRefresh && (
        <button
          type="button"
          title="Rafraîchir"
          aria-label="Rafraîchir"
          disabled={loading}
          onClick={onRefresh}
          className="nodrag flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] disabled:cursor-progress dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA]"
        >
          <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
        </button>
      )}
    </div>
  );
}

/** Écran affiché tant qu'aucun jeton n'est enregistré. */
export function NotConnected() {
  const openSettings = useSettingsStore((s) => s.openSettings);
  return (
    <Centered>
      <Github className="size-7 text-slate-400" />
      <p className="text-[12px] font-medium">Compte GitHub non relié</p>
      <p className="max-w-[220px] text-[11px] leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
        Enregistrez un jeton en lecture seule pour que cette tuile affiche des
        données réelles.
      </p>
      <button
        type="button"
        onClick={() => openSettings()}
        className="nodrag mt-1 flex h-[28px] cursor-pointer items-center gap-1.5 rounded-full bg-[#0B57D0] px-3.5 text-[11px] font-semibold text-white transition-all hover:bg-[#0842A0] active:scale-95 dark:bg-[#A8C7FA] dark:text-[#041E49] dark:hover:bg-[#8AB4F8]"
      >
        <Settings2 className="size-3.5" />
        Ouvrir les paramètres
      </button>
    </Centered>
  );
}

export function LoadingState() {
  return (
    <Centered>
      <Loader2 className="size-5 animate-spin text-[#0B57D0] dark:text-[#A8C7FA]" />
      <p className="text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">Lecture de GitHub…</p>
    </Centered>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Centered>
      <AlertTriangle className="size-6 text-amber-500" />
      <p className="max-w-[260px] text-[11px] leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="nodrag mt-1 flex h-[26px] cursor-pointer items-center gap-1.5 rounded-full border border-black/[0.12] px-3 text-[11px] font-semibold transition-colors hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] dark:border-white/[0.12] dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA]"
      >
        <RefreshCw className="size-3" />
        Réessayer
      </button>
    </Centered>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center">
      {children}
    </div>
  );
}

/**
 * Saisie de la cible, affichée tant que la tuile n'en a pas.
 *
 * `nodrag nopan` : sans ces classes React Flow intercepte le clic pour déplacer
 * le nœud, et le champ ne prend jamais le focus.
 */
export function TargetPrompt({
  placeholder,
  hint,
  initialValue = '',
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  hint: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Centered>
      <Github className="size-6 text-slate-400" />
      <p className="text-[11px] leading-snug text-[#5F6368] dark:text-[#9AA0A6]">{hint}</p>
      <form
        className="nodrag nopan flex w-full max-w-[260px] items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          // La validation appartient à l'appelant : le profil accepte une
          // saisie vide (« mon compte »), pas le dépôt.
          onSubmit(value);
        }}
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') onCancel?.();
          }}
          placeholder={placeholder}
          spellCheck={false}
          className="h-[28px] min-w-0 flex-1 rounded-full border border-black/[0.12] bg-white px-3 font-mono-google text-[11px] outline-none transition-colors focus:border-[#0B57D0] dark:border-white/[0.14] dark:bg-[#16181C] dark:focus:border-[#A8C7FA]"
        />
        <button
          type="submit"
          className="flex h-[28px] shrink-0 cursor-pointer items-center rounded-full bg-[#0B57D0] px-3 text-[11px] font-semibold text-white transition-all hover:bg-[#0842A0] active:scale-95 dark:bg-[#A8C7FA] dark:text-[#041E49] dark:hover:bg-[#8AB4F8]"
        >
          Charger
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-[28px] shrink-0 cursor-pointer items-center rounded-full px-2 text-[11px] font-medium text-[#5F6368] transition-colors hover:text-[#0B57D0] dark:text-[#9AA0A6] dark:hover:text-[#A8C7FA]"
          >
            Annuler
          </button>
        )}
      </form>
    </Centered>
  );
}

/* -------------------------------------------------------------------------- */
/*  Formatage                                                                 */
/* -------------------------------------------------------------------------- */

const RELATIVE = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
];

/** « il y a 3 heures », à partir d'une date ISO 8601. */
export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const elapsed = Date.parse(iso) - Date.now();
  if (Number.isNaN(elapsed)) return '—';
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return RELATIVE.format(Math.round(elapsed / ms), unit);
  }
  return "à l'instant";
}

const COMPACT = new Intl.NumberFormat('fr', { notation: 'compact', maximumFractionDigits: 1 });

/** 1234 → « 1,2 k ». */
export function compactNumber(value: number): string {
  return COMPACT.format(value);
}

/**
 * Couleurs officielles de GitHub pour les langages les plus courants. Les
 * autres reçoivent une teinte déterministe, stable d'un rendu à l'autre.
 */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Rust: '#dea584',
  Python: '#3572A5',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Lua: '#000080',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Zig: '#ec915c',
};

export function languageColor(name: string): string {
  const known = LANGUAGE_COLORS[name];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 58% 52%)`;
}
