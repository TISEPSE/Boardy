import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import * as canvasRepo from '../lib/repo/canvasRepo';
import * as mediaRepo from '../lib/repo/mediaRepo';
import * as settingsRepo from '../lib/repo/settingsRepo';
import { createId } from '../lib/id';
import {
  debounce,
  PERSIST_DEBOUNCE_MS,
  PERSIST_MAX_WAIT_MS,
} from '../lib/scheduler';
import {
  DEFAULT_NODE_DATA,
  DEFAULT_NODE_SIZE,
  EDGE_DEFAULTS,
  type BoardyEdge,
  type BoardyNode,
  type CanvasNodeDataMap,
  type CanvasNodeType,
  type Viewport,
} from '../types/canvas';

/**
 * État du tableau blanc.
 *
 * Règle de performance : pendant une interaction (drag, resize, saisie), seul
 * l'état mémoire bouge. Les identifiants touchés sont marqués « sales » et un
 * flush débouncé écrit tout en une transaction SQLite. Les opérations
 * structurelles (création, suppression, connexion) sont en revanche persistées
 * immédiatement — elles portent des contraintes de clés étrangères que le
 * différé rendrait fragiles.
 */

export type CanvasStatus = 'idle' | 'loading' | 'ready' | 'error';

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

interface CanvasState {
  boardId: string | null;
  status: CanvasStatus;
  error: string | null;

  nodes: BoardyNode[];
  edges: BoardyEdge[];
  viewport: Viewport;

  /** Nœuds dont la géométrie attend une écriture. */
  dirtyGeometry: Record<string, true>;
  /** Nœuds dont le contenu attend une écriture (et une réindexation FTS). */
  dirtyData: Record<string, true>;
  /** `true` entre la première mutation et la fin du flush. */
  isSaving: boolean;
  /** Nombre de fichiers en cours de copie, pour l'indicateur d'import. */
  importing: number;
  /** Modal du catalogue de composants. */
  isCatalogOpen: boolean;
}

interface CanvasActions {
  loadBoard: (boardId: string) => Promise<void>;
  closeBoard: () => Promise<void>;

  setCatalogOpen: (open: boolean) => void;

  onNodesChange: (changes: NodeChange<BoardyNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<BoardyEdge>[]) => void;
  onConnect: (connection: Connection) => Promise<void>;

  addNode: <T extends CanvasNodeType>(
    type: T,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeDataMap[T]>,
    /** Écrase `DEFAULT_NODE_SIZE[type]` — un post-it n'a pas le format d'un
     *  document, alors qu'ils partagent le type `note`. */
    size?: { width: number; height: number },
  ) => Promise<BoardyNode | null>;

  updateNodeData: <T extends CanvasNodeType>(
    id: string,
    patch: Partial<CanvasNodeDataMap[T]>,
  ) => void;

  resizeNode: (id: string, size: { width: number; height: number }) => void;

  /** Importe des fichiers locaux et pose un nœud image/PDF pour chacun. */
  importFiles: (
    paths: readonly string[],
    position: { x: number; y: number },
  ) => Promise<void>;

  deleteNodes: (ids: readonly string[]) => Promise<void>;
  deleteEdges: (ids: readonly string[]) => Promise<void>;
  setEdgeLabel: (id: string, label: string | null) => Promise<void>;

  setViewport: (viewport: Viewport) => void;

  /** Écrit immédiatement tout ce qui est en attente. */
  flush: () => Promise<void>;
}

export type CanvasStore = CanvasState & CanvasActions;

const initialState: CanvasState = {
  boardId: null,
  status: 'idle',
  error: null,
  nodes: [],
  edges: [],
  viewport: DEFAULT_VIEWPORT,
  dirtyGeometry: {},
  dirtyData: {},
  isSaving: false,
  importing: 0,
  isCatalogOpen: false,
};

