import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { PaletteColor } from '@sb/shared';
import { COL } from './constantes';

export type Op = 'mover' | 'estirar';
export type Fase = 'inicio' | 'mover' | 'fin';

/**
 * Barra del Gantt. En modo edición: arrastrar = mover, borde derecho = estirar,
 * ← → = mover un día, Shift + ← → = estirar. Los deltas van en días.
 */
export function Barra({
  tipo,
  left,
  width,
  color,
  deadline,
  alerta,
  modificada,
  editable,
  etiqueta,
  onArrastre,
  onTecla,
  onAbrir,
}: {
  tipo: 'tarea' | 'paso';
  left: number;
  width: number;
  color: PaletteColor;
  /** Posición del deadline relativa al inicio de la barra (px), o null */
  deadline: number | null;
  alerta: boolean;
  modificada: boolean;
  editable: boolean;
  etiqueta: string;
  onArrastre: (op: Op, delta: number, fase: Fase) => void;
  onTecla: (op: Op, delta: number) => void;
  onAbrir?: () => void;
}) {
  const drag = useRef<{ x: number; op: Op; delta: number } | null>(null);

  const empezar = (op: Op) => (e: PointerEvent<HTMLElement>) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, op, delta: 0 };
    onArrastre(op, 0, 'inicio');
  };
  const mover = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((e.clientX - d.x) / COL);
    if (delta !== d.delta) {
      d.delta = delta;
      onArrastre(d.op, delta, 'mover');
    }
  };
  const soltar = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onArrastre(d.op, d.delta, 'fin');
  };
  const tecla = (e: KeyboardEvent<HTMLElement>) => {
    if (!editable) {
      if ((e.key === 'Enter' || e.key === ' ') && onAbrir) {
        e.preventDefault();
        onAbrir();
      }
      return;
    }
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onTecla(e.shiftKey ? 'estirar' : 'mover', dir);
  };

  return (
    <div
      role="button"
      aria-roledescription="barra del Gantt"
      aria-label={etiqueta}
      tabIndex={0}
      onKeyDown={tecla}
      onPointerDown={empezar('mover')}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onClick={() => !editable && onAbrir?.()}
      className={`absolute rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text ${
        tipo === 'tarea' ? 'top-[7px] h-5' : 'top-[11px] h-3'
      } ${editable ? 'cursor-grab touch-none select-none active:cursor-grabbing' : onAbrir ? 'cursor-pointer' : ''} ${alerta ? 'ring-2 ring-hot' : ''}`}
      style={{ left, width: Math.max(width, COL / 2), background: `var(--c-${color})`, opacity: tipo === 'paso' ? 0.7 : 0.95 }}
    >
      {modificada && <span aria-hidden className="pointer-events-none absolute -inset-[3px] rounded-lg border-2 border-dashed border-accent" />}
      {deadline != null && <span aria-hidden className="absolute -top-[3px] -bottom-[3px] w-[3px] rounded bg-text" style={{ left: deadline + COL - 3 }} />}
      {editable && (
        <span aria-hidden onPointerDown={empezar('estirar')} className="absolute top-0 right-0 h-full w-2.5 cursor-ew-resize rounded-r-md bg-black/25" />
      )}
    </div>
  );
}
