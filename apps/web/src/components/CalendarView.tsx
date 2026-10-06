import { Children, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SLOT_NOMBRE, isOverdue, mesDe, rangoSeleccion, sumarMeses, todayISO, weekday, type CalendarDay, type HabitSlot, type ItemDia, type Task } from '@sb/shared';
import { api } from '../lib/api';
import { headerDate, mesLabel, rangoPaso, shortDate } from '../lib/format';
import { Dot } from './ui/Dot';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_MARCAS = 3;
const POR: Record<HabitSlot, string> = { manana: 'la mañana', tarde: 'la tarde', noche: 'la noche' };
const navBtn = 'rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text';
const itemBtn = 'flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[13px] hover:bg-surface2';

type Rango = { inicio: string; fin: string };

/** Mes con tareas, pasos y vencimientos con título, y % de hábitos (anillo); panel con el detalle del día. Se puede marcar un rango para crear una tarea. */
export function CalendarView({ onEditTask, onNewTask }: { onEditTask: (t: Task) => void; onNewTask: (rango?: Rango) => void }) {
  const hoy = todayISO();
  const [mes, setMes] = useState(mesDe(hoy));
  const [sel, setSel] = useState(hoy);
  const [rango, setRango] = useState<Rango | null>(null);
  const [marcandoDesde, setMarcandoDesde] = useState<string | null>(null); // táctil: "marcar rango desde este día"
  // Arrastre con ratón: en un ref (no en estado) para no re-renderizar ni depender de updaters en StrictMode
  const arrastre = useRef<{ desde: string; hasta: string; movio: boolean; activo: boolean } | null>(null);
  // `hoy` en la clave: al cruzar la medianoche se recalcula qué días son pasados o futuros
  const { data, isLoading, error } = useQuery({ queryKey: ['calendar', mes, hoy], queryFn: () => api.calendar(mes), placeholderData: keepPreviousData });
  const dias = data?.semanas.flat() ?? [];
  const dia = dias.find((d) => d.fecha === sel) ?? null;

  // Al soltar en cualquier sitio termina el arrastre. Se limpia tras el `click` que sigue al pointerup,
  // para que ese click sepa si hubo arrastre.
  useEffect(() => {
    const soltar = () => {
      if (!arrastre.current) return;
      arrastre.current.activo = false;
      setTimeout(() => {
        if (arrastre.current && !arrastre.current.activo) arrastre.current = null;
      }, 0);
    };
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    return () => {
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
  }, []);

  // Esc limpia la selección, salvo que haya un diálogo abierto (ese Esc es suyo)
  useEffect(() => {
    if (!rango && !marcandoDesde) return;
    const onKey = (e: KeyboardEvent) => {
      // `defaultPrevented`: el Esc ya lo atendió un modal
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role=dialog],[role=alertdialog]')) return;
      setRango(null);
      setMarcandoDesde(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rango, marcandoDesde]);

  const irA = (m: string) => {
    setMes(m);
    setSel(m === mesDe(hoy) ? hoy : `${m}-01`);
  };

  const limpiar = () => {
    setRango(null);
    setMarcandoDesde(null);
  };
  const nueva = (r?: Rango) => {
    onNewTask(r);
    limpiar();
  };

  const alPulsar = (d: string, e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.shiftKey || marcandoDesde) return;
    arrastre.current = { desde: d, hasta: d, movio: false, activo: true };
  };
  const alEntrar = (d: string) => {
    const a = arrastre.current;
    if (!a?.activo || d === a.hasta) return;
    a.hasta = d;
    a.movio = true;
    setRango(rangoSeleccion(a.desde, d));
  };
  const alClic = (d: string, e: MouseEvent) => {
    if (marcandoDesde) {
      setRango(rangoSeleccion(marcandoDesde, d));
      setMarcandoDesde(null);
    } else if (e.shiftKey) {
      setRango(rangoSeleccion(sel, d));
    } else if (!arrastre.current?.movio) {
      setSel(d);
      setRango(null);
    }
    arrastre.current = null;
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-lg font-semibold first-letter:uppercase">{mesLabel(mes)}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn btn-primary px-3 py-1 text-xs" onClick={() => nueva(rango ?? undefined)}>
            {rango ? `＋ Tarea del ${shortDate(rango.inicio)}${rango.fin !== rango.inicio ? ` al ${shortDate(rango.fin)}` : ''}` : '＋ Nueva tarea'}
          </button>
          {rango && (
            <button type="button" aria-label="Quitar selección" className={navBtn} onClick={limpiar}>
              ✕
            </button>
          )}
          <button type="button" aria-label="Mes anterior" onClick={() => irA(sumarMeses(mes, -1))} className={navBtn}>
            ‹
          </button>
          <button type="button" onClick={() => irA(mesDe(hoy))} className={navBtn}>
            Hoy
          </button>
          <button type="button" aria-label="Mes siguiente" onClick={() => irA(sumarMeses(mes, 1))} className={navBtn}>
            ›
          </button>
        </div>
      </div>
      {isLoading && <p className="text-sm text-muted">Cargando…</p>}
      {error && <div className="card text-sm text-hot">No se pudo cargar: {error.message}</div>}
      {data && (
        <div className="grid gap-4 md:grid-cols-[1fr_270px]">
          <div className="card p-2">
            <p className="m-0 mb-1.5 flex flex-wrap gap-3 px-1 text-[11px] text-faint">
              <span>▬ tarea</span>
              <span>▭ paso</span>
              <span>⚑ vence</span>
              <span>◔ hábitos</span>
            </p>
            {marcandoDesde && (
              <p role="status" className="m-0 mb-1.5 px-1 text-xs font-semibold text-accent">
                Elige el último día del rango (Esc cancela)
              </p>
            )}
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-faint" aria-hidden>
              {DIAS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            {/* sin separación horizontal: las barras de varios días se ven continuas */}
            <div className="grid grid-cols-7 gap-y-1 select-none">
              {dias.map((d) => (
                <Celda
                  key={d.fecha}
                  dia={d}
                  hoy={hoy}
                  activo={d.fecha === sel}
                  enRango={rango != null && rango.inicio <= d.fecha && d.fecha <= rango.fin}
                  onPointerDown={(e) => alPulsar(d.fecha, e)}
                  onPointerEnter={() => alEntrar(d.fecha)}
                  onClick={(e) => alClic(d.fecha, e)}
                />
              ))}
            </div>
          </div>
          {dia && (
            <PanelDia
              dia={dia}
              hoy={hoy}
              onEditTask={onEditTask}
              onNewTask={nueva}
              onRangoDesde={(f) => {
                setMarcandoDesde(f);
                setRango({ inicio: f, fin: f });
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}

function Celda({
  dia,
  hoy,
  activo,
  enRango,
  onPointerDown,
  onPointerEnter,
  onClick,
}: {
  dia: CalendarDay;
  hoy: string;
  activo: boolean;
  enRango: boolean;
  onPointerDown: (e: PointerEvent) => void;
  onPointerEnter: () => void;
  onClick: (e: MouseEvent) => void;
}) {
  const n = dia.items.length;
  const [lunes, domingo] = [weekday(dia.fecha) === 1, weekday(dia.fecha) === 0];
  const ocultos = dia.items.filter((it) => it.carril >= MAX_MARCAS).length;
  const cuenta = (tipo: ItemDia['tipo']) => dia.items.filter((it) => it.tipo === tipo).length;
  const [tareas, pasos, vencen] = [cuenta('tarea'), cuenta('paso'), cuenta('vence')];
  // vencida: en el último día de una tarea con rango, o en su "⚑ vence"
  const esVencida = (it: ItemDia) => it.tipo !== 'paso' && it.fin && isOverdue(it.tarea, hoy);
  const vencidas = dia.items.filter(esVencida).length;
  const resumen = [
    tareas ? `${tareas} ${tareas === 1 ? 'tarea' : 'tareas'}` : null,
    pasos ? `${pasos} ${pasos === 1 ? 'paso' : 'pasos'}` : null,
    vencen ? `${vencen} ${vencen === 1 ? 'vence' : 'vencen'}` : null,
    n === 0 ? 'sin tareas' : null,
    vencidas ? `${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}` : null,
    dia.habitos.pct != null ? `hábitos ${dia.habitos.pct}%` : null,
    enRango ? 'en el rango marcado' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={`${headerDate(dia.fecha)}${dia.esHoy ? ' (hoy)' : ''}: ${resumen}`}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
      className={`flex min-h-16 min-w-0 flex-col gap-1 rounded-lg border p-1 text-left transition sm:min-h-20 ${
        activo ? 'border-accent bg-surface2' : 'border-transparent hover:bg-surface2'
      } ${enRango ? 'bg-accent/10 ring-2 ring-accent' : ''} ${dia.enMes ? '' : 'opacity-40'}`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${dia.esHoy ? 'bg-accent text-white' : ''}`}>
          {Number(dia.fecha.slice(8))}
        </span>
        {dia.habitos.pct != null && (
          <span aria-hidden className="size-3.5 rounded-full" style={{ background: `conic-gradient(var(--good) ${dia.habitos.pct}%, var(--line) 0)` }} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5" aria-hidden>
        {Array.from({ length: Math.min(MAX_MARCAS, Math.max(0, ...dia.items.map((it) => it.carril + 1))) }, (_, carril) => {
          const it = dia.items.find((x) => x.carril === carril);
          if (!it) return <span key={`vacio-${carril}`} className="h-4" />;
          const c = it.tarea.projectColor ?? 'gris';
          if (it.tipo === 'vence') {
            const vencida = isOverdue(it.tarea, hoy);
            return (
              <span key={it.key} className={`flex h-4 min-w-0 items-center gap-1 text-[10px] font-semibold ${vencida ? 'text-hot' : 'text-text'}`}>
                <span>⚑</span>
                <span className="hidden truncate sm:inline">{it.titulo}</span>
              </span>
            );
          }
          // de borde a borde de la celda (padding + borde) salvo en sus extremos y en los bordes de la semana
          const tramo = `${it.inicio ? 'rounded-l-md' : lunes ? '-ml-1' : '-ml-[5px]'} ${it.fin ? 'rounded-r-md' : domingo ? '-mr-1' : '-mr-[5px]'}`;
          return it.tipo === 'tarea' ? (
            <span key={it.key} className={`flex h-4 min-w-0 items-center gap-0.5 px-1 text-[10px] font-semibold text-white ${tramo}`} style={{ background: `var(--c-${c})` }}>
              <span className="hidden min-w-0 flex-1 truncate sm:inline">{it.etiqueta ? it.titulo : '\u00a0'}</span>
              {esVencida(it) && <span className="ml-auto flex-none rounded-sm bg-hot px-0.5 leading-none font-bold text-white">!</span>}
            </span>
          ) : (
            <span
              key={it.key}
              className={`flex h-4 min-w-0 items-center px-1 text-[9.5px] ${tramo}`}
              style={{ background: `color-mix(in srgb, var(--c-${c}) 30%, transparent)` }}
            >
              <span className="hidden truncate sm:inline">{it.etiqueta ? it.titulo : '\u00a0'}</span>
            </span>
          );
        })}
        {ocultos > 0 && <span className="text-[10px] font-semibold text-faint">+{ocultos}</span>}
      </div>
    </button>
  );
}

function PanelDia({
  dia,
  hoy,
  onEditTask,
  onNewTask,
  onRangoDesde,
}: {
  dia: CalendarDay;
  hoy: string;
  onEditTask: (t: Task) => void;
  onNewTask: (rango: Rango) => void;
  onRangoDesde: (fecha: string) => void;
}) {
  const fichas = (['manana', 'tarde', 'noche'] as const).flatMap((f) => dia.habitos.porFranja[f]);
  return (
    <aside className="card self-start" aria-label={`Detalle: ${headerDate(dia.fecha)}`}>
      <h3 className="m-0 mb-3 font-display text-base font-semibold">{headerDate(dia.fecha)}</h3>
      <button type="button" onClick={() => onNewTask({ inicio: dia.fecha, fin: dia.fecha })} className="mb-3 rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted hover:text-text">
        ＋ Tarea este día
      </button>
      <button type="button" onClick={() => onRangoDesde(dia.fecha)} className="mb-3 ml-2 rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted hover:text-text">
        ↔ Marcar rango desde este día
      </button>
      <Seccion titulo="Vencen" vacio="Nada vence este día.">
        {dia.vencen.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onEditTask(t)} className={itemBtn}>
              <Dot color={t.projectColor ?? 'gris'} />
              <span className={`min-w-0 flex-1 truncate ${t.status === 'hecha' ? 'text-faint line-through' : ''}`}>{t.title}</span>
              {isOverdue(t, hoy) && <span className="text-[11px] font-semibold text-hot">vencida</span>}
            </button>
          </li>
        ))}
      </Seccion>
      <Seccion titulo="Pasos" vacio="Sin pasos programados.">
        {dia.pasos.map(({ paso, tarea }) => (
          <li key={paso.id}>
            <button type="button" onClick={() => onEditTask(tarea)} className={itemBtn}>
              <span aria-hidden className="h-2 w-3 flex-none rounded-full" style={{ background: `var(--c-${tarea.projectColor ?? 'gris'})` }} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${paso.done ? 'text-faint line-through' : ''}`}>{paso.title}</span>
                <span className="block truncate text-[11px] text-faint">
                  {tarea.title} · {rangoPaso(paso)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </Seccion>
      <Seccion titulo={dia.habitos.pct != null ? `Hábitos · ${dia.habitos.pct}%` : 'Hábitos'} vacio="Sin hábitos este día.">
        {fichas.map((c) => (
          <li key={`${c.id}-${c.slot}`} className="flex items-center gap-2 px-1.5 py-1 text-[13px]">
            <span aria-hidden className={c.done ? 'text-good' : 'text-faint'}>
              {c.done ? '✓' : dia.esFuturo ? '◦' : '○'}
            </span>
            <span className="sr-only">{c.done ? 'hecho' : dia.esFuturo ? 'programado' : 'pendiente'}</span>
            <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
            <span className="text-[11px] whitespace-nowrap text-faint">
              {SLOT_NOMBRE[c.slot]}
              {c.done && c.doneIn && c.doneIn !== c.slot ? ` · hecho por ${POR[c.doneIn]}` : dia.esFuturo ? ' · programado' : ''}
            </span>
          </li>
        ))}
      </Seccion>
    </aside>
  );
}

function Seccion({ titulo, vacio, children }: { titulo: string; vacio: string; children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <section className="mb-3 last:mb-0">
      <h4 className="m-0 mb-1 text-xs font-semibold text-muted">{titulo}</h4>
      {items.length > 0 ? <ul className="m-0 list-none p-0">{items}</ul> : <p className="m-0 text-[12.5px] text-faint">{vacio}</p>}
    </section>
  );
}
