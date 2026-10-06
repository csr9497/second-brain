import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  aplicarBorrador,
  borradorVacio,
  cambiosDelBorrador,
  daysBetween,
  estirarPaso,
  estirarTarea,
  fueraDePlazo,
  moverPaso,
  moverTarea,
  spanTarea,
  todayISO,
  ventanaGantt,
  type GanttDraft,
  type PaletteColor,
  type Step,
  type Task,
} from '@sb/shared';
import { api } from '../../lib/api';
import { useGuardiaSalida } from '../../lib/useVista';
import { rangoPaso, shortDate } from '../../lib/format';
import { Dot } from '../ui/Dot';
import { Barra, type Fase, type Op } from './Barra';
import { COL, ETIQUETA } from './constantes';
import { ResumenCambios } from './ResumenCambios';

type Objetivo = { tipo: 'tarea'; tarea: Task } | { tipo: 'paso'; paso: Step };
export const aplicarOp = (draft: GanttDraft, obj: Objetivo, op: Op, d: number) =>
  obj.tipo === 'tarea'
    ? op === 'mover'
      ? moverTarea(draft, obj.tarea, d)
      : estirarTarea(draft, obj.tarea, d)
    : op === 'mover'
      ? moverPaso(draft, obj.paso, d)
      : estirarPaso(draft, obj.paso, d);

type Grupo = { id: string; nombre: string; color: PaletteColor; items: { t: Task; inicio: string; fin: string }[] };

