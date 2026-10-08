import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  aplicarBorrador,
  borradorVacio,
  cambiosDelBorrador,
  daysBetween,
  duracionHoras,
  estirarPaso,
  estirarPasoMin,
  estirarTarea,
  fueraDePlazo,
  moverPaso,
  moverTarea,
  rangoSeleccion,
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
import { confirmar } from '../ui/Confirmar';
import { rangoPaso, shortDate } from '../../lib/format';
import { Dot } from '../ui/Dot';
import { Barra, type Fase, type Op } from './Barra';
import { ETIQUETA, fondo } from './constantes';
import { PasoModal } from './PasoModal';
import { Pista } from './Pista';
import { ResumenCambios } from './ResumenCambios';
import { Cabecera, ControlZoom, desplazamientos, geometriaPaso, posicionAhora, useZoom } from './zoom';

/** `minutos`: paso por tiempo con zoom: al estirar, los deltas van en saltos de 15 min (al mover, siempre en días). */
type Objetivo = { tipo: 'tarea'; tarea: Task } | { tipo: 'paso'; paso: Step; minutos?: boolean };
export const aplicarOp = (draft: GanttDraft, obj: Objetivo, op: Op, d: number) =>
  obj.tipo === 'tarea'
    ? op === 'mover'
      ? moverTarea(draft, obj.tarea, d)
      : estirarTarea(draft, obj.tarea, d)
    : op === 'mover'
      ? moverPaso(draft, obj.paso, d)
      : obj.minutos
        ? estirarPasoMin(draft, obj.paso, d)
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

type Rango = { inicio: string; fin: string };
const navBtn = 'rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text';

