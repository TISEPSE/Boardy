import { memo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { PackageOpen, Tag } from 'lucide-react';

import { NodeShell } from './NodeShell';
import {
  Centered,
  ErrorState,
  GithubHeader,
  LoadingState,
  NotConnected,
  TargetPrompt,
  relativeTime,
  useGithubResource,
} from './GithubNodeParts';
import { fetchLatestRelease, parseRepoReference } from '../../lib/github';
import { useCanvasStore } from '../../stores/useCanvasStore';
import { useGithubStore } from '../../stores/useGithubStore';
import type { GithubReleaseNode as GithubReleaseNodeType } from '../../types/canvas';

const KIND_LABEL = { added: 'Ajouté', fixed: 'Corrigé' } as const;

const KIND_CLASSES = {
  added: 'bg-[#DAFBE1] text-[#1A7F37] dark:bg-[#0F2E1A] dark:text-[#3FB950]',
  fixed: 'bg-[#FFF1E5] text-[#BC4C00] dark:bg-[#3A1F0B] dark:text-[#DB6D28]',
} as const;

/** Tuile « dernière release » : version publiée et notes de version classées. */
function GithubReleaseNodeComponent({ id, data, selected }: NodeProps<GithubReleaseNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const status = useGithubStore((s) => s.status);
  const configured = Boolean(data.owner && data.name);
  const [editingTarget, setEditingTarget] = useState(false);

  const { loading, refresh } = useGithubResource({
    nodeId: id,
    ready: configured,
    target: `${data.owner}/${data.name}`,
    fetchedAt: data.fetchedAt,
    load: () => fetchLatestRelease(data.owner, data.name),
  });

  const release = data.payload;

  return (
    <NodeShell
      nodeId={id}
      selected={selected ?? false}
      color="white"
      surface="document"
      minWidth={280}
      minHeight={200}
    >
      <div className="flex size-full flex-col">
        <GithubHeader
          title={configured ? `${data.owner}/${data.name}` : 'Dernière release'}
          subtitle={
            data.fetchedAt ? `Mis à jour ${relativeTime(data.fetchedAt)}` : undefined
          }
          loading={loading}
          onRefresh={configured ? refresh : undefined}
          onEditTarget={configured ? () => setEditingTarget(true) : undefined}
          copyUrl={release?.htmlUrl}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {status !== 'connected' ? (
            <NotConnected />
          ) : !configured || editingTarget ? (
            <TargetPrompt
              hint="De quel dépôt suivre les publications ?"
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
          ) : !release ? (
            // `fetchedAt` distingue « pas encore chargé » de « aucune release ».
            data.fetchedAt ? (
              <Centered>
                <PackageOpen className="size-6 text-slate-400" />
                <p className="text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">
                  Ce dépôt n'a publié aucune release.
                </p>
              </Centered>
            ) : (
              <LoadingState />
            )
          ) : (
            <div className="flex flex-col gap-2.5 px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="flex items-center gap-1 rounded-full bg-[#0B57D0] px-2.5 py-[3px] font-mono-google text-[11px] font-semibold text-white dark:bg-[#A8C7FA] dark:text-[#041E49]">
                  <Tag className="size-3" strokeWidth={2.5} />
                  {release.tagName}
                </span>
                <span className="truncate text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">
                  publiée {relativeTime(release.publishedAt)}
                </span>
              </div>

              {release.name && release.name !== release.tagName && (
                <p className="text-[12px] font-semibold leading-tight">{release.name}</p>
              )}

              {release.entries.length === 0 ? (
                <p className="text-[11px] italic text-[#5F6368] dark:text-[#9AA0A6]">
                  Aucune note de version exploitable.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {release.entries.slice(0, 8).map((entry, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span
                        className={`mt-[1px] shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.04em] ${KIND_CLASSES[entry.kind]}`}
                      >
                        {KIND_LABEL[entry.kind]}
                      </span>
                      <span className="min-w-0 text-[11px] leading-snug text-[#3C4043] dark:text-[#C4C7C5]">
                        {entry.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </NodeShell>
  );
}

export const GithubReleaseNode = memo(GithubReleaseNodeComponent);
