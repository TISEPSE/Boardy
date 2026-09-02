import { useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export interface DropPoint {
  x: number;
  y: number;
}

/**
 * Glisser-déposer de fichiers depuis l'explorateur du système.
 *
 * Le webview intercepte ces dépôts avant le DOM : les événements HTML
 * `dragover`/`drop` ne se déclenchent jamais avec `dragDropEnabled`. Il faut
 * donc passer par l'événement natif de Tauri, qui fournit les chemins absolus
 * — ce qu'un `DataTransfer` de navigateur ne donne pas.
 *
 * @returns `true` tant qu'un fichier survole la fenêtre.
 */
export function useFileDrop(
  onDrop: (paths: string[], point: DropPoint) => void,
): boolean {
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;

        if (payload.type === 'enter' || payload.type === 'over') {
          setIsOver(true);
          return;
        }
        if (payload.type === 'leave') {
          setIsOver(false);
          return;
        }

        setIsOver(false);
        // `position` est en pixels physiques ; le reste de l'application
        // raisonne en pixels CSS, d'où la division par le ratio de l'écran.
        const ratio = window.devicePixelRatio || 1;
        onDrop([...payload.paths], {
          x: payload.position.x / ratio,
          y: payload.position.y / ratio,
        });
      })
      .then((fn) => {
        // Le composant a pu être démonté avant que l'écoute soit établie.
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onDrop]);

  return isOver;
}
