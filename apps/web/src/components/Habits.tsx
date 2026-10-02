import { useState } from 'react';
import type { HabitSlot, TodayPayload } from '@sb/shared';
import { api } from '../lib/api';
import { useTodayMutation } from '../lib/useToday';

const TABS: { slot: HabitSlot; label: string }[] = [
  { slot: 'manana', label: '🌅 Mañana' },
  { slot: 'tarde', label: '☀️ Tarde' },
  { slot: 'noche', label: '🌙 Noche' },
];

export function Habits({ habits }: { habits: TodayPayload['habits'] }) {
  // La pestaña por defecto es la franja actual (la calcula el server)
  const [tab, setTab] = useState<HabitSlot>(habits.slotActual);
  const all = Object.values(habits.porFranja).flat();
  const done = all.filter((h) => h.done).length;

  const toggle = useTodayMutation(
    (id: string) => api.toggleHabit(id),
    (data, id) => {
      const porFranja = Object.fromEntries(
        Object.entries(data.habits.porFranja).map(([k, list]) => [k, list.map((h) => (h.id === id ? { ...h, done: !h.done } : h))]),
      ) as TodayPayload['habits']['porFranja'];
      const flat = Object.values(porFranja).flat();
      const pctDia = flat.length ? Math.round((flat.filter((h) => h.done).length / flat.length) * 100) : 0;
      return { ...data, habits: { ...data.habits, porFranja, pctDia } };
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
            {all.length === 0
              ? 'Aún no tienes hábitos'
              : `${done} de ${all.length} hechos${habits.pctDia === 100 ? ' — día completo 🎉' : ''}`}
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
        {habits.porFranja[tab].map((h) => (
          <button
            key={h.id}
            aria-pressed={h.done}
            onClick={() => toggle.mutate(h.id)}
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface2 py-2 pr-[13px] pl-2.5 text-[13px] font-medium transition aria-pressed:border-good aria-pressed:bg-good-ink aria-pressed:text-good"
          >
            <span className="grid size-[18px] place-items-center rounded-md border-[1.5px] border-faint text-xs text-transparent transition group-aria-pressed:border-good group-aria-pressed:bg-good group-aria-pressed:text-white">
              ✓
            </span>
            {h.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}
