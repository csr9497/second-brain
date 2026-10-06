import { useState } from 'react';
import type { HabitChip, HabitSlot, TodayPayload } from '@sb/shared';
import { api } from '../lib/api';
import { useTodayMutation } from '../lib/useToday';

const TABS: { slot: HabitSlot; label: string }[] = [
  { slot: 'manana', label: '🌅 Mañana' },
  { slot: 'tarde', label: '☀️ Tarde' },
  { slot: 'noche', label: '🌙 Noche' },
];

type PorFranja = TodayPayload['habits']['porFranja'];

const POR: Record<HabitSlot, string> = { manana: 'la mañana', tarde: 'la tarde', noche: 'la noche' };

/** Cuenta turnos (un hábito = un turno, aunque tenga fichas en varias franjas). */
function contarTurnos(porFranja: PorFranja) {
  const turnos = new Map<string, boolean>();
  for (const c of Object.values(porFranja).flat()) turnos.set(c.id, (turnos.get(c.id) ?? false) || c.done);
  const total = turnos.size;
  const hechos = [...turnos.values()].filter(Boolean).length;
  return { total, hechos, pct: total ? Math.round((hechos / total) * 100) : 0 };
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
              ? 'Aún no tienes hábitos'
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

      <div className="flex flex-wrap gap-2">
        {habits.porFranja[tab].length === 0 && <p className="m-0 text-[13px] text-faint">Sin hábitos en esta franja.</p>}
        {habits.porFranja[tab].map((c) => (
          <button
            key={`${c.id}-${c.slot}`}
            aria-pressed={c.done}
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(c)}
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface2 py-2 pr-[13px] pl-2.5 text-[13px] font-medium transition aria-pressed:border-good aria-pressed:bg-good-ink aria-pressed:text-good"
          >
            <span className="grid size-[18px] place-items-center rounded-md border-[1.5px] border-faint text-xs text-transparent transition group-aria-pressed:border-good group-aria-pressed:bg-good group-aria-pressed:text-white">
              ✓
            </span>
            {c.nombre}
            {c.done && c.doneIn && c.doneIn !== c.slot && (
              <small className="text-[11px] font-normal opacity-80">· hecho por {POR[c.doneIn]}</small>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