export function GanttView({ onEditTask, onNewTask }: { onEditTask: (t: Task) => void; onNewTask: (rango?: Rango) => void }) {
  const hoy = todayISO();
  const [incluirHechas, setIncluirHechas] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['gantt', incluirHechas], queryFn: () => api.gantt(incluirHechas) });
  const [editando, setEditando] = useState(false);
  const [resumen, setResumen] = useState(false);
  const [detalle, setDetalle] = useState<{ paso: Step; tarea: Task } | null>(null);
  const [draft, setDraft] = useState<GanttDraft>(borradorVacio);
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);
  const { zoom, setZoom, col } = useZoom(scroller, ETIQUETA);
  // Rango marcado en la fila "＋ Nueva tarea": sigue resaltado hasta usarlo o quitarlo
  const [rango, setRango] = useState<Rango | null>(null);

  // Esc quita el rango, salvo que haya un diálogo abierto (ese Esc es suyo) o la pista ya lo haya atendido
  useEffect(() => {
    if (!rango) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role=dialog],[role=alertdialog]')) return;
      setRango(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rango]);

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
  const ancho = ventana.dias * col;
  const x = (f: string) => daysBetween(ventana.inicio, f) * col;
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
      el.scrollLeft = Math.max(0, (daysBetween(ventana.inicio, hoy) - 3) * col);
      centradoEn.current = el;
    } else if (inicioPrevio.current && inicioPrevio.current !== ventana.inicio) {
      // Ventana que empieza antes => el contenido se corre a la derecha => scroll a la derecha
      el.scrollLeft += daysBetween(ventana.inicio, inicioPrevio.current) * col;
    }
    inicioPrevio.current = ventana.inicio;
  }, [ventana.inicio, data, grupos.length, hoy]);

  // Al hacer zoom, el rango elegido queda al inicio de la vista; al quitarlo, vuelve a hoy
  const zoomPrevio = useRef<typeof zoom>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || zoomPrevio.current === zoom) return;
    el.scrollLeft = zoom ? daysBetween(ventana.inicio, zoom.inicio) * col : Math.max(0, (daysBetween(ventana.inicio, hoy) - 3) * col);
    zoomPrevio.current = zoom;
  }, [zoom, col, ventana.inicio, hoy]);

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
  const salir = async () => {
    if (cambios.length && !(await confirmar({ titulo: '¿Descartar los cambios sin guardar?', mensaje: 'Las barras volverán a sus fechas guardadas.' }))) return;
    setDraft(borradorVacio());
    setEditando(false);
  };
  // Resalte del rango marcado, limitado a los días visibles
  const marca = (() => {
    if (!rango || rango.fin < ventana.inicio || rango.inicio > ventana.fin) return null;
    const a = Math.max(0, daysBetween(ventana.inicio, rango.inicio));
    const b = Math.min(ventana.dias - 1, daysBetween(ventana.inicio, rango.fin));
    return { a, b };
  })();
  const onTecla = (obj: Objetivo, op: Op, d: number) => setDraft((dr) => aplicarOp(dr, obj, op, d));

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="m-0 font-display text-lg font-semibold">Gantt</h2>
          {data && grupos.length > 0 && <ControlZoom zoom={zoom} onQuitar={() => setZoom(null)} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={incluirHechas} disabled={editando} onChange={(e) => setIncluirHechas(e.target.checked)} className="accent-accent" />
            Incluir hechas
          </label>
          {!editando && (
            <>
              <button
                type="button"
                className="btn btn-primary px-3 py-1 text-xs"
                onClick={() => {
                  onNewTask(rango ?? undefined);
                  setRango(null);
                }}
              >
                {rango ? `＋ Tarea del ${shortDate(rango.inicio)}${rango.fin !== rango.inicio ? ` al ${shortDate(rango.fin)}` : ''}` : '＋ Nueva tarea'}
              </button>
              {rango && (
                <button type="button" aria-label="Quitar selección" className={navBtn} onClick={() => setRango(null)}>
                  ✕
                </button>
              )}
            </>
          )}
          {!editando ? (
            <button
              type="button"
              className="btn btn-primary px-3 py-1.5 text-xs"
              disabled={!data || grupos.length === 0}
              onClick={() => {
                setRango(null);
                setEditando(true);
              }}
            >
              ✏️ Editar
            </button>
          ) : (
            <>
              <span className="text-xs font-semibold" aria-live="polite">
                {cambios.length} {cambios.length === 1 ? 'cambio' : 'cambios'}
              </span>
              <button type="button" className="btn px-3 py-1.5 text-xs" onClick={() => void salir()}>
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
          Con zoom, los pasos por tiempo de un día se ven uno tras otro (jornada de 8 h) y se estiran de 15 en 15 min.
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
              <Cabecera inicio={ventana.inicio} dias={ventana.dias} col={col} hoy={hoy} onZoom={setZoom} />
            </div>
            {hoy >= ventana.inicio && hoy <= ventana.fin && (
              <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-accent/70" style={{ left: ETIQUETA + posicionAhora(x, hoy, col) }} />
            )}
            {grupos.map((g) => (
              <div key={g.id}>
                <Fila ancho={ancho} col={col} grupo>
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
                        col={col}
                        barra={
                          <Barra
                            tipo="tarea"
                            col={col}
                            left={x(inicio)}
                            width={(daysBetween(inicio, fin) + 1) * col}
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
                        .map((s) => {
                          const g = geometriaPaso(s, x, col, desplazamientos(t.steps).get(s.id));
                          const obj: Objetivo = { tipo: 'paso', paso: s, minutos: g.minutos };
                          return (
                          <Fila
                            key={s.id}
                            ancho={ancho}
                            col={col}
                            barra={
                              <Barra
                                tipo="paso"
                                col={col}
                                unidadEstirar={g.unidadEstirar}
                                left={g.left}
                                width={g.width}
                                color={t.projectColor ?? 'gris'}
                                deadline={null}
                                alerta={fueraDePlazo(s, t)}
                                modificada={modificados.has(s.id)}
                                editable={editando}
                                etiqueta={`Paso ${s.title} (${t.title}): ${rangoPaso(s)}`}
                                onArrastre={(op, d, fase) => onArrastre(obj, op, d, fase)}
                                onTecla={(op, d) => onTecla(obj, op, d)}
                                onAbrir={() => setDetalle({ paso: original(t.id).steps.find((x) => x.id === s.id) ?? s, tarea: original(t.id) })}
                              />
                            }
                          >
                            <button
                              type="button"
                              disabled={editando}
                              onClick={() => setDetalle({ paso: original(t.id).steps.find((x) => x.id === s.id) ?? s, tarea: original(t.id) })}
                              className="block w-full truncate pl-3 text-left text-[12px] text-muted hover:underline disabled:no-underline"
                            >
                              {s.title}
                              {s.duracionMin != null && <span className="ml-1 text-[11px] text-faint tabular-nums">· {duracionHoras(s.duracionMin)}</span>}
                            </button>
                          </Fila>
                          );
                        })}
                    </div>
                  ))}
              </div>
            ))}
            {!editando && (
              <div className="flex border-b border-line/60">
                <div
                  title="Arrastra o toca dos días para marcar el rango"
                  className="sticky left-0 z-[15] flex flex-none items-center border-r border-line bg-surface px-2 text-[12px] font-semibold text-accent"
                  style={{ width: ETIQUETA, height: 34 }}
                >
                  ＋ Nueva tarea
                </div>
                <Pista ancho={ancho} inicio={ventana.inicio} col={col} activa onToque={() => {}} onRango={(a, b) => setRango(rangoSeleccion(a, b))}>
                  {marca && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute top-1 bottom-1 rounded-md border border-accent bg-accent/20"
                      style={{ left: marca.a * col, width: (marca.b - marca.a + 1) * col }}
                    />
                  )}
                </Pista>
              </div>
            )}
          </div>
        </div>
      )}
      {detalle && <PasoModal paso={detalle.paso} tarea={detalle.tarea} onClose={() => setDetalle(null)} onEditTask={onEditTask} />}
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
function Fila({ ancho, col, grupo = false, barra, children }: { ancho: number; col: number; grupo?: boolean; barra?: ReactNode; children: ReactNode }) {
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
          backgroundImage: fondo(col),
        }}
      >
        {barra}
      </div>
    </div>
  );
}
