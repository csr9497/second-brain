import { useState } from 'react';
import type { HabitChip, HabitSemanal, HabitSlot, TodayPayload } from '@sb/shared';
import { api } from '../lib/api';
import { useTodayMutation } from '../lib/useToday';

const TABS: { slot: HabitSlot; label: string }[] = [
  { slot: 'manana', label: '🌅 Mañana' },
  { slot: 'tarde', label: '☀️ Tarde' },
  { slot: 'noche', label: '🌙 Noche' },
];

type PorFranja = TodayPayload['habits']['porFranja'];

const TODAS: HabitSlot[] = ['manana', 'tarde', 'noche'];

const POR: Record<HabitSlot, string> = { manana: 'la mañana', tarde: 'la tarde', noche: 'la noche' };

/** Turnos únicos de Hoy: un turno con alternativas aparece en varias pestañas pero cuenta una vez. */
function contarTurnos(porFranja: PorFranja) {
  const turnos = new Map<string, boolean>();
  for (const c of Object.values(porFranja).flat()) turnos.set(`${c.id}|${c.turno.join('|')}`, c.done);
  const total = turnos.size;
  const hechos = [...turnos.values()].filter(Boolean).length;
  return { total, hechos, pct: total ? Math.round((hechos / total) * 100) : 0 };
}

