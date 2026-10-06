import { Children, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SLOT_NOMBRE, isOverdue, mesDe, sumarMeses, todayISO, type CalendarDay, type HabitSlot, type PaletteColor, type Task } from '@sb/shared';
import { api } from '../lib/api';
import { headerDate, mesLabel, rangoPaso } from '../lib/format';
import { Dot } from './ui/Dot';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_MARCAS = 3;
const POR: Record<HabitSlot, string> = { manana: 'la mañana', tarde: 'la tarde', noche: 'la noche' };
const navBtn = 'rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text';
const itemBtn = 'flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[13px] hover:bg-surface2';

/** Mes con tareas (puntos), pasos (barras) y % de hábitos (anillo); panel con el detalle del día. */
export function CalendarView({ onEditTask, onNewTask }: { onEditTask: (t: Task) => void; onNewTask: (fecha: string) => void }) {
  const hoy = todayISO();
  const [mes, setMes] = useState(mesDe(hoy));
  const [sel, setSel] = useState(hoy);
  // `hoy` en la clave: al cruzar la medianoche se recalcula qué días son pasados o futuros
  const { data, isLoading, error } = useQuery({ queryKey: ['calendar', mes, hoy], queryFn: () => api.calendar(mes), placeholderData: keepPreviousData });
  const dias = data?.semanas.flat() ?? [];
  const dia = dias.find((d) => d.fecha === sel) ?? null;

  const irA = (m: string) => {
    setMes(m);
    setSel(m === mesDe(hoy) ? hoy : `${m}-01`);
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="m-0 font-display text-lg font-semibold first-letter:uppercase">{mesLabel(mes)}</h2>
        <div className="flex gap-1.5">
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
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-faint" aria-hidden>
              {DIAS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {dias.map((d) => (
                <Celda key={d.fecha} dia={d} hoy={hoy} activo={d.fecha === sel} onClick={() => setSel(d.fecha)} />
              ))}
            </div>
          </div>
          {dia && <PanelDia dia={dia} hoy={hoy} onEditTask={onEditTask} onNewTask={onNewTask} />}
        </div>
      )}
    </section>
  );
}

function Celda({ dia, hoy, activo, onClick }: { dia: CalendarDay; hoy: string; activo: boolean; onClick: () => void }) {
  const color = (t: Task): PaletteColor => t.projectColor ?? 'gris';
  const marcas = [
    ...dia.vencen.map((t) => ({ key: `t-${t.id}`, tipo: 'tarea' as const, color: color(t), vencida: isOverdue(t, hoy) })),
    ...dia.pasos.map(({ paso, tarea }) => ({ key: `p-${paso.id}`, tipo: 'paso' as const, color: color(tarea), vencida: false })),
  ];
  const extra = marcas.length - MAX_MARCAS;
  const vencidas = dia.vencen.filter((t) => isOverdue(t, hoy)).length;
  const resumen = [
    `${dia.vencen.length} ${dia.vencen.length === 1 ? 'tarea' : 'tareas'}`,
    vencidas ? `${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}` : null,
    `${dia.pasos.length} ${dia.pasos.length === 1 ? 'paso' : 'pasos'}`,
    dia.habitos.pct != null ? `hábitos ${dia.habitos.pct}%` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={`${headerDate(dia.fecha)}${dia.esHoy ? ' (hoy)' : ''}: ${resumen}`}
      onClick={onClick}
      className={`flex min-h-16 flex-col gap-1 rounded-lg border p-1 text-left transition sm:min-h-20 ${
        activo ? 'border-accent bg-surface2' : 'border-transparent hover:bg-surface2'
      } ${dia.enMes ? '' : 'opacity-40'}`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${dia.esHoy ? 'bg-accent text-white' : ''}`}>
          {Number(dia.fecha.slice(8))}
        </span>
        {dia.habitos.pct != null && (
          <span aria-hidden className="size-3.5 rounded-full" style={{ background: `conic-gradient(var(--good) ${dia.habitos.pct}%, var(--line) 0)` }} />
        )}
      </div>
      <div className="flex flex-col gap-0.5" aria-hidden>
        {marcas.slice(0, MAX_MARCAS).map((m) =>
          m.tipo === 'tarea' ? (
            <span key={m.key} className="flex items-center gap-0.5">
              <Dot color={m.color} size={7} />
              {m.vencida && <span className="text-[10px] leading-none font-bold text-hot">!</span>}
            </span>
          ) : (
            <span key={m.key} className="h-1.5 rounded-full" style={{ background: `var(--c-${m.color})` }} />
          ),
        )}
        {extra > 0 && <span className="text-[10px] font-semibold text-faint">+{extra}</span>}
      </div>
    </button>
  );
}

function PanelDia({
  dia,
  hoy,
  onEditTask,
  onNewTask,
}: {
  dia: CalendarDay;
  hoy: string;
  onEditTask: (t: Task) => void;
  onNewTask: (fecha: string) => void;
}) {
  const fichas = (['manana', 'tarde', 'noche'] as const).flatMap((f) => dia.habitos.porFranja[f]);
  return (
    <aside className="card self-start" aria-label={`Detalle: ${headerDate(dia.fecha)}`}>
      <h3 className="m-0 mb-3 font-display text-base font-semibold">{headerDate(dia.fecha)}</h3>
      <button type="button" onClick={() => onNewTask(dia.fecha)} className="mb-3 rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted hover:text-text">
        ＋ Tarea este día
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
