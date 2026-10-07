import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { borradorVacio, daysBetween, addDays, estirarPaso, estirarPasoMin, fueraDePlazo, moverPaso, duracionHoras, rangoSeleccion, spanTarea, todayISO } from '@sb/shared';
import { colocar, comoTask, desdeBorrador, nombrePaso, type PlanProps, type StepDraft } from '../../lib/pasosBorrador';
import { Barra, type Fase, type Op } from '../gantt/Barra';
import { fondo } from '../gantt/constantes';
import { Cabecera, ControlZoom, desplazamientos, geometriaPaso, posicionAhora, useZoom } from '../gantt/zoom';
import { Pista } from '../gantt/Pista';

const ETQ = 112;
const ALTO = 34;
const nada = () => {};

/**
 * Gantt del modal: la barra de la tarea es de solo lectura (su duración se cambia en la cabecera);
 * los pasos se mueven o estiran, un paso sin programar se coloca en su fila, y la fila
 * «＋ Nuevo paso» selecciona días para agregar uno.
 */
export function GanttPlan({ tarea, steps, color, onPasos, sel, setSel }: PlanProps) {
  const hoy = todayISO();
  const virtual = comoTask(tarea, steps);
  const offsets = desplazamientos(virtual.steps);
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
  const scroller = useRef<HTMLDivElement>(null);
  const { zoom, setZoom, col } = useZoom(scroller, ETQ);
  const ndias = daysBetween(ventana.inicio, ventana.fin) + 1;
  const ancho = ndias * col;
  const x = (f: string) => daysBetween(ventana.inicio, f) * col;
  // Al hacer zoom, el rango elegido queda al inicio de la vista
  const zoomPrevio = useRef<typeof zoom>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || zoomPrevio.current === zoom) return;
    el.scrollLeft = zoom ? daysBetween(ventana.inicio, zoom.inicio) * col : 0;
    zoomPrevio.current = zoom;
  }, [zoom, col, ventana.inicio]);
  // Fila con el primer toque pendiente (solo una a la vez)
  const [fila, setFila] = useState<number | 'nuevo' | null>(null);

  // `minutos`: paso por tiempo con zoom, al estirar los deltas van en saltos de 15 min (al mover, en días)
  const operar = (s: StepDraft[], i: number, op: Op, d: number, minutos = false) => {
    const paso = comoTask(tarea, s).steps[i];
    const dr =
      op === 'mover' ? moverPaso(borradorVacio(), paso, d) : minutos ? estirarPasoMin(borradorVacio(), paso, d) : estirarPaso(borradorVacio(), paso, d);
    onPasos(desdeBorrador(tarea, s, dr).steps);
  };
  const base = useRef<{ steps: StepDraft[]; i: number; minutos: boolean } | null>(null);
  const arrastre = (i: number, minutos: boolean) => (op: Op, d: number, fase: Fase) => {
    if (fase === 'inicio') {
      base.current = { steps, i, minutos };
      setFija(ventana);
      setFila(i);
      return;
    }
    const b = base.current;
    if (!b) return;
    // delta 0: se vuelve al punto de partida (un clic sin mover no cambia nada)
    if (d === 0) onPasos(b.steps);
    else operar(b.steps, b.i, op, d, b.minutos);
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
    <>
    <div className="mb-1.5">
      <ControlZoom zoom={zoom} onQuitar={() => setZoom(null)} />
    </div>
    <div ref={scroller} className="overflow-x-auto rounded-lg border border-line">
      <div className="relative" style={{ width: ETQ + ancho }}>
        <div className="flex border-b border-line bg-surface">
          <div className="sticky left-0 z-20 flex-none border-r border-line bg-surface" style={{ width: ETQ }} />
          <Cabecera inicio={ventana.inicio} dias={ndias} col={col} hoy={hoy} onZoom={setZoom} />
        </div>
        {hoy >= ventana.inicio && hoy <= ventana.fin && (
          <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-accent/70" style={{ left: ETQ + posicionAhora(x, hoy, col) }} />
        )}

        {/* Tarea: solo lectura */}
        <div className="flex border-b border-line/60">
          {etiqueta(<span className="truncate font-semibold">📌 Tarea</span>)}
          <div className="relative" style={{ width: ancho, height: ALTO, backgroundImage: fondo(col) }}>
            {span && (
              <Barra
                tipo="tarea"
                col={col}
                left={x(span.inicio)}
                width={(daysBetween(span.inicio, span.fin) + 1) * col}
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
        {virtual.steps.map((s, i) => {
          const g = s.startDate && s.duracionDias ? geometriaPaso(s, x, col, offsets.get(s.id)) : null;
          return (
            <div key={steps[i].id ?? `nuevo-${i}`} className={`flex border-b border-line/60 ${fila === i ? 'bg-accent/10' : ''}`}>
              {etiqueta(
                <span className="truncate">
                  {nombrePaso(steps[i], i)}
                  {s.duracionMin != null && <span className="ml-1 text-[11px] text-faint tabular-nums">· {duracionHoras(s.duracionMin)}</span>}
                </span>,
              )}
              <Pista ancho={ancho} inicio={ventana.inicio} col={col} activa={fila === i} onToque={() => setFila(i)} onRango={colocarPaso(i)}>
                {g ? (
                  <Barra
                    tipo="paso"
                    col={col}
                    unidadEstirar={g.unidadEstirar}
                    left={g.left}
                    width={g.width}
                    color={color}
                    deadline={null}
                    alerta={!s.done && fueraDePlazo(s, virtual)}
                    modificada={false}
                    editable
                    etiqueta={
                      s.duracionMin != null
                        ? `${nombrePaso(steps[i], i)}: ${s.startDate}, ${duracionHoras(s.duracionMin)}`
                        : `${nombrePaso(steps[i], i)}: desde ${s.startDate}, ${s.duracionDias} días`
                    }
                    onArrastre={arrastre(i, g.minutos)}
                    onTecla={(op, d) => operar(steps, i, op, d, g.minutos)}
                  />
                ) : null}
              </Pista>
            </div>
          );
        })}

        {/* Nuevo paso: seleccionar días */}
        <div className={`flex border-b border-line/60 ${fila === 'nuevo' ? 'bg-accent/10' : ''}`}>
          <div title="Arrastra o toca dos días para agregar un paso" className="contents">
            {etiqueta(<span className="truncate font-semibold text-accent">＋ Nuevo paso</span>)}
          </div>
          <Pista
            ancho={ancho}
            inicio={ventana.inicio}
            col={col}
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
                  width: (daysBetween(sel.inicio < ventana.inicio ? ventana.inicio : sel.inicio, sel.fin > ventana.fin ? ventana.fin : sel.fin) + 1) * col,
                }}
              />
            )}
          </Pista>
        </div>
      </div>
    </div>
    </>
  );
}
