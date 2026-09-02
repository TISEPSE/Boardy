import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { useCanvasStore } from '../../stores/useCanvasStore';

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const deleteEdges = useCanvasStore((s) => s.deleteEdges);
  const [isHovered, setIsHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);

  return (
    <>
      {/* Ligne d'interaction invisible plus large pour capter le survol facilement */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={30}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer"
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="nodrag nopan"
        >
          <button
            type="button"
            title="Casser la liaison"
            aria-label="Casser la liaison"
            onClick={(e) => {
              e.stopPropagation();
              void deleteEdges([id]);
            }}
            className={[
              'flex size-6 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg transition-all duration-200 cursor-pointer border-2 border-white dark:border-slate-900 hover:scale-125',
              isHovered || selected
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-75 pointer-events-none',
            ].join(' ')}
          >
            <X className="size-3.5 stroke-[3]" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
