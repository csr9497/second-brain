import { useState } from 'react';
import { shortDate } from '../../lib/format';
import { UNIDADES_TIEMPO } from '../../lib/options';
import type { PlanProps, StepDraft, UnidadTiempo } from '../../lib/pasosBorrador';
import { Select } from '../ui/Select';
import { CalendarioPlan } from './CalendarioPlan';
import { GanttPlan } from './GanttPlan';

/**
 * Planificador del modal de tarea (a todo el ancho): arrastrar de un día a otro en el Calendario, «＋ Paso este día»
 * en un día expandido o la fila «＋ Nuevo paso» del Gantt ofrecen agregar un paso con ese rango; si es de un solo día
 * puede llevar tiempo estimado en horas o minutos. La duración de la tarea no se cambia aquí, sino en la cabecera del modal.
 */
export function PlanificadorTarea({
  onAgregarPaso,
  ...props
}: PlanProps & { onAgregarPaso: (nombre: string, inicio: string, fin: string, tiempo?: Pick<StepDraft, 'tiempo' | 'unidad'>) => void }) {
  const [vista, setVista] = useState<'calendario' | 'gantt'>('calendario');
  const [nombre, setNombre] = useState('');
  const [tiempo, setTiempo] = useState('');
  const [unidad, setUnidad] = useState<UnidadTiempo>('h');
  const { sel, setSel } = props;
  const rango = sel ? (sel.inicio === sel.fin ? `el ${shortDate(sel.inicio)}` : `del ${shortDate(sel.inicio)} al ${shortDate(sel.fin)}`) : '';
  const unDia = !!sel && sel.inicio === sel.fin;
  const agregar = () => {
    if (!sel) return;
    onAgregarPaso(nombre.trim(), sel.inicio, sel.fin, unDia && tiempo.trim() ? { tiempo, unidad } : undefined);
    setNombre('');
    setTiempo('');
    setSel(null);
  };

  return (
    <section aria-label="Planificador" className="mb-[13px] rounded-xl border border-line p-3">
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
      {sel ? (
        <div
          role="group"
          aria-label="Agregar paso"
          className="mb-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 p-2"
          // En cualquier campo del grupo: Enter agrega (sin enviar el formulario de la tarea), Esc cancela
          onKeyDown={(e) => {
            if (!(e.target instanceof HTMLInputElement)) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              agregar();
            } else if (e.key === 'Escape') {
              e.preventDefault(); // el modal ignora los Esc ya atendidos
              setSel(null);
            }
          }}
        >
          <input
            autoFocus
            className="input min-w-40 flex-1 py-1.5 text-base sm:text-[13px]"
            placeholder="Nombre del paso"
            aria-label="Nombre del paso"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {unDia && (
            <div className="flex items-center gap-1" title="Opcional: tiempo estimado (solo en pasos de un día)">
              <input
                type="number"
                min={1}
                step="any"
                inputMode="decimal"
                aria-label="Tiempo estimado del paso"
                placeholder="Tiempo"
                className="input w-20 py-1.5 text-base sm:text-[13px]"
                value={tiempo}
                onChange={(e) => setTiempo(e.target.value)}
              />
              <div className="w-[74px]">
                <Select aria-label="Unidad del tiempo" className="py-1.5 text-[13px]" value={unidad} onChange={setUnidad} options={UNIDADES_TIEMPO} />
              </div>
            </div>
          )}
          <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={agregar}>
            ＋ Agregar paso {rango}
          </button>
          <button type="button" aria-label="Quitar selección" className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-text" onClick={() => setSel(null)}>
            ✕
          </button>
        </div>
      ) : (
        <p className="m-0 mb-2.5 text-[12px] text-faint">
          {vista === 'calendario'
            ? 'Toca un día para ver lo que tiene; arrastra de un día a otro para agregar un paso.'
            : 'Marca días en la fila «＋ Nuevo paso» para agregar uno; arrastra las barras de los pasos para moverlas o estirarlas. Selecciona fechas en la cabecera para hacer zoom.'}{' '}
          La duración de la tarea se cambia arriba.
        </p>
      )}
      {vista === 'calendario' ? <CalendarioPlan {...props} /> : <GanttPlan {...props} />}
    </section>
  );
}
