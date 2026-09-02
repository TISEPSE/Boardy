import { memo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BookMarked, Star, Users } from 'lucide-react';

import { NodeShell } from './NodeShell';
import {
  ErrorState,
  GithubHeader,
  LoadingState,
  NotConnected,
  TargetPrompt,
  compactNumber,
  relativeTime,
  useGithubResource,
} from './GithubNodeParts';
import { fetchProfile } from '../../lib/github';
import { useCanvasStore } from '../../stores/useCanvasStore';
import { useGithubStore } from '../../stores/useGithubStore';
import type { GithubProfileNode as GithubProfileNodeType } from '../../types/canvas';

/** Cinq paliers, comme le calendrier de GitHub. */
const LEVEL_CLASSES = [
  'bg-black/[0.07] dark:bg-white/[0.08]',
  'bg-[#9BE9A8] dark:bg-[#0E4429]',
  'bg-[#40C463] dark:bg-[#006D32]',
  'bg-[#30A14E] dark:bg-[#26A641]',
  'bg-[#216E39] dark:bg-[#39D353]',
];

function level(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  return Math.min(4, Math.ceil((count / max) * 4));
}

/**
 * Tuile « profil » : identité, audience et rythme de contribution.
 *
 * Le calendrier est ici agrégé par semaine — c'est ce que renvoie la requête
 * GraphQL, et cinquante-deux barres tiennent dans la largeur d'une tuile là où
 * trois cent soixante-cinq cases ne tiendraient pas.
 */
function GithubProfileNodeComponent({ id, data, selected }: NodeProps<GithubProfileNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const status = useGithubStore((s) => s.status);
  const account = useGithubStore((s) => s.account);

  // Un login vide désigne le porteur du jeton : la tuile affiche donc un profil
  // dès sa pose, et le bouton d'édition permet d'en viser un autre.
  const configured = status === 'connected';
  const [editingTarget, setEditingTarget] = useState(false);

  const { loading, refresh } = useGithubResource({
    nodeId: id,
    ready: configured,
    target: data.login || account?.login || '',
    fetchedAt: data.fetchedAt,
    load: () => fetchProfile(data.login || undefined),
  });

  const profile = data.payload;
  const weeks = profile?.contributionsByWeek ?? [];
  const max = weeks.length > 0 ? Math.max(...weeks) : 0;

  return (
    <NodeShell
      nodeId={id}
      selected={selected ?? false}
      color="white"
      surface="document"
      minWidth={260}
      minHeight={280}
    >
      <div className="flex size-full flex-col">
        <GithubHeader
          title={profile ? `@${profile.login}` : 'Profil GitHub'}
          subtitle={profile ? `Mis à jour ${relativeTime(data.fetchedAt)}` : undefined}
          loading={loading}
          onRefresh={configured ? refresh : undefined}
          onEditTarget={configured ? () => setEditingTarget(true) : undefined}
          copyUrl={profile ? `https://github.com/${profile.login}` : undefined}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {status !== 'connected' ? (
            <NotConnected />
          ) : editingTarget ? (
            <TargetPrompt
              hint="Quel profil afficher ? Laissez vide pour le vôtre."
              placeholder="identifiant"
              initialValue={data.login}
              onCancel={() => setEditingTarget(false)}
              onSubmit={(value) => {
                setEditingTarget(false);
                updateNodeData(id, {
                  login: value.trim().replace(/^@/, ''),
                  payload: null,
                  fetchedAt: null,
                  error: null,
                });
              }}
            />
          ) : data.error ? (
            <ErrorState message={data.error} onRetry={refresh} />
          ) : !profile ? (
            <LoadingState />
          ) : (
            <div className="flex flex-col gap-3 px-3 py-3">
              <div className="flex items-center gap-2.5">
                <img
                  src={profile.avatarUrl}
                  alt={profile.login}
                  loading="lazy"
                  className="size-11 shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/10"
                />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold leading-tight">
                    {profile.name ?? profile.login}
                  </p>
                  <p className="truncate font-mono-google text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">
                    @{profile.login}
                  </p>
                </div>
              </div>

              {profile.bio && (
                <p className="text-[11px] leading-snug text-[#3C4043] dark:text-[#C4C7C5]">
                  {profile.bio}
                </p>
              )}

              <div className="grid grid-cols-3 gap-1.5">
                <Metric icon={Users} value={profile.followers} label="abonnés" />
                <Metric icon={BookMarked} value={profile.publicRepos} label="dépôts" />
                <Metric icon={Star} value={profile.stars} label="étoiles" />
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#80868B] dark:text-[#7E8286]">
                  {compactNumber(profile.contributionsTotal)} contributions sur un an
                </p>
                <div className="flex h-[26px] items-end gap-[2px]">
                  {weeks.map((count, index) => (
                    <span
                      key={index}
                      title={`${count} contribution${count > 1 ? 's' : ''}`}
                      className={`min-w-0 flex-1 rounded-[2px] ${LEVEL_CLASSES[level(count, max)]}`}
                      style={{
                        height: `${max === 0 ? 12 : 20 + (count / max) * 80}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </NodeShell>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Star;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-[7px] border border-black/[0.07] px-2 py-1.5 dark:border-white/[0.07]">
      <div className="flex items-center gap-1 text-[#5F6368] dark:text-[#9AA0A6]">
        <Icon className="size-3" strokeWidth={2} />
        <span className="truncate text-[9px] uppercase tracking-[0.04em]">{label}</span>
      </div>
      <p className="mt-0.5 text-[13px] font-semibold leading-none">{compactNumber(value)}</p>
    </div>
  );
}

export const GithubProfileNode = memo(GithubProfileNodeComponent);
