import { useRef, useState, type ReactNode } from 'react';
import {
  addDays,
  borradorVacio,
  daysBetween,
  estirarPaso,
  estirarTarea,
  fueraDePlazo,
  moverPaso,
  moverTarea,
  rangoSeleccion,
  spanTarea,
  todayISO,
} from '@sb/shared';
import { colocar, comoTask, desdeBorrador, nombrePaso, type Activo, type PlanProps, type StepDraft, type TareaPlan } from '../../lib/pasosBorrador';
import { Barra, type Fase, type Op } from '../gantt/Barra';
import { COL } from '../gantt/constantes';
import { Pista } from '../gantt/Pista';

const ETQ = 112;

/** Gantt del modal: barras (mover/estirar) y filas en las que se marca un rango para colocar. */
export function GanttPlan({ tarea, steps, color, activo, setActivo, onCambiar }: PlanProps) {
  const hoy = todayISO();
  const virtual = comoTask(tarea, steps);
  const span = spanTarea(virtual);
  const calcular = () => {
    const i0 = addDays(hoy, -3);
    const f0 = addDays(hoy, 27);
    return {
      inicio: span && span.inicio < i0 ? addDays(span.inicio, -3) : i0,
      fin: span && span.fin > f0 ? addDays(span.fin, 5) : f0,
    };
  };
  // Mientras se arrastra una barra, la ventana no se mueve
  const [fija, setFija] = useState<{ inicio: string; fin: string } | null>(null);
  const ventana = fija ?? calcular();
  const ndias = daysBetween(ventana.inicio, ventana.fin) + 1;
  const ancho = ndias * COL;
  const x = (f: string) => daysBetween(ventana.inicio, f) * COL;

  const operar = (t: TareaPlan, s: StepDraft[], obj: Activo, op: Op, d: number) => {
    const tb = comoTask(t, s);
    const dr =
      obj === 'tarea'
        ? op === 'mover'
          ? moverTarea(borradorVacio(), tb, d)
          : estirarTarea(borradorVacio(), tb, d)
        : op === 'mover'
          ? moverPaso(borradorVacio(), tb.steps[obj], d)
          : estirarPaso(borradorVacio(), tb.steps[obj], d);
    const r = desdeBorrador(t, s, dr);
    onCambiar(r.tarea, r.steps);
  };
  const base = useRef<{ tarea: TareaPlan; steps: StepDraft[]; obj: Activo } | null>(null);
  const arrastre = (obj: Activo) => (op: Op, d: number, fase: Fase) => {
    if (fase === 'inicio') {
      base.current = { tarea, steps, obj };
      setFija(ventana);
      setActivo(obj);
      return;
    }
    const b = base.current;
    if (!b) return;
    // delta 0: se vuelve al punto de partida (un clic sin mover no cambia nada)
    if (d === 0) onCambiar(b.tarea, b.steps);
    else operar(b.tarea, b.steps, b.obj, op, d);
    if (fase === 'fin') {
      base.current = null;
      setFija(null);
    }
  };
  const colocarEn = (obj: Activo) => (a: string, b: string) => {
    const r = rangoSeleccion(a, b);
    const res = colocar(tarea, steps, obj, r.inicio, r.fin);
    onCambiar(res.tarea, res.steps);
    setActivo(obj);
  };

  const filas: { obj: Activo; nombre: string; barra: ReactNode }[] = [
    {
      obj: 'tarea',
      nombre: '📌 Tarea',
      barra: span && (
        <Barra
          tipo="tarea"
          left={x(span.inicio)}
          width={(daysBetween(span.inicio, span.fin) + 1) * COL}
          color={color}
          deadline={tarea.deadline ? x(tarea.deadline) - x(span.inicio) : null}
          alerta={virtual.steps.some((s) => !s.done && fueraDePlazo(s, virtual))}
          modificada={false}
          editable
          etiqueta={`Tarea: ${span.inicio} a ${span.fin}`}
          onArrastre={arrastre('tarea')}
          onTecla={(op, d) => operar(tarea, steps, 'tarea', op, d)}
        />
      ),
    },
    ...virtual.steps.map((s, i) => ({
      obj: i as Activo,
      nombre: nombrePaso(steps[i], i),
      barra: s.startDate && s.duracionDias && (
        <Barra
          tipo="paso"
          left={x(s.startDate)}
          width={s.duracionDias * COL}
          color={color}
          deadline={null}
          alerta={!s.done && fueraDePlazo(s, virtual)}
          modificada={false}
          editable
          etiqueta={`${nombrePaso(steps[i], i)}: desde ${s.startDate}, ${s.duracionDias} días`}
          onArrastre={arrastre(i)}
          onTecla={(op, d) => operar(tarea, steps, i, op, d)}
        />
      ),
    })),
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <div className="relative" style={{ width: ETQ + ancho }}>
        <div className="flex border-b border-line bg-surface" aria-hidden>
          <div className="sticky left-0 z-20 flex-none border-r border-line bg-surface" style={{ width: ETQ }} />
          <div className="relative h-7" style={{ width: ancho }}>
            {Array.from({ length: ndias }, (_, i) => addDays(ventana.inicio, i)).map((d, i) => (
              <span key={d} className={`absolute top-1.5 text-center text-[10px] ${d === hoy ? 'font-bold text-accent' : 'text-faint'}`} style={{ left: i * COL, width: COL }}>
                {Number(d.slice(8))}
              </span>
            ))}
          </div>
        </div>
        {hoy >= ventana.inicio && hoy <= ventana.fin && (
          <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-accent/70" style={{ left: ETQ + x(hoy) + COL / 2 }} />
        )}
        {filas.map((f) => (
          <div key={String(f.obj)} className={`flex border-b border-line/60 ${activo === f.obj ? 'bg-accent/10' : ''}`}>
            <button
              type="button"
              onClick={() => setActivo(f.obj)}
              className="sticky left-0 z-[15] flex flex-none items-center truncate border-r border-line bg-surface px-2 text-left text-[12px]"
              style={{ width: ETQ, height: 34 }}
            >
              <span className="truncate">{f.nombre}</span>
            </button>
            <Pista
              ancho={ancho}
              inicio={ventana.inicio}
              activa={activo === f.obj}
              onToque={() => setActivo(f.obj)}
              onRango={colocarEn(f.obj)}
            >
              {f.barra}
            </Pista>
          </div>
        ))}
      </div>
    </div>
  );
}
