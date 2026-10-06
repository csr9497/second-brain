import { useRef, useState, type ReactNode } from 'react';
import { addDays, borradorVacio, daysBetween, estirarPaso, fueraDePlazo, moverPaso, rangoSeleccion, spanTarea, todayISO } from '@sb/shared';
import { colocar, comoTask, desdeBorrador, nombrePaso, type PlanProps, type StepDraft } from '../../lib/pasosBorrador';
import { Barra, type Fase, type Op } from '../gantt/Barra';
import { COL } from '../gantt/constantes';
import { Pista } from '../gantt/Pista';

const ETQ = 112;
const ALTO = 34;
const cuadricula = `repeating-linear-gradient(to right, transparent 0 ${COL - 1}px, color-mix(in srgb, var(--line) 45%, transparent) ${COL - 1}px ${COL}px)`;
const nada = () => {};

/**
 * Gantt del modal: la barra de la tarea es de solo lectura (su duración se cambia en la cabecera);
 * los pasos se mueven o estiran, un paso sin programar se coloca en su fila, y la fila
 * «＋ Nuevo paso» selecciona días para agregar uno.
 */
export function GanttPlan({ tarea, steps, color, onPasos, sel, setSel }: PlanProps) {
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
  // Fila con el primer toque pendiente (solo una a la vez)
  const [fila, setFila] = useState<number | 'nuevo' | null>(null);

  const operar = (s: StepDraft[], i: number, op: Op, d: number) => {
    const tb = comoTask(tarea, s);
    const dr = op === 'mover' ? moverPaso(borradorVacio(), tb.steps[i], d) : estirarPaso(borradorVacio(), tb.steps[i], d);
    onPasos(desdeBorrador(tarea, s, dr).steps);
  };
  const base = useRef<{ steps: StepDraft[]; i: number } | null>(null);
  const arrastre = (i: number) => (op: Op, d: number, fase: Fase) => {
    if (fase === 'inicio') {
      base.current = { steps, i };
      setFija(ventana);
      setFila(i);
      return;
    }
    const b = base.current;
    if (!b) return;
    // delta 0: se vuelve al punto de partida (un clic sin mover no cambia nada)
    if (d === 0) onPasos(b.steps);
    else operar(b.steps, b.i, op, d);
    if (fase === 'fin') {
      base.current = null;
      setFija(null);
    }
  };
  const colocarPaso = (i: number) => (a: string, b: string) => {
    const r = rangoSeleccion(a, b);
    onPasos(colocar(tarea, steps, i, r.inicio, r.fin).steps);
    setFila(i);
  };
  const selVisible = sel && sel.fin >= ventana.inicio && sel.inicio <= ventana.fin;

  const etiqueta = (contenido: ReactNode, clase = '') => (
    <div className={`sticky left-0 z-[15] flex flex-none items-center truncate border-r border-line bg-surface px-2 text-[12px] ${clase}`} style={{ width: ETQ, height: ALTO }}>
      {contenido}
    </div>
  );

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

        {/* Tarea: solo lectura */}
        <div className="flex border-b border-line/60">
          {etiqueta(<span className="truncate font-semibold">📌 Tarea</span>)}
          <div className="relative" style={{ width: ancho, height: ALTO, backgroundImage: cuadricula }}>
            {span && (
              <Barra
                tipo="tarea"
                left={x(span.inicio)}
                width={(daysBetween(span.inicio, span.fin) + 1) * COL}
                color={color}
                deadline={tarea.deadline ? x(tarea.deadline) - x(span.inicio) : null}
                alerta={virtual.steps.some((s) => !s.done && fueraDePlazo(s, virtual))}
                modificada={false}
                editable={false}
                etiqueta={`Tarea: del ${span.inicio} al ${span.fin} (se cambia arriba)`}
                onArrastre={nada}
                onTecla={nada}
              />
            )}
          </div>
        </div>

        {/* Pasos: mover/estirar; los sin programar se colocan en su fila */}
        {virtual.steps.map((s, i) => (
          <div key={steps[i].id ?? `nuevo-${i}`} className={`flex border-b border-line/60 ${fila === i ? 'bg-accent/10' : ''}`}>
            {etiqueta(<span className="truncate">{nombrePaso(steps[i], i)}</span>)}
            <Pista ancho={ancho} inicio={ventana.inicio} activa={fila === i} onToque={() => setFila(i)} onRango={colocarPaso(i)}>
              {s.startDate && s.duracionDias ? (
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
                  onTecla={(op, d) => operar(steps, i, op, d)}
                />
              ) : null}
            </Pista>
          </div>
        ))}

        {/* Nuevo paso: seleccionar días */}
        <div className={`flex border-b border-line/60 ${fila === 'nuevo' ? 'bg-accent/10' : ''}`}>
          <div title="Arrastra o toca dos días para agregar un paso" className="contents">
            {etiqueta(<span className="truncate font-semibold text-accent">＋ Nuevo paso</span>)}
          </div>
          <Pista
            ancho={ancho}
            inicio={ventana.inicio}
            activa={fila === 'nuevo'}
            onToque={() => {
              setFila('nuevo');
              setSel(null);
            }}
            onRango={(a, b) => {
              setSel(rangoSeleccion(a, b));
              setFila('nuevo');
            }}
          >
            {selVisible && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-1 bottom-1 rounded-md border border-accent bg-accent/20"
                style={{
                  left: x(sel.inicio < ventana.inicio ? ventana.inicio : sel.inicio),
                  width: (daysBetween(sel.inicio < ventana.inicio ? ventana.inicio : sel.inicio, sel.fin > ventana.fin ? ventana.fin : sel.fin) + 1) * COL,
                }}
              />
            )}
          </Pista>
        </div>
      </div>
    </div>
  );
}