/** Agrupa por proyecto (orden: primer inicio; "Sin proyecto" al final) las tareas que tienen rango. */
function agrupar(tareas: Task[], projects: { id: string; nombre: string; color: PaletteColor }[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const t of tareas) {
    const span = spanTarea(t);
    if (!span) continue;
    const id = t.projectId ?? 'sin';
    const p = projects.find((x) => x.id === t.projectId);
    const g = grupos.get(id) ?? { id, nombre: p?.nombre ?? 'Sin proyecto', color: p?.color ?? 'gris', items: [] };
    g.items.push({ t, ...span });
    grupos.set(id, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.inicio.localeCompare(b.inicio)) }))
    .sort((a, b) => (a.id === 'sin' ? 1 : b.id === 'sin' ? -1 : a.items[0].inicio.localeCompare(b.items[0].inicio)));
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function GanttView({ onEditTask }: { onEditTask: (t: Task) => void }) {
  const hoy = todayISO();
  const [incluirHechas, setIncluirHechas] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['gantt', incluirHechas], queryFn: () => api.gantt(incluirHechas) });
  const [editando, setEditando] = useState(false);
  const [resumen, setResumen] = useState(false);
  const [draft, setDraft] = useState<GanttDraft>(borradorVacio);
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);

  const originales = useMemo(() => data?.tasks ?? [], [data]);
  const tareas = useMemo(() => aplicarBorrador(originales, draft), [originales, draft]);
  const ventana = useMemo(() => ventanaGantt(tareas, hoy), [tareas, hoy]);
  // El orden de grupos y filas sale de los datos originales: así no saltan mientras se arrastra
  const estructura = useMemo(() => agrupar(originales, data?.projects ?? []), [originales, data]);
  const grupos = useMemo(() => {
    const porId = new Map(tareas.map((t) => [t.id, t]));
    return estructura.map((g) => ({
      ...g,
      items: g.items.map(({ t }) => {
        const v = porId.get(t.id)!;
        return { t: v, ...spanTarea(v)! };
      }),
    }));
  }, [estructura, tareas]);
  const dias = useMemo(() => Array.from({ length: ventana.dias }, (_, i) => addDays(ventana.inicio, i)), [ventana]);
  const ancho = ventana.dias * COL;
  const x = (f: string) => daysBetween(ventana.inicio, f) * COL;
  const original = (id: string) => originales.find((t) => t.id === id)!;

  // La primera vez que se monta la cuadrícula, deja hoy a la vista (3 días a la izquierda); un refetch no mueve el scroll.
  // Si después cambia el inicio de la ventana (p. ej. al arrastrar fuera del borde), compensa el scroll
  // para que las barras no se desplacen respecto al puntero.
  const centradoEn = useRef<HTMLDivElement | null>(null);
  const inicioPrevio = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (centradoEn.current !== el) {
      el.scrollLeft = Math.max(0, (daysBetween(ventana.inicio, hoy) - 3) * COL);
      centradoEn.current = el;
    } else if (inicioPrevio.current && inicioPrevio.current !== ventana.inicio) {
      // Ventana que empieza antes => el contenido se corre a la derecha => scroll a la derecha
      el.scrollLeft += daysBetween(ventana.inicio, inicioPrevio.current) * COL;
    }
    inicioPrevio.current = ventana.inicio;
  }, [ventana.inicio, data, grupos.length, hoy]);

  const plegar = (id: string) =>
    setPlegados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cambios = useMemo(() => cambiosDelBorrador(originales, draft), [originales, draft]);
  // Ids con cambios reales: una barra que vuelve a su sitio deja de marcarse
  const modificados = useMemo(() => new Set(cambios.map((c) => c.id)), [cambios]);
  useGuardiaSalida(cambios.length > 0, 'Tienes cambios sin guardar en el Gantt. ¿Descartarlos?');

  // Arrastre: se parte del borrador y de la entidad al empezar; cada paso recalcula desde ahí
  const base = useRef<{ draft: GanttDraft; obj: Objetivo } | null>(null);
  const onArrastre = (obj: Objetivo, op: Op, d: number, fase: Fase) => {
    if (fase === 'inicio') {
      base.current = { draft, obj };
      return;
    }
    if (!base.current) return;
    setDraft(d === 0 ? base.current.draft : aplicarOp(base.current.draft, base.current.obj, op, d));
    if (fase === 'fin') base.current = null;
  };
  const salir = () => {
    if (cambios.length && !window.confirm('¿Descartar los cambios sin guardar?')) return;
    setDraft(borradorVacio());
    setEditando(false);
  };
  const onTecla = (obj: Objetivo, op: Op, d: number) => setDraft((dr) => aplicarOp(dr, obj, op, d));

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-lg font-semibold">Gantt</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={incluirHechas} disabled={editando} onChange={(e) => setIncluirHechas(e.target.checked)} className="accent-accent" />
            Incluir hechas
          </label>
          {!editando ? (
            <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" disabled={!data || grupos.length === 0} onClick={() => setEditando(true)}>
              ✏️ Editar
            </button>
          ) : (
            <>
              <span className="text-xs font-semibold" aria-live="polite">
                {cambios.length} {cambios.length === 1 ? 'cambio' : 'cambios'}
              </span>
              <button type="button" className="btn px-3 py-1.5 text-xs" onClick={salir}>
                {cambios.length ? 'Descartar' : 'Salir'}
              </button>
              <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" disabled={cambios.length === 0} onClick={() => setResumen(true)}>
                Guardar
              </button>
            </>
          )}
        </div>
      </div>
      {editando && (
        <p className="m-0 mb-2 text-[12px] text-faint">
          Arrastra una barra para moverla y su borde derecho para alargarla. Con el teclado: ← → mueve un día, Shift + ← → alarga o acorta. Mover una tarea mueve también sus pasos.
        </p>
      )}
      {isLoading && <p className="text-sm text-muted">Cargando…</p>}
      {error && <div className="card text-sm text-hot">No se pudo cargar: {error.message}</div>}
      {data && grupos.length === 0 && <div className="card text-sm text-faint">No hay tareas con fechas ni pasos programados.</div>}
      {data && grupos.length > 0 && (
        <div ref={scroller} className="card overflow-x-auto p-0">
          <div className="relative" style={{ width: ETIQUETA + ancho }}>
            <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
              <div className="sticky left-0 z-30 flex-none border-r border-line bg-surface" style={{ width: ETIQUETA }} />
              <div className="relative h-10" style={{ width: ancho }} aria-hidden>
                {dias.map((d, i) => (
                  <div key={d} className={`absolute top-0 h-full text-center text-[10px] ${d === hoy ? 'font-bold text-accent' : 'text-faint'}`} style={{ left: i * COL, width: COL }}>
                    {(i === 0 || d.endsWith('-01')) && (
                      <span className="absolute top-1 left-1 text-[10.5px] font-semibold whitespace-nowrap text-muted">{MESES[Number(d.slice(5, 7)) - 1]}</span>
                    )}
                    <span className="absolute bottom-1 left-0 w-full">{Number(d.slice(8))}</span>
                  </div>
                ))}
              </div>
            </div>
            {hoy >= ventana.inicio && hoy <= ventana.fin && (
              <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-accent/70" style={{ left: ETIQUETA + x(hoy) + COL / 2 }} />
            )}
            {grupos.map((g) => (
              <div key={g.id}>
                <Fila ancho={ancho} grupo>
                  <button type="button" aria-expanded={!plegados.has(g.id)} onClick={() => plegar(g.id)} className="flex w-full min-w-0 items-center gap-1.5 text-left text-xs font-semibold">
                    <span aria-hidden>{plegados.has(g.id) ? '▸' : '▾'}</span>
                    <Dot color={g.color} />
                    <span className="truncate">{g.nombre}</span>
                    <span className="font-normal text-faint">({g.items.length})</span>
                  </button>
                </Fila>
                {!plegados.has(g.id) &&
                  g.items.map(({ t, inicio, fin }) => (
                    <div key={t.id}>
                      <Fila
                        ancho={ancho}
                        barra={
                          <Barra
                            tipo="tarea"
                            left={x(inicio)}
                            width={(daysBetween(inicio, fin) + 1) * COL}
                            color={t.projectColor ?? 'gris'}
                            deadline={t.deadline ? x(t.deadline) - x(inicio) : null}
                            alerta={t.steps.some((s) => fueraDePlazo(s, t))}
                            modificada={modificados.has(t.id) || t.steps.some((s) => modificados.has(s.id))}
                            editable={editando}
                            etiqueta={`Tarea ${t.title}: ${shortDate(inicio)} a ${shortDate(fin)}${t.deadline ? `, vence ${shortDate(t.deadline)}` : ''}`}
                            onArrastre={(op, d, fase) => onArrastre({ tipo: 'tarea', tarea: t }, op, d, fase)}
                            onTecla={(op, d) => onTecla({ tipo: 'tarea', tarea: t }, op, d)}
                            onAbrir={() => onEditTask(original(t.id))}
                          />
                        }
                      >
                        <button type="button" disabled={editando} onClick={() => onEditTask(original(t.id))} className="block w-full truncate text-left text-[13px] hover:underline disabled:no-underline">
                          {t.title}
                        </button>
                      </Fila>
                      {t.steps
                        .filter((s) => s.startDate && s.duracionDias)
                        .map((s) => (
                          <Fila
                            key={s.id}
                            ancho={ancho}
                            barra={
                              <Barra
                                tipo="paso"
                                left={x(s.startDate!)}
                                width={s.duracionDias! * COL}
                                color={t.projectColor ?? 'gris'}
                                deadline={null}
                                alerta={fueraDePlazo(s, t)}
                                modificada={modificados.has(s.id)}
                                editable={editando}
                                etiqueta={`Paso ${s.title} (${t.title}): ${rangoPaso(s)}`}
                                onArrastre={(op, d, fase) => onArrastre({ tipo: 'paso', paso: s }, op, d, fase)}
                                onTecla={(op, d) => onTecla({ tipo: 'paso', paso: s }, op, d)}
                              />
                            }
                          >
                            <span className="block truncate pl-3 text-[12px] text-muted">{s.title}</span>
                          </Fila>
                        ))}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {resumen && (
        <ResumenCambios
          cambios={cambios}
          onVolver={() => setResumen(false)}
          onGuardado={() => {
            setResumen(false);
            setDraft(borradorVacio());
            setEditando(false);
          }}
        />
      )}
    </section>
  );
}

/** Fila: etiqueta fija a la izquierda + pista con la cuadrícula de días. */
function Fila({ ancho, grupo = false, barra, children }: { ancho: number; grupo?: boolean; barra?: ReactNode; children: ReactNode }) {
  const alto = grupo ? 30 : 34;
  return (
    <div className={`flex border-b border-line/60 ${grupo ? 'bg-surface2/60' : ''}`}>
      <div className="sticky left-0 z-[15] flex flex-none items-center border-r border-line bg-surface px-2" style={{ width: ETIQUETA, height: alto }}>
        {children}
      </div>
      <div
        className="relative"
        style={{
          width: ancho,
          height: alto,
          backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${COL - 1}px, color-mix(in srgb, var(--line) 45%, transparent) ${COL - 1}px ${COL}px)`,
        }}
      >
        {barra}
      </div>
    </div>
  );
}
