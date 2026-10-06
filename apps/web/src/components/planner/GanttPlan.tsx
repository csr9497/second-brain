import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
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

/** Fondo de una fila: con ratón, arrastrar marca un rango; un clic o un toque, dos toques (inicio y fin). */
function Pista({
  ancho,
  inicio,
  activa,
  onToque,
  onRango,
  children,
}: {
  ancho: number;
  inicio: string;
  /** Si la fila deja de ser la activa, se descarta su primer toque */
  activa: boolean;
  onToque: () => void;
  onRango: (a: string, b: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sel = useRef<{ desde: number; hasta: number } | null>(null);
  const arrastrado = useRef(false);
  const [vista, setVista] = useState<{ a: number; b: number } | null>(null);
  // Primer toque como fecha (no como índice): si la ventana se desplaza, no se mueve
  const [pendiente, setPendiente] = useState<string | null>(null);
  useEffect(() => {
    if (!activa) setPendiente(null);
  }, [activa]);
  // Día bajo el puntero, limitado a la ventana (con captura, el puntero puede salir de la fila)
  const diaEn = (clientX: number) =>
    Math.min(ancho / COL - 1, Math.max(0, Math.floor((clientX - ref.current!.getBoundingClientRect().left) / COL)));
  const fecha = (n: number) => addDays(inicio, n);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    arrastrado.current = false; // por si el click de un arrastre anterior no llegó
    if (e.target !== e.currentTarget || e.pointerType !== 'mouse' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const n = diaEn(e.clientX);
    sel.current = { desde: n, hasta: n };
    setVista({ a: n, b: n });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = sel.current;
    if (!s) return;
    const n = diaEn(e.clientX);
    if (n !== s.hasta) {
      s.hasta = n;
      setVista({ a: s.desde, b: n });
    }
  };
  const up = () => {
    const s = sel.current;
    if (!s) return;
    sel.current = null;
    setVista(null);
    if (s.desde !== s.hasta) {
      arrastrado.current = true; // el click que sigue no es un toque
      setPendiente(null);
      onRango(fecha(s.desde), fecha(s.hasta));
    }
  };
  const cancelar = () => {
    sel.current = null;
    setVista(null);
  };
  const click = (e: { target: EventTarget; currentTarget: EventTarget; clientX: number }) => {
    if (arrastrado.current) {
      arrastrado.current = false;
      return;
    }
    if (e.target !== e.currentTarget) return; // clic en una barra
    const n = diaEn(e.clientX);
    if (pendiente == null) {
      setPendiente(fecha(n));
      onToque();
      ref.current?.focus({ preventScroll: true }); // para que Esc lo cancele
    } else {
      onRango(pendiente, fecha(n));
      setPendiente(null);
    }
  };
  const tecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && pendiente != null) {
      e.preventDefault(); // el modal ignora los Esc ya atendidos
      setPendiente(null);
    }
  };
  const ip = pendiente != null ? daysBetween(inicio, pendiente) : null;
  const marca = vista ?? (ip != null && ip >= 0 && ip < ancho / COL ? { a: ip, b: ip } : null);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="relative cursor-crosshair outline-none"
      style={{
        width: ancho,
        height: 34,
        backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${COL - 1}px, color-mix(in srgb, var(--line) 45%, transparent) ${COL - 1}px ${COL}px)`,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancelar}
      onClick={click}
      onKeyDown={tecla}
    >
      {marca && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 rounded-md border border-dashed border-accent bg-accent/15"
          style={{ left: Math.min(marca.a, marca.b) * COL, width: (Math.abs(marca.b - marca.a) + 1) * COL }}
        />
      )}
      {children}
    </div>
  );
}
