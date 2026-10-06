import { useState } from 'react';
import type { PaletteColor } from '@sb/shared';
import type { Activo, StepDraft, TareaPlan } from '../../lib/pasosBorrador';
import { CalendarioPlan } from './CalendarioPlan';

export interface PlanProps {
  tarea: TareaPlan;
  steps: StepDraft[];
  color: PaletteColor;
  activo: Activo;
  setActivo: (a: Activo) => void;
  /** Aplica tarea y pasos a la vez (mover la tarea mueve también sus pasos) */
  onCambiar: (tarea: TareaPlan, steps: StepDraft[]) => void;
}

export const nombrePaso = (s: StepDraft, i: number) => s.title.trim() || `Paso ${i + 1}`;
const chip = 'rounded-full border px-2.5 py-1 text-xs font-semibold transition';

/** Panel derecho del modal de tarea: coloca la tarea o un paso marcando días en Calendario o Gantt. */
export function PlanificadorTarea(props: PlanProps) {
  const { steps, activo, setActivo } = props;
  const [vista, setVista] = useState<'calendario' | 'gantt'>('calendario');
  const nombre = activo === 'tarea' ? 'la tarea' : `«${nombrePaso(steps[activo], activo)}»`;
  const opciones: Activo[] = ['tarea', ...steps.map((_, i) => i)];

  return (
    <section aria-label="Planificador" className="rounded-xl border border-line p-3">
      <div role="tablist" aria-label="Vista del planificador" className="mb-2.5 flex gap-1 rounded-lg bg-surface2 p-0.5">
        {(['calendario', 'gantt'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold text-muted aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-sm"
          >
            {v === 'calendario' ? '📅 Calendario' : '📊 Gantt'}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Colocando" className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-faint">Colocando:</span>
        {opciones.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={activo === o}
            onClick={() => setActivo(o)}
            className={`${chip} ${activo === o ? 'border-accent bg-accent text-white' : 'border-line text-muted hover:text-text'}`}
          >
            {o === 'tarea' ? '📌 Tarea' : nombrePaso(steps[o], o)}
          </button>
        ))}
      </div>
      <p className="m-0 mb-2 text-[12px] text-faint">
        Arrastra del primer al último día de {nombre}, o toca el primero y luego el último.
      </p>
      {vista === 'calendario' ? <CalendarioPlan {...props} /> : <p className="text-sm text-faint">Gantt en construcción</p>}
    </section>
  );
}