/** Dimensions retenues pour la persistance : explicites, sinon mesurées. */
function nodeSize(node: BoardyNode): { width: number | null; height: number | null } {
  return {
    width: node.width ?? node.measured?.width ?? null,
    height: node.height ?? node.measured?.height ?? null,
  };
}

/**
 * Jeton de la dernière demande de chargement.
 *
 * En mode strict, React monte les effets deux fois : `loadBoard` part en double
 * et les deux réponses reviennent dans un ordre non garanti. Comparer le
 * `boardId` ne suffit pas — il est identique dans les deux appels. Seul le
 * chargement le plus récent a le droit d'écrire dans le store.
 */
let loadSequence = 0;

export const useCanvasStore = create<CanvasStore>()(
  immer((set, get) => {
    const schedulePersist = debounce(
      () => {
        void get().flush();
      },
      PERSIST_DEBOUNCE_MS,
      PERSIST_MAX_WAIT_MS,
    );

    const persistViewport = debounce((boardId: string, viewport: Viewport) => {
      void settingsRepo
        .setSetting(settingsRepo.viewportKey(boardId), viewport)
        .catch(() => {
          /* le viewport est un confort d'affichage : un échec n'a pas à remonter */
        });
    }, PERSIST_DEBOUNCE_MS);

    const fail = (error: unknown) =>
      set((s) => {
        s.error = error instanceof Error ? error.message : String(error);
      });

    return {
      ...initialState,

      setCatalogOpen(open) {
        set((s) => {
          s.isCatalogOpen = open;
        });
      },

      async loadBoard(boardId) {
        const token = ++loadSequence;

        // Ne jamais perdre les modifications du tableau qu'on quitte.
        await get().flush();

        set((s) => {
          s.status = 'loading';
          s.error = null;
          s.boardId = boardId;
          s.nodes = [];
          s.edges = [];
          s.dirtyGeometry = {};
          s.dirtyData = {};
        });

        try {
          const [content, viewport] = await Promise.all([
            canvasRepo.loadBoard(boardId),
            settingsRepo.getSetting<Viewport>(
              settingsRepo.viewportKey(boardId),
              DEFAULT_VIEWPORT,
            ),
          ]);

          if (token !== loadSequence) return;

          set((s) => {
            s.nodes = content.nodes
              .map((node) => (node.type === 'group' ? { ...node, zIndex: -1 } : node))
              .sort((a, b) => (a.type === 'group' ? -1 : 0) - (b.type === 'group' ? -1 : 0));
            s.edges = content.edges;
            s.viewport = viewport;
            s.status = 'ready';
          });

          await settingsRepo.setSetting(settingsRepo.LAST_BOARD_KEY, boardId);
        } catch (error) {
          if (token !== loadSequence) return;
          set((s) => {
            s.status = 'error';
            s.error = error instanceof Error ? error.message : String(error);
          });
        }
      },

      async closeBoard() {
        await get().flush();
        set((s) => {
          Object.assign(s, initialState);
        });
      },

      onNodesChange(changes) {
        // Les suppressions passent par le chemin transactionnel dédié : React
        // Flow les émet aussi via `onNodesDelete`, mais on veut la cascade SQL
        // et l'invalidation FTS quel que soit le déclencheur.
        const removed = changes
          .filter((change) => change.type === 'remove')
          .map((change) => change.id);

        const structural = changes.filter((change) => change.type !== 'remove');
        const prevNodes = get().nodes;

        // Déplacement groupé pour les groupes verrouillés
        const augmentedChanges = [...structural];
        const positionChanges = structural.filter(
          (c): c is import('@xyflow/react').NodePositionChange =>
            c.type === 'position' && c.position !== undefined,
        );

        for (const gChange of positionChanges) {
          const prevGroup = prevNodes.find((n) => n.id === gChange.id);
          if (
            prevGroup &&
            prevGroup.type === 'group' &&
            (prevGroup.data as { locked?: boolean }).locked &&
            gChange.position
          ) {
            const dx = gChange.position.x - prevGroup.position.x;
            const dy = gChange.position.y - prevGroup.position.y;
            if (dx !== 0 || dy !== 0) {
              const gx = prevGroup.position.x;
              const gy = prevGroup.position.y;
              const gw = prevGroup.width ?? 640;
              const gh = prevGroup.height ?? 480;

              for (const child of prevNodes) {
                if (child.id === prevGroup.id || child.type === 'group') continue;
                const cx = child.position.x;
                const cy = child.position.y;
                if (cx >= gx - 20 && cx <= gx + gw && cy >= gy - 20 && cy <= gy + gh) {
                  if (!augmentedChanges.some((c) => c.type === 'position' && c.id === child.id)) {
                    augmentedChanges.push({
                      id: child.id,
                      type: 'position',
                      position: { x: cx + dx, y: cy + dy },
                    });
                  }
                }
              }
            }
          }
        }

        const nextNodes = applyNodeChanges(augmentedChanges, prevNodes);

        set((s) => {
          s.nodes = nextNodes;
          for (const change of augmentedChanges) {
            if (change.type === 'position' || change.type === 'dimensions') {
              s.dirtyGeometry[change.id] = true;
              s.isSaving = true;
            }
          }
        });

        if (augmentedChanges.some((c) => c.type === 'position' || c.type === 'dimensions')) {
          schedulePersist();
        }
        if (removed.length > 0) {
          void get().deleteNodes(removed);
        }
      },

      onEdgesChange(changes) {
        const removed = changes
          .filter((change) => change.type === 'remove')
          .map((change) => change.id);

        const nextEdges = applyEdgeChanges(
          changes.filter((change) => change.type !== 'remove'),
          get().edges,
        );

        set((s) => {
          s.edges = nextEdges;
        });

        if (removed.length > 0) {
          void get().deleteEdges(removed);
        }
      },

      async onConnect(connection) {
        const boardId = get().boardId;
        if (!boardId || connection.source === connection.target) return;

        // La base refuse les doublons (idx_canvas_edges_unique) via un
        // `INSERT OR IGNORE` : sans ce garde, l'arête resterait affichée sans
        // jamais être écrite, et disparaîtrait au rechargement du tableau.
        const alreadyLinked = get().edges.some(
          (existing) =>
            existing.source === connection.source &&
            existing.target === connection.target &&
            (existing.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
            (existing.targetHandle ?? null) === (connection.targetHandle ?? null),
        );
        if (alreadyLinked) return;

        const edge: BoardyEdge = {
          ...EDGE_DEFAULTS,
          id: createId(),
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
          animated: false,
          data: { style: {} },
        };

        const nextEdges = addEdge(edge, get().edges);
        set((s) => {
          s.edges = nextEdges;
        });

        try {
          await canvasRepo.insertEdge(boardId, edge);
        } catch (error) {
          set((s) => {
            s.edges = s.edges.filter((e) => e.id !== edge.id);
          });
          fail(error);
        }
      },

      async addNode(type, position, data, sizeOverride) {
        const boardId = get().boardId;
        if (!boardId) return null;

        const size = sizeOverride ?? DEFAULT_NODE_SIZE[type];
        const node = {
          id: createId(),
          type,
          position,
          width: size.width,
          height: size.height,
          zIndex: type === 'group' ? -1 : 0,
          data: { ...DEFAULT_NODE_DATA[type](), ...data },
        } as BoardyNode;

        set((s) => {
          for (const n of s.nodes) {
            n.selected = false;
          }
          const newNode = { ...node, selected: true };
          if (type === 'group') {
            s.nodes.unshift(newNode);
          } else {
            s.nodes.push(newNode);
          }
        });

        try {
          await canvasRepo.insertNode(boardId, node);
          return node;
        } catch (error) {
          set((s) => {
            s.nodes = s.nodes.filter((n) => n.id !== node.id);
          });
          fail(error);
          return null;
        }
      },

      updateNodeData(id, patch) {
        set((s) => {
          const node = s.nodes.find((n) => n.id === id);
          if (!node) return;
          Object.assign(node.data, patch);
          s.dirtyData[id] = true;
          s.isSaving = true;
        });
        schedulePersist();
      },

      resizeNode(id, size) {
        set((s) => {
          const node = s.nodes.find((n) => n.id === id);
          if (!node) return;
          node.width = size.width;
          node.height = size.height;
          s.dirtyGeometry[id] = true;
          s.isSaving = true;
        });
        schedulePersist();
      },

      async importFiles(paths, position) {
        const boardId = get().boardId;
        if (!boardId || paths.length === 0) return;

        set((s) => {
          s.importing += paths.length;
          s.error = null;
        });

        const failures: string[] = [];

        // Séquentiel et non parallèle : chaque import lit puis hache le fichier
        // entier. Vingt PDF lancés d'un coup saturent le disque et figent
        // l'interface pendant plusieurs secondes.
        for (const [index, path] of paths.entries()) {
          try {
            const asset = await mediaRepo.importFile(path);
            // Léger décalage en escalier pour un dépôt multiple.
            const spot = { x: position.x + index * 24, y: position.y + index * 24 };

            if (mediaRepo.isPdf(asset)) {
              await get().addNode('pdf', spot, {
                assetId: asset.id,
                title: asset.fileName,
              });
            } else {
              await get().addNode('image', spot, {
                assetId: asset.id,
                caption: asset.fileName,
              });
            }
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            failures.push(`${path.split('/').pop() ?? path} : ${reason}`);
          } finally {
            set((s) => {
              s.importing = Math.max(0, s.importing - 1);
            });
          }
        }

        if (failures.length > 0) {
          set((s) => {
            s.error = `Import impossible — ${failures.join(' ; ')}`;
          });
        }
      },

      async deleteNodes(ids) {
        if (ids.length === 0) return;
        const removedSet = new Set(ids);

        set((s) => {
          s.nodes = s.nodes.filter((n) => !removedSet.has(n.id));
          // Les liens attachés disparaissent en cascade côté SQL ; on aligne la
          // vue tout de suite pour éviter des arêtes orphelines à l'écran.
          s.edges = s.edges.filter(
            (e) => !removedSet.has(e.source) && !removedSet.has(e.target),
          );
          for (const id of ids) {
            delete s.dirtyGeometry[id];
            delete s.dirtyData[id];
          }
        });

        try {
          await canvasRepo.deleteNodes(ids);
        } catch (error) {
          fail(error);
          const boardId = get().boardId;
          if (boardId) await get().loadBoard(boardId);
        }
      },

      async deleteEdges(ids) {
        if (ids.length === 0) return;
        const removedSet = new Set(ids);
        set((s) => {
          s.edges = s.edges.filter((e) => !removedSet.has(e.id));
        });
        try {
          await canvasRepo.deleteEdges(ids);
        } catch (error) {
          fail(error);
        }
      },

      async setEdgeLabel(id, label) {
        set((s) => {
          const edge = s.edges.find((e) => e.id === id);
          if (edge) edge.label = label ?? undefined;
        });
        try {
          await canvasRepo.updateEdgeLabel(id, label);
        } catch (error) {
          fail(error);
        }
      },

      setViewport(viewport) {
        const boardId = get().boardId;
        set((s) => {
          s.viewport = viewport;
        });
        if (boardId) persistViewport(boardId, viewport);
      },

      async flush() {
        schedulePersist.cancel();
        const state = get();
        const { boardId } = state;

        const geometryIds = Object.keys(state.dirtyGeometry);
        const dataIds = Object.keys(state.dirtyData);
        if (!boardId || (geometryIds.length === 0 && dataIds.length === 0)) {
          if (state.isSaving) set((s) => void (s.isSaving = false));
          return;
        }

        const byId = new Map(state.nodes.map((node) => [node.id, node]));

        const geometry: canvasRepo.NodeGeometryPatch[] = [];
        for (const id of geometryIds) {
          const node = byId.get(id);
          if (!node) continue;
          const { width, height } = nodeSize(node);
          geometry.push({
            id: node.id,
            x: node.position.x,
            y: node.position.y,
            width,
            height,
            zIndex: node.zIndex ?? 0,
            parentNodeId: node.parentId ?? null,
          });
        }

        // On libère les marqueurs avant l'écriture : toute mutation survenue
        // pendant l'await sera reprise par le flush suivant, et non écrasée.
        set((s) => {
          for (const id of geometryIds) delete s.dirtyGeometry[id];
          for (const id of dataIds) delete s.dirtyData[id];
        });

        try {
          await canvasRepo.persistGeometry(geometry);
          for (const id of dataIds) {
            const node = byId.get(id);
            if (!node) continue;
            await canvasRepo.persistNodeData(
              boardId,
              node.id,
              node.type as CanvasNodeType,
              node.data,
            );
          }
        } catch (error) {
          // Remettre les marqueurs pour retenter au prochain flush.
          set((s) => {
            for (const id of geometryIds) s.dirtyGeometry[id] = true;
            for (const id of dataIds) s.dirtyData[id] = true;
          });
          fail(error);
        } finally {
          set((s) => {
            s.isSaving =
              Object.keys(s.dirtyGeometry).length > 0 ||
              Object.keys(s.dirtyData).length > 0;
          });
        }
      },
    };
  }),
);

// -----------------------------------------------------------------------------
// Sélecteurs
// -----------------------------------------------------------------------------

export const selectNodes = (s: CanvasStore) => s.nodes;
export const selectEdges = (s: CanvasStore) => s.edges;
export const selectViewport = (s: CanvasStore) => s.viewport;
export const selectIsSaving = (s: CanvasStore) => s.isSaving;

export function selectNodeById(s: CanvasStore, id: string): BoardyNode | undefined {
  return s.nodes.find((node) => node.id === id);
}

/**
 * Écrit les changements en attente avant la fermeture de la fenêtre.
 *
 * `beforeunload` ne se déclenche pas quand une fenêtre Tauri se ferme : le
 * processus natif s'arrête sans que le webview décharge le document. On
 * intercepte donc la demande de fermeture, on vide la file d'écriture, puis on
 * ferme pour de bon. Sans cela, les 500 dernières millisecondes d'édition sont
 * perdues à chaque sortie.
 */
/** Au-delà, on ferme la fenêtre sans attendre la fin de l'écriture. */
const FLUSH_ON_CLOSE_TIMEOUT_MS = 2000;

export async function registerCanvasFlushOnClose(): Promise<() => void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();

  const unlisten = await appWindow.onCloseRequested(async (event) => {
    if (!useCanvasStore.getState().isSaving) return;

    // À partir d'ici la fermeture est annulée : la fenêtre ne se refermera que
    // par le `destroy()` ci-dessous. Tout ce qui suit doit donc y aboutir quoi
    // qu'il arrive, sans quoi l'application devient impossible à quitter.
    event.preventDefault();
    try {
      // Un flush qui traîne — base verrouillée, disque lent — ne doit pas
      // retenir la fenêtre. Passé le délai, on ferme sans attendre : les
      // écritures en attente restent marquées et repartiront au prochain
      // démarrage.
      await Promise.race([
        useCanvasStore.getState().flush(),
        new Promise((resolve) => setTimeout(resolve, FLUSH_ON_CLOSE_TIMEOUT_MS)),
      ]);
    } catch {
      // La fermeture prime sur l'échec d'enregistrement.
    } finally {
      await appWindow.destroy();
    }
  });

  return unlisten;
}
