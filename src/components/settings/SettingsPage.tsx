import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getTauriVersion, getVersion } from '@tauri-apps/api/app';
import { appConfigDir } from '@tauri-apps/api/path';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Github,
  Grid3x3,
  HardDrive,
  Info,
  Keyboard,
  Loader2,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';

import { useGithubStore } from '../../stores/useGithubStore';
import { useSettingsStore, GRID_SIZE } from '../../stores/useSettingsStore';
import {
  compactDatabase,
  formatBytes,
  getWorkspaceStats,
  type WorkspaceStats,
} from '../../lib/repo/statsRepo';

/* -------------------------------------------------------------------------- */
/*  Sections                                                                  */
/* -------------------------------------------------------------------------- */

type SectionId =
  | 'appearance'
  | 'canvas'
  | 'github'
  | 'storage'
  | 'shortcuts'
  | 'about';

interface SectionDef {
  id: SectionId;
  label: string;
  group: string;
  icon: typeof Sun;
  title: string;
  lede: string;
}

const SECTIONS: SectionDef[] = [
  {
    id: 'appearance',
    label: 'Apparence',
    group: 'Interface',
    icon: Sun,
    title: 'Apparence',
    lede: "Thème de l'application et disposition générale de la fenêtre.",
  },
  {
    id: 'canvas',
    label: 'Tableau blanc',
    group: 'Interface',
    icon: Grid3x3,
    title: 'Tableau blanc',
    lede: 'Trame de fond, aimantation et repères affichés sur le canvas.',
  },
  {
    id: 'github',
    label: 'GitHub',
    group: 'Données',
    icon: Github,
    title: 'Compte GitHub',
    lede:
      'Jeton en lecture seule utilisé par les tuiles GitHub du tableau blanc.',
  },
  {
    id: 'storage',
    label: 'Stockage',
    group: 'Données',
    icon: HardDrive,
    title: 'Stockage local',
    lede: "Contenu de la base SQLite et maintenance du fichier.",
  },
  {
    id: 'shortcuts',
    label: 'Raccourcis',
    group: 'Aide',
    icon: Keyboard,
    title: 'Raccourcis clavier',
    lede: 'Les commandes reconnues par la fenêtre et par le canvas.',
  },
  {
    id: 'about',
    label: 'À propos',
    group: 'Aide',
    icon: Info,
    title: 'À propos de Boardy',
    lede: "Versions installées et emplacement des données sur le disque.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function SettingsPage() {
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const [active, setActive] = useState<SectionId>('appearance');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSettings]);

  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="flex size-full flex-col bg-[#F7F8FA] text-[#1F1F1F] dark:bg-[#111318] dark:text-[#E3E2E6] font-sans-google select-none">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-4 dark:border-white/[0.07] dark:bg-[#16181C]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Retour (Échap)"
            aria-label="Retour"
            onClick={() => closeSettings()}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-full text-slate-600 hover:bg-black/5 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white transition-all cursor-pointer font-medium text-xs mr-2 border border-black/5 dark:border-white/5"
          >
            <ChevronLeft className="size-4" />
            <span>Retour</span>
          </button>
          <div className="h-4 w-px bg-black/10 dark:bg-white/10 mr-1" />
          <h1 className="text-[13px] font-semibold tracking-[-0.01em]">Paramètres</h1>
          <span className="text-black/20 dark:text-white/20">/</span>
          <span className="text-[13px] text-[#5F6368] dark:text-[#9AA0A6]">{section.label}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Rail active={active} onSelect={setActive} />

        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-10 py-9">
            <h2 className="text-[19px] font-semibold tracking-[-0.015em]">{section.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
              {section.lede}
            </p>

            <div className="mt-7 flex flex-col gap-8">
              {active === 'appearance' && <AppearanceSection />}
              {active === 'canvas' && <CanvasSection />}
              {active === 'github' && <GithubSection />}
              {active === 'storage' && <StorageSection />}
              {active === 'shortcuts' && <ShortcutsSection />}
              {active === 'about' && <AboutSection />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rail de navigation                                                        */
/* -------------------------------------------------------------------------- */

function Rail({
  active,
  onSelect,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  // Les sections sont regroupées dans l'ordre du tableau : un simple parcours
  // suffit, inutile de trier ou d'indexer.
  const groups: Array<{ name: string; items: SectionDef[] }> = [];
  for (const item of SECTIONS) {
    const last = groups[groups.length - 1];
    if (last?.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <nav className="w-[212px] shrink-0 overflow-y-auto border-r border-black/[0.08] bg-white px-2.5 py-4 dark:border-white/[0.07] dark:bg-[#16181C]">
      {groups.map((group) => (
        <div key={group.name} className="mb-5 last:mb-0">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#80868B] dark:text-[#7E8286]">
            {group.name}
          </p>
          <div className="flex flex-col gap-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={[
                    'flex h-[32px] w-full cursor-pointer items-center gap-2.5 rounded-full px-3 text-[13px] transition-all active:scale-[0.98]',
                    isActive
                      ? 'bg-[#D3E3FD] font-bold text-[#041E49] dark:bg-[#004A77] dark:text-[#C2E7FF]'
                      : 'font-medium text-[#3C4043] hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] dark:text-[#C4C7C5] dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA]',
                  ].join(' ')}
                >
                  <Icon className="size-[15px] shrink-0" strokeWidth={1.9} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                */
/* -------------------------------------------------------------------------- */

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section>
      {label && (
        <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#80868B] dark:text-[#7E8286]">
          {label}
        </p>
      )}
      <div className="overflow-hidden rounded-[7px] border border-black/[0.09] bg-white dark:border-white/[0.08] dark:bg-[#1A1D21]">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-6 border-b border-black/[0.06] px-4 py-2.5 last:border-b-0 dark:border-white/[0.06]">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight">{label}</p>
        {description && (
          <p className="mt-1 text-[12px] leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: typeof Sun }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-[2px] rounded-full border border-black/[0.09] bg-black/[0.035] p-[3px] dark:border-white/[0.09] dark:bg-white/[0.05]">
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={[
              'flex h-[26px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] transition-all active:scale-95',
              isActive
                ? 'bg-white font-semibold text-[#0B57D0] shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:bg-[#2A2E34] dark:text-[#A8C7FA]'
                : 'font-medium text-[#5F6368] hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] dark:text-[#9AA0A6] dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA]',
            ].join(' ')}
          >
            {Icon && <Icon className="size-[13px]" strokeWidth={2} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative block h-[20px] w-[34px] shrink-0 cursor-pointer rounded-full ring-offset-2 transition-all duration-150',
        'ring-offset-white hover:ring-2 dark:ring-offset-[#1A1D21]',
        checked
          ? 'bg-[#0B57D0] hover:bg-[#0842A0] hover:ring-[#0B57D0]/35 dark:bg-[#A8C7FA] dark:hover:bg-[#8AB4F8] dark:hover:ring-[#A8C7FA]/35'
          : 'bg-black/[0.22] hover:bg-black/[0.34] hover:ring-black/15 dark:bg-white/[0.25] dark:hover:bg-white/[0.38] dark:hover:ring-white/20',
      ].join(' ')}
    >
      {/* `left` explicite : sans lui, la pastille se placerait à sa position
          statique, que le `text-align: center` par défaut des boutons décale au
          milieu du rail — le `translate` la faisait alors sortir du cadre. */}
      <span
        className={[
          'absolute left-[2px] top-[2px] size-[16px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-transform duration-150',
          checked ? 'translate-x-[14px]' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[4px] border border-black/[0.14] bg-white px-1.5 font-mono-google text-[10px] font-medium text-[#3C4043] shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] dark:border-white/[0.14] dark:bg-[#24272C] dark:text-[#C4C7C5] dark:shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  );
}

function Button({
  children,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        tone === 'accent'
          ? 'bg-[#0B57D0] text-white hover:bg-[#0842A0] active:bg-[#06306F] dark:bg-[#A8C7FA] dark:text-[#041E49] dark:hover:bg-[#8AB4F8] dark:active:bg-[#6FA0E8]'
          : 'border border-black/[0.12] bg-white text-[#3C4043] hover:border-[#0B57D0]/30 hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] dark:border-white/[0.12] dark:bg-[#1F2227] dark:text-[#C4C7C5] dark:hover:border-[#A8C7FA]/35 dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Apparence                                                                 */
/* -------------------------------------------------------------------------- */

function AppearanceSection() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const isSidebarOpen = useSettingsStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useSettingsStore((s) => s.setSidebarOpen);

  return (
    <Group>
      <Row
        label="Thème"
        description="« Système » suit le réglage clair/sombre du bureau, en direct."
        control={
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Clair', icon: Sun },
              { value: 'dark', label: 'Sombre', icon: Moon },
              { value: 'system', label: 'Système', icon: Monitor },
            ]}
          />
        }
      />
      <Row
        label="Barre latérale"
        description="Se replie aussi avec Ctrl+B depuis n'importe quel écran."
        control={
          <Switch
            checked={isSidebarOpen}
            onChange={setSidebarOpen}
            label="Afficher la barre latérale"
          />
        }
      />
    </Group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tableau blanc                                                             */
/* -------------------------------------------------------------------------- */

function CanvasSection() {
  const canvasBackground = useSettingsStore((s) => s.canvasBackground);
  const setCanvasBackground = useSettingsStore((s) => s.setCanvasBackground);
  const showMinimap = useSettingsStore((s) => s.showMinimap);
  const setShowMinimap = useSettingsStore((s) => s.setShowMinimap);
  const snapToGrid = useSettingsStore((s) => s.snapToGrid);
  const setSnapToGrid = useSettingsStore((s) => s.setSnapToGrid);

  return (
    <Group>
      <Row
        label="Fond du tableau"
        description="Trame répétée derrière les tuiles."
        control={
          <Segmented
            value={canvasBackground}
            onChange={setCanvasBackground}
            options={[
              { value: 'dots', label: 'Points' },
              { value: 'grid', label: 'Grille' },
              { value: 'lines', label: 'Lignes' },
              { value: 'plain', label: 'Uni' },
            ]}
          />
        }
      />
      <Row
        label="Aimantation à la grille"
        description={`Aligne les tuiles déplacées sur un pas de ${GRID_SIZE} px.`}
        control={
          <Switch
            checked={snapToGrid}
            onChange={setSnapToGrid}
            label="Aimanter à la grille"
          />
        }
      />
      <Row
        label="Vue d'ensemble"
        description="Miniature du tableau en bas à droite du canvas."
        control={
          <Switch
            checked={showMinimap}
            onChange={setShowMinimap}
            label="Afficher la vue d'ensemble"
          />
        }
      />
    </Group>
  );
}

/* -------------------------------------------------------------------------- */
/*  GitHub                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Le jeton saisi ici part directement vers Rust, qui le valide auprès de
 * GitHub puis l'écrit dans le trousseau du système. Il n'est ni conservé dans
 * l'état de la page au-delà de l'envoi, ni recopié dans la base : les tuiles du
 * canvas n'en voient jamais la valeur.
 */
function GithubSection() {
  const status = useGithubStore((s) => s.status);
  const account = useGithubStore((s) => s.account);
  const error = useGithubStore((s) => s.error);
  const ensureAccount = useGithubStore((s) => s.ensureAccount);
  const connect = useGithubStore((s) => s.connect);
  const disconnect = useGithubStore((s) => s.disconnect);

  const [token, setToken] = useState('');
  const busy = status === 'checking';

  useEffect(() => {
    void ensureAccount();
  }, [ensureAccount]);

  const submit = async () => {
    if (!token.trim()) return;
    const ok = await connect(token);
    // Le champ n'est vidé qu'en cas de succès : un jeton refusé reste
    // corrigeable sans avoir à le recoller en entier.
    if (ok) setToken('');
  };

  return (
    <>
      {error && <Notice tone="danger">{error}</Notice>}

      {account ? (
        <Group label="Compte relié">
          <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-3.5 dark:border-white/[0.06]">
            <img
              src={account.avatarUrl}
              alt={account.login}
              className="size-10 shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/10"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">
                {account.name ?? account.login}
              </p>
              <p className="truncate font-mono-google text-[12px] text-[#5F6368] dark:text-[#9AA0A6]">
                @{account.login}
              </p>
            </div>
            <Button onClick={() => void disconnect()} disabled={busy}>
              Oublier le jeton
            </Button>
          </div>

          <Row
            label="Quota de requêtes"
            description="Fenêtre glissante d'une heure, telle que rapportée par GitHub."
            control={
              <Mono>
                {account.rateRemaining ?? '—'} / {account.rateLimit ?? '—'}
              </Mono>
            }
          />
          <Row
            label="Emplacement du jeton"
            description="Trousseau du système. Il ne transite jamais par l'interface ni par la base SQLite."
            control={<Mono>Secret Service</Mono>}
          />
        </Group>
      ) : (
        <Group label="Relier un compte">
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="text-[12px] leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
              Créez un jeton personnel <strong>en lecture seule</strong> sur
              github.com, puis collez-le ici. Portées suffisantes :{' '}
              <Mono>read:user</Mono> pour le profil, et <Mono>repo</Mono>{' '}
              uniquement si vous souhaitez afficher des dépôts privés.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit();
                }}
                placeholder="ghp_… ou github_pat_…"
                autoComplete="off"
                spellCheck={false}
                className="h-[30px] min-w-0 flex-1 select-text rounded-full border border-black/[0.12] bg-white px-3.5 font-mono-google text-[12px] outline-none transition-colors focus:border-[#0B57D0] dark:border-white/[0.14] dark:bg-[#16181C] dark:focus:border-[#A8C7FA]"
              />
              <Button tone="accent" onClick={() => void submit()} disabled={busy || !token.trim()}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Relier
              </Button>
            </div>
          </div>
        </Group>
      )}

      <Group label="Tuiles disponibles">
        <Row
          label="Dépôt épinglé"
          description="Description, étoiles, forks, tickets, composition en langages et contributeurs."
          control={<Mono>github_repo</Mono>}
        />
        <Row
          label="Profil GitHub"
          description="Identité, abonnés, dépôts, étoiles reçues et contributions de l'année."
          control={<Mono>github_profile</Mono>}
        />
        <Row
          label="Dernière release"
          description="Version publiée la plus récente et ses notes, classées en ajouts et correctifs."
          control={<Mono>github_release</Mono>}
        />
      </Group>

      <Notice tone="success">
        Les tuiles conservent leur dernier résultat dans le tableau : elles
        s'affichent immédiatement à l'ouverture, y compris hors ligne, et ne
        réinterrogent GitHub qu'au-delà de six heures ou sur demande explicite.
      </Notice>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stockage                                                                  */
/* -------------------------------------------------------------------------- */

type MaintenanceState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; reclaimed: number }
  | { kind: 'failed'; message: string };

function StorageSection() {
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceState>({ kind: 'idle' });

  const refresh = useCallback(async () => {
    try {
      setStats(await getWorkspaceStats());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCompact = async () => {
    setMaintenance({ kind: 'running' });
    try {
      const reclaimed = await compactDatabase();
      setMaintenance({ kind: 'done', reclaimed });
      await refresh();
    } catch (cause) {
      setMaintenance({
        kind: 'failed',
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  if (error) {
    return (
      <Notice tone="danger">
        Lecture de la base impossible&nbsp;: {error}
      </Notice>
    );
  }

  return (
    <>
      <section>
        <div className="mb-2 flex items-center justify-between px-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#80868B] dark:text-[#7E8286]">
            Contenu
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="-mr-1.5 flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[#5F6368] transition-all hover:bg-[#D3E3FD]/60 hover:text-[#0B57D0] active:scale-95 dark:text-[#9AA0A6] dark:hover:bg-[#004A77]/60 dark:hover:text-[#A8C7FA]"
          >
            <RefreshCw className="size-3" strokeWidth={2.2} />
            Actualiser
          </button>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-[7px] border border-black/[0.09] bg-white dark:border-white/[0.08] dark:bg-[#1A1D21]">
          <Figure label="Dossiers" value={stats?.folders} />
          <Figure label="Tableaux" value={stats?.boards} />
          <Figure label="Tuiles" value={stats?.nodes} />
          <Figure label="Liens" value={stats?.edges} bottom />
          <Figure label="Médias" value={stats?.assets} bottom />
          <Figure
            label="Poids des médias"
            value={stats ? formatBytes(stats.assetBytes) : undefined}
            bottom
          />
        </div>
      </section>

      <Group label="Fichier">
        <Row
          label="Taille de la base"
          description="Pages allouées au fichier SQLite, journal WAL exclu."
          control={
            <span className="font-mono-google text-[13px] font-medium tabular-nums">
              {stats ? formatBytes(stats.dbBytes) : '—'}
            </span>
          }
        />
        <Row
          label="Compacter la base"
          description="Réécrit le fichier sans les pages libérées par les suppressions. Nécessite qu'aucune écriture ne soit en cours."
          control={
            <Button onClick={() => void handleCompact()} disabled={maintenance.kind === 'running'}>
              {maintenance.kind === 'running' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  En cours
                </>
              ) : (
                'Compacter'
              )}
            </Button>
          }
        />
      </Group>

      {maintenance.kind === 'done' && (
        <Notice tone="success">
          {maintenance.reclaimed > 0
            ? `Base compactée, ${formatBytes(maintenance.reclaimed)} récupérés.`
            : 'Base compactée : elle ne contenait aucune page libre.'}
        </Notice>
      )}
      {maintenance.kind === 'failed' && (
        <Notice tone="danger">Compactage interrompu&nbsp;: {maintenance.message}</Notice>
      )}
    </>
  );
}

function Figure({
  label,
  value,
  bottom = false,
}: {
  label: string;
  value?: number | string;
  bottom?: boolean;
}) {
  return (
    <div
      className={[
        'border-black/[0.06] px-4 py-3.5 dark:border-white/[0.06]',
        'border-r last:border-r-0 [&:nth-child(3n)]:border-r-0',
        bottom ? '' : 'border-b',
      ].join(' ')}
    >
      <p className="text-[21px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
        {value ?? '—'}
      </p>
      <p className="mt-1.5 text-[11px] font-medium text-[#5F6368] dark:text-[#9AA0A6]">{label}</p>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: 'success' | 'danger';
  children: ReactNode;
}) {
  const Icon = tone === 'success' ? Check : AlertTriangle;
  return (
    <div
      className={[
        'flex items-start gap-2.5 rounded-[7px] border px-3.5 py-3 text-[12px] leading-relaxed',
        tone === 'success'
          ? 'border-emerald-600/25 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-300'
          : 'border-rose-600/25 bg-rose-500/[0.07] text-rose-800 dark:text-rose-300',
      ].join(' ')}
    >
      <Icon className="mt-[1px] size-[14px] shrink-0" strokeWidth={2.2} />
      <span className="select-text">{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Raccourcis                                                                */
/* -------------------------------------------------------------------------- */

const SHORTCUTS: Array<{ group: string; items: Array<[string, string[]]> }> = [
  {
    group: 'Fenêtre',
    items: [
      ['Afficher ou masquer la barre latérale', ['Ctrl', 'B']],
      ['Fermer les paramètres', ['Échap']],
    ],
  },
  {
    group: 'Tableau',
    items: [
      ['Créer un post-it à la position du curseur', ['Double-clic sur le fond']],
      ['Écrire dans une tuile', ['Double-clic sur la tuile']],
      ['Sortir du mode écriture', ['Échap']],
      ['Supprimer la sélection', ['Suppr']],
      ['Ajouter à la sélection', ['Ctrl', 'Clic']],
      ['Zoomer', ['Ctrl', 'Molette']],
    ],
  },
];

function ShortcutsSection() {
  return (
    <>
      {SHORTCUTS.map((section) => (
        <Group key={section.group} label={section.group}>
          {section.items.map(([label, keys]) => (
            <div
              key={label}
              className="flex min-h-[40px] items-center gap-6 border-b border-black/[0.06] px-4 py-2 last:border-b-0 dark:border-white/[0.06]"
            >
              <span className="min-w-0 flex-1 text-[13px]">{label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {keys.map((key, index) => (
                  <span key={key} className="flex items-center gap-1">
                    {index > 0 && (
                      <span className="text-[10px] text-[#9AA0A6]">+</span>
                    )}
                    <Kbd>{key}</Kbd>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </Group>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  À propos                                                                  */
/* -------------------------------------------------------------------------- */

function AboutSection() {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [tauriVersion, setTauriVersion] = useState<string | null>(null);
  const [configDir, setConfigDir] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => setAppVersion(null));
    void getTauriVersion().then(setTauriVersion).catch(() => setTauriVersion(null));
    void appConfigDir().then(setConfigDir).catch(() => setConfigDir(null));
  }, []);

  return (
    <>
      <Group label="Versions">
        <Row label="Boardy" control={<Mono>{appVersion ?? '—'}</Mono>} />
        <Row label="Tauri" control={<Mono>{tauriVersion ?? '—'}</Mono>} />
      </Group>

      <Group label="Emplacement des données">
        <div className="px-4 py-3.5">
          <p className="text-[13px] font-medium leading-tight">Base SQLite</p>
          <p className="mt-2 select-text break-all font-mono-google text-[11px] leading-relaxed text-[#5F6368] dark:text-[#9AA0A6]">
            {configDir ? `${configDir}boardy.db` : '—'}
          </p>
          <p className="mt-2.5 text-[12px] leading-snug text-[#5F6368] dark:text-[#9AA0A6]">
            Tout est écrit sur cet appareil, en clair, sans compte ni serveur. Sauvegarder ce
            fichier suffit à sauvegarder l'intégralité de l'espace de travail.
          </p>
        </div>
      </Group>
    </>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <span className="select-text font-mono-google text-[12px] font-medium tabular-nums text-[#3C4043] dark:text-[#C4C7C5]">
      {children}
    </span>
  );
}
