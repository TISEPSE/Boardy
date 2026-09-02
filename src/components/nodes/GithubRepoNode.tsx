import { memo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CircleDot, GitFork, Scale, Star } from 'lucide-react';

import { NodeShell } from './NodeShell';
import {
  ErrorState,
  GithubHeader,
  LoadingState,
  NotConnected,
  TargetPrompt,
  compactNumber,
  languageColor,
  relativeTime,
  useGithubResource,
} from './GithubNodeParts';
import { fetchRepository, parseRepoReference } from '../../lib/github';
import { useCanvasStore } from '../../stores/useCanvasStore';
import { useGithubStore } from '../../stores/useGithubStore';
import type { GithubRepoNode as GithubRepoNodeType } from '../../types/canvas';

/** Tuile « dépôt épinglé » : identité, activité et composition du dépôt. */
function GithubRepoNodeComponent({ id, data, selected }: NodeProps<GithubRepoNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const status = useGithubStore((s) => s.status);
  const configured = Boolean(data.owner && data.name);
  const [editingTarget, setEditingTarget] = useState(false);

  const { loading, refresh } = useGithubResource({
    nodeId: id,
    ready: configured,
    target: `${data.owner}/${data.name}`,
    fetchedAt: data.fetchedAt,
    load: () => fetchRepository(data.owner, data.name),
  });

  const repo = data.payload;
  const totalBytes = repo?.languages.reduce((sum, l) => sum + l.bytes, 0) ?? 0;

  return (
    <NodeShell
      nodeId={id}
      selected={selected ?? false}
      color="white"
      surface="document"
      minWidth={300}
      minHeight={220}
    >
      <div className="flex size-full flex-col">
        <GithubHeader
          title={configured ? `${data.owner}/${data.name}` : 'Dépôt épinglé'}
          subtitle={repo ? `Mis à jour ${relativeTime(data.fetchedAt)}` : undefined}
          loading={loading}
          onRefresh={configured ? refresh : undefined}
          onEditTarget={configured ? () => setEditingTarget(true) : undefined}
          copyUrl={repo?.htmlUrl}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {status !== 'connected' ? (
            <NotConnected />
          ) : !configured || editingTarget ? (
            <TargetPrompt
              hint="Quel dépôt cette tuile doit-elle suivre ?"
              placeholder="proprietaire/depot"
              initialValue={configured ? `${data.owner}/${data.name}` : ''}
              onCancel={configured ? () => setEditingTarget(false) : undefined}
              onSubmit={(value) => {
                const parsed = parseRepoReference(value);
                if (!parsed) return;
                setEditingTarget(false);
                updateNodeData(id, { ...parsed, payload: null, fetchedAt: null, error: null });
              }}
            />
          ) : data.error ? (
            <ErrorState message={data.error} onRetry={refresh} />
          ) : !repo ? (
            <LoadingState />
          ) : (
            <div className="flex flex-col gap-3 px-3 py-2.5">
              {repo.description && (
                <p className="text-[12px] leading-snug text-[#3C4043] dark:text-[#C4C7C5]">
                  {repo.description}
                </p>
              )}

              {repo.topics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {repo.topics.slice(0, 6).map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full bg-[#DDF4FF] px-2 py-[2px] text-[10px] font-medium text-[#0969DA] dark:bg-[#121D2F] dark:text-[#4493F8]"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">
                <Stat icon={Star} value={compactNumber(repo.stars)} label="étoiles" />
                <Stat icon={GitFork} value={compactNumber(repo.forks)} label="forks" />
                <Stat
                  icon={CircleDot}
                  value={compactNumber(repo.openIssues)}
                  label="tickets ouverts"
                />
                {repo.license && <Stat icon={Scale} value={repo.license} label="licence" />}
              </div>

              {totalBytes > 0 && (
                <div className="flex flex-col gap-1.5">
                  {/* Barre de composition : une part par langage, à l'échelle
                      des octets renvoyés par l'API. */}
                  <div className="flex h-[6px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                    {repo.languages.map((language) => (
                      <span
                        key={language.name}
                        title={`${language.name} — ${Math.round((language.bytes / totalBytes) * 100)} %`}
                        style={{
                          width: `${(language.bytes / totalBytes) * 100}%`,
                          backgroundColor: languageColor(language.name),
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">
                    {repo.languages.slice(0, 4).map((language) => (
                      <span key={language.name} className="flex items-center gap-1">
                        <span
                          className="size-[7px] rounded-full"
                          style={{ backgroundColor: languageColor(language.name) }}
                        />
                        {language.name}
                        <span className="opacity-60">
                          {Math.round((language.bytes / totalBytes) * 100)} %
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/[0.06] pt-2 dark:border-white/[0.06]">
                <div className="flex items-center -space-x-2">
                  {repo.contributors.slice(0, 6).map((contributor) => (
                    <img
                      key={contributor.login}
                      src={contributor.avatarUrl}
                      alt={contributor.login}
                      title={contributor.login}
                      loading="lazy"
                      className="size-5 rounded-full border border-white object-cover dark:border-[#1E2025]"
                    />
                  ))}
                  {repo.contributors.length > 6 && (
                    <span className="pl-3 text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">
                      +{repo.contributors.length - 6}
                      {repo.contributorsTruncated && '…'}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">
                  Poussé {relativeTime(repo.pushedAt)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </NodeShell>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Star;
  value: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1" title={label}>
      <Icon className="size-3.5 shrink-0" strokeWidth={2} />
      <span className="font-medium text-[#1F1F1F] dark:text-[#E3E2E6]">{value}</span>
    </span>
  );
}

export const GithubRepoNode = memo(GithubRepoNodeComponent);
