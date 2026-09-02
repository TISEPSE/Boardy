import type { NodeTypes } from '@xyflow/react';

import { GithubProfileNode } from './GithubProfileNode';
import { GithubReleaseNode } from './GithubReleaseNode';
import { GithubRepoNode } from './GithubRepoNode';
import { GroupNode } from './GroupNode';
import { ImageNode } from './ImageNode';
import { KanbanNode } from './KanbanNode';
import { NoteNode } from './NoteNode';
import { PdfNode } from './PdfNode';
import { TodoListNode } from './TodoListNode';

/**
 * Registre des nœuds, à passer tel quel à `<ReactFlow nodeTypes={...} />`.
 *
 * Défini au niveau module : un objet recréé à chaque rendu ferait remonter à
 * React Flow un changement de types et démonterait tous les nœuds du canvas.
 * Les clés correspondent au CHECK de `canvas_nodes.type`.
 */
export const nodeTypes = {
  note: NoteNode,
  todo_list: TodoListNode,
  image: ImageNode,
  pdf: PdfNode,
  group: GroupNode,
  kanban: KanbanNode,
  github_repo: GithubRepoNode,
  github_profile: GithubProfileNode,
  github_release: GithubReleaseNode,
} satisfies NodeTypes;

export {
  GithubProfileNode,
  GithubReleaseNode,
  GithubRepoNode,
  GroupNode,
  ImageNode,
  KanbanNode,
  NoteNode,
  PdfNode,
  TodoListNode,
};