/** Círculo de 48 px: pendiente = contorno con la inicial; hecho = relleno con ✓. Los semanales llevan un anillo de progreso. */
function Burbuja({ nombre, done, marca, progreso }: { nombre: string; done: boolean; marca?: boolean; progreso?: { hechas: number; meta: number } }) {
  const R = 27;
  const L = 2 * Math.PI * R;
  const frac = progreso ? Math.min(1, progreso.hechas / Math.max(1, progreso.meta)) : 0;
  return (
    <span className="relative grid size-12 flex-none place-items-center">
      {progreso && (
        <svg aria-hidden viewBox="0 0 60 60" className="pointer-events-none absolute -inset-1.5 size-[60px] -rotate-90">
          <circle cx="30" cy="30" r={R} fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle cx="30" cy="30" r={R} fill="none" stroke="var(--good)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${L * frac} ${L}`} />
        </svg>
      )}
      <span
        className={`grid size-12 place-items-center rounded-full transition ${done ? 'bg-good text-good-ink' : 'border-2 border-line bg-transparent text-faint'}`}
      >
        {done ? (
          <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <span aria-hidden className="font-display text-lg font-semibold uppercase">
            {nombre.charAt(0)}
          </span>
        )}
      </span>
      {marca && <i aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-surface" />}
    </span>
  );
}

export function Habits({ habits }: { habits: TodayPayload['habits'] }) {
  // La pestaña por defecto es la franja actual (la calcula el server)
  const [tab, setTab] = useState<HabitSlot>(habits.slotActual);
  const { total, hechos } = contarTurnos(habits.porFranja);

  const toggle = useTodayMutation(
    (c: HabitChip) => api.toggleHabit({ id: c.id, slot: c.slot, turno: c.turno, done: c.done }),
    (data, c) => {
      // marca o desmarca todas las fichas del mismo turno (en cualquiera de sus franjas)
      const flip = (x: HabitChip) => (x.id === c.id && x.turno.includes(c.slot) ? { ...x, done: !c.done, doneIn: c.done ? null : c.slot } : x);
      const porFranja = Object.fromEntries(Object.entries(data.habits.porFranja).map(([k, list]) => [k, list.map(flip)])) as PorFranja;
      return { ...data, habits: { ...data.habits, porFranja, pctDia: contarTurnos(porFranja).pct } };
    },
  );

  // Semanal: se marca hoy en la franja actual; desmarcar borra el registro de hoy en cualquier franja
  const toggleSemanal = useTodayMutation(
    (h: HabitSemanal) => api.toggleHabit({ id: h.id, slot: habits.slotActual, turno: TODAS, done: h.hoy }),
    (data, h) => ({
      ...data,
      habits: {
        ...data.habits,
        semanales: data.habits.semanales.map((x) => (x.id === h.id ? { ...x, hoy: !h.hoy, hechas: x.hechas + (h.hoy ? -1 : 1) } : x)),
      },
    }),
  );

  return (
    <div className="card">
      <div className="mb-3.5 flex items-center gap-3.5">
        <div
          className="grid size-[54px] flex-none place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--good) ${habits.pctDia}%, var(--surface2) 0)` }}
          aria-label={`${habits.pctDia}% del día`}
        >
          <i className="grid size-[42px] place-items-center rounded-full bg-surface font-display text-[13px] font-bold not-italic">{habits.pctDia}%</i>
        </div>
        <div>
          <b className="font-display text-[15px]">Progreso del día</b>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted">
            {total === 0
              ? habits.semanales.length
                ? 'Sin hábitos diarios'
                : 'Aún no tienes hábitos'
              : `${hechos} de ${total} hechos${habits.pctDia === 100 ? ' — día completo 🎉' : ''}`}
          </p>
        </div>
        <div className="ml-auto flex-none rounded-xl bg-hot/15 px-3 py-1.5 text-center">
          <b className="block font-display text-lg leading-none text-hot">🔥 {habits.streak}</b>
          <span className="text-[10.5px] text-muted">días seguidos</span>
        </div>
      </div>

      <div className="mb-3 flex gap-1.5 rounded-[10px] bg-surface2 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.slot}
            role="tab"
            aria-selected={tab === t.slot}
            onClick={() => setTab(t.slot)}
            className="flex-1 rounded-[7px] p-[7px] text-[13px] font-semibold text-muted transition aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-sm"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {habits.porFranja[tab].length === 0 && <p className="m-0 text-[13px] text-faint">Sin hábitos en esta franja.</p>}
        {habits.porFranja[tab].map((c) => {
          const otraFranja = c.done && c.doneIn && c.doneIn !== c.slot ? c.doneIn : null;
          return (
            <button
              key={`${c.id}-${c.slot}`}
              aria-pressed={c.done}
              aria-disabled={toggle.isPending}
              aria-label={`${c.nombre}, ${c.done ? 'hecho' : 'pendiente'}${otraFranja ? `, hecho por ${POR[otraFranja]}` : ''}`}
              onClick={() => {
                if (!toggle.isPending) toggle.mutate(c);
              }}
              className="flex w-16 flex-none flex-col items-center gap-1 text-center"
            >
              <Burbuja nombre={c.nombre} done={c.done} marca={!!otraFranja} />
              <span className="w-full truncate text-xs font-medium" aria-hidden>
                {c.nombre}
              </span>
            </button>
          );
        })}
      </div>

      {habits.semanales.length > 0 && (
        <section aria-label="Hábitos de la semana" className="mt-4 border-t border-line pt-3">
          <h4 className="m-0 mb-2 text-xs font-semibold tracking-wide text-faint uppercase">📅 Esta semana</h4>
          <div className="flex flex-wrap gap-3">
            {habits.semanales.map((h) => (
              <button
                key={h.id}
                aria-pressed={h.hoy}
                aria-disabled={toggleSemanal.isPending}
                aria-label={`${h.nombre}: ${h.hechas} de ${h.meta} esta semana${h.hoy ? ', hecho hoy' : ''}`}
                onClick={() => {
                  if (!toggleSemanal.isPending) toggleSemanal.mutate(h);
                }}
                className="flex w-16 flex-none flex-col items-center gap-1 text-center"
              >
                <Burbuja nombre={h.nombre} done={h.hoy} progreso={{ hechas: h.hechas, meta: h.meta }} />
                <span className="w-full truncate text-xs font-medium" aria-hidden>
                  {h.nombre}
                </span>
                <span aria-hidden className={`-mt-0.5 text-[11px] tabular-nums ${h.hechas >= h.meta ? 'text-good' : 'text-faint'}`}>
                  {h.hechas}/{h.meta}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
