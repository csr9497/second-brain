# Navegación y Calendario — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir las pestañas Hoy · Calendario y una vista mensual con tareas, pasos y hábitos por día, más un panel de detalle de solo lectura para hábitos.

**Architecture:**
- **Dominio:** lógica pura en `packages/shared/src/domain/calendar.ts`, que reutiliza `fichasDelDia` (extraída de `buildToday`).
- **API:** `api.calendar(mes)` carga solo la rejilla del mes.
- **UI:** `CalendarView` en la web, con navegación por hash.

**Tech Stack:** Zod/vitest, React 19, TanStack Query y Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-06-calendario-design.md`

**Commits:** van en la rama `feat/entregable-2`. Cada mensaje termina con una línea en blanco y `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Dominio del calendario (`packages/shared`)

**Files:**
- Modificar `packages/shared/src/index.ts` y `packages/shared/src/domain/dashboard.ts`.
- Modificar `packages/shared/src/domain/dashboard.test.ts`: el helper `task` necesita `projectColor: null`.
- Crear `packages/shared/src/domain/calendar.ts` y `packages/shared/src/domain/calendar.test.ts`.

- [ ] **Step 1: tests (fallarán).** Crea `calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { HabitSlot, Task } from '../index';
import { buildCalendar, calendarGrid, mesDe, sumarMeses } from './calendar';
import type { HabitRow } from './dashboard';

const task = (id: string, o: Partial<Task> = {}): Task => ({
  id,
  projectId: null,
  projectName: null,
  projectColor: null,
  title: id,
  description: null,
  type: null,
  priority: 'media',
  status: 'por_hacer',
  startDate: null,
  deadline: null,
  position: 1000,
  notes: null,
  completedAt: null,
  steps: [],
  ...o,
});
const step = (id: string, startDate: string, duracionDias: number) => ({ id, taskId: 't', title: id, done: false, position: 1, startDate, duracionDias });
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).toISOString();
const habit = (id: string, turnos: HabitSlot[][], desde = at(2026, 10, 1)): HabitRow => ({
  id,
  nombre: id,
  position: 1,
  periods: [{ desde, hasta: null, turnos }],
});

describe('meses', () => {
  it('mesDe y sumarMeses (cruza años)', () => {
    expect(mesDe('2026-10-06')).toBe('2026-10');
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
  });
  it('rejilla de octubre 2026: lun 28 sep → dom 1 nov', () => expect(calendarGrid('2026-10')).toEqual({ start: '2026-09-28', end: '2026-11-01' }));
});

describe('buildCalendar', () => {
  const c = buildCalendar({
    mes: '2026-10',
    hoy: '2026-10-06',
    tasks: [task('vence', { deadline: '2026-10-06' }), task('larga', { steps: [step('p1', '2026-09-30', 3)] })],
    habits: [habit('a', [['manana'], ['noche']])],
    doneLogs: [{ habitId: 'a', fecha: '2026-10-05', slot: 'manana' }],
  });
  const dia = (f: string) => c.semanas.flat().find((d) => d.fecha === f)!;

  it('5 semanas de 7 días con relleno de otros meses', () => {
    expect(c.semanas).toHaveLength(5);
    expect(c.semanas.every((s) => s.length === 7)).toBe(true);
    expect(dia('2026-09-28').enMes).toBe(false);
    expect(dia('2026-10-06').esHoy).toBe(true);
  });
  it('tareas por deadline', () => expect(dia('2026-10-06').vencen.map((t) => t.id)).toEqual(['vence']));
  it('un paso que cruza de mes cubre cada día de su rango', () => {
    expect(dia('2026-09-30').pasos.map((p) => p.paso.id)).toEqual(['p1']);
    expect(dia('2026-10-02').pasos.map((p) => p.tarea.id)).toEqual(['larga']);
    expect(dia('2026-10-03').pasos).toHaveLength(0);
  });
  it('% por turnos en un día pasado; null en el futuro y en días sin hábitos', () => {
    expect(dia('2026-10-05').habitos.pct).toBe(50);
    expect(dia('2026-10-07').habitos.pct).toBeNull();
    expect(dia('2026-10-07').habitos.porFranja.noche.map((h) => h.id)).toEqual(['a']);
    expect(dia('2026-09-28').habitos.pct).toBeNull();
  });
});
```

- [ ] **Step 2: ver el fallo.** Run: `pnpm --filter @sb/shared exec vitest run src/domain/calendar.test.ts`. Expected: FAIL.

- [ ] **Step 3: implementar.**

En `index.ts`, la `interface Task` gana `projectColor: PaletteColor | null;` después de `projectName`. Añade también `export * from './domain/calendar';` junto a los demás.

En `dashboard.ts`, extrae de `buildToday` el bloque de fichas a esta función exportada:

```ts
/** Fichas por franja de un día y su conteo de turnos (la misma regla en Hoy y en el calendario). */
export function fichasDelDia(habits: HabitRow[], doneLogs: DashboardInput['doneLogs'], fecha: string) {
  const delDia = doneLogs.filter((l) => l.fecha === fecha);
  const porFranja: Record<HabitSlot, HabitChip[]> = { manana: [], tarde: [], noche: [] };
  let turnos = 0;
  let hechos = 0;
  for (const { habit, turnos: lista } of turnosEn(habits, fecha)) {
    for (const turno of lista) {
      turnos++;
      const doneIn = turno.find((f) => delDia.some((l) => l.habitId === habit.id && l.slot === f)) ?? null;
      if (doneIn) hechos++;
      for (const slot of turno) {
        porFranja[slot].push({ id: habit.id, nombre: habit.nombre, position: habit.position, slot, turno, done: doneIn != null, doneIn });
      }
    }
  }
  return { porFranja, turnos, hechos };
}
```

`buildToday` pasa a usar `const { porFranja, turnos, hechos } = fichasDelDia(habits, doneLogs, today);` y `pctDia: pct(hechos, turnos)`.

En `dashboard.test.ts`, el helper `task` añade `projectColor: null`.

Crea `domain/calendar.ts`:

```ts
// Calendario mensual: rejilla lunes→domingo con tareas, pasos y hábitos de cada día.
import type { HabitChip, HabitSlot, Step, Task } from '../index';
import { fichasDelDia, type DashboardInput, type HabitRow } from './dashboard';
import { addDays, weekday } from './dates';
import { pct } from './metrics';
import { finPaso } from './pasos';

export interface CalendarDay {
  fecha: string;
  enMes: boolean;
  esHoy: boolean;
  esFuturo: boolean;
  /** Tareas con deadline ese día, por position */
  vencen: Task[];
  /** Pasos programados que cubren ese día */
  pasos: { paso: Step; tarea: Task }[];
  /** Fichas de hábitos del día; pct null en días futuros o sin turnos */
  habitos: { porFranja: Record<HabitSlot, HabitChip[]>; turnos: number; hechos: number; pct: number | null };
}

export interface CalendarMonth {
  mes: string;
  semanas: CalendarDay[][];
}

/** 'YYYY-MM' de una fecha ISO. */
export const mesDe = (iso: string) => iso.slice(0, 7);

/** Suma n meses a 'YYYY-MM' (cruza años). */
export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Rejilla del mes: del lunes en o antes del día 1 al domingo en o después del último día. */
export function calendarGrid(mes: string): { start: string; end: string } {
  const primero = `${mes}-01`;
  const ultimo = addDays(`${sumarMeses(mes, 1)}-01`, -1);
  return { start: addDays(primero, -((weekday(primero) + 6) % 7)), end: addDays(ultimo, (7 - weekday(ultimo)) % 7) };
}

export function buildCalendar({
  mes,
  hoy,
  tasks,
  habits,
  doneLogs,
}: {
  mes: string;
  hoy: string;
  tasks: Task[];
  habits: HabitRow[];
  doneLogs: DashboardInput['doneLogs'];
}): CalendarMonth {
  const { start, end } = calendarGrid(mes);
  const dias: CalendarDay[] = [];
  for (let fecha = start; fecha <= end; fecha = addDays(fecha, 1)) {
    const { porFranja, turnos, hechos } = fichasDelDia(habits, doneLogs, fecha);
    const esFuturo = fecha > hoy;
    dias.push({
      fecha,
      enMes: mesDe(fecha) === mes,
      esHoy: fecha === hoy,
      esFuturo,
      vencen: tasks.filter((t) => t.deadline === fecha).sort((a, b) => a.position - b.position),
      pasos: tasks.flatMap((tarea) =>
        tarea.steps
          .filter((s) => s.startDate != null && s.startDate <= fecha && fecha <= (finPaso(s) ?? ''))
          .map((paso) => ({ paso, tarea })),
      ),
      habitos: { porFranja, turnos, hechos, pct: esFuturo || turnos === 0 ? null : pct(hechos, turnos) },
    });
  }
  const semanas: CalendarDay[][] = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return { mes, semanas };
}
```

- [ ] **Step 4: comprobar.** Run: `pnpm --filter @sb/shared test && pnpm --filter @sb/shared typecheck`. Expected: PASS, y los tests de `buildToday` sin cambios. La web fallará en `toTask` por `projectColor`; se arregla en la Task 2.

- [ ] **Step 5: Commit.** Commit con el mensaje `shared: calendario mensual y fichas de hábitos por día`.

---

### Task 2: API del calendario

**Files:**
- Modificar `apps/web/src/lib/api.ts`.
- Modificar `apps/web/src/components/TaskModal.tsx`, `ProjectModal.tsx` y `apps/web/src/lib/useHabits.ts` (invalidación).

- [ ] **Step 1: implementar.**

**Color del proyecto en las tareas**
- En `toTask`, añade `projectColor: r.project?.color ?? null,` después de `projectName`.
- Sustituye **todas** las apariciones de `project:projects(nombre)` por `project:projects(nombre, color)`.

**Mapeo de hábitos.** Extrae el mapeo de `loadDashboard` a un helper del módulo y úsalo allí:

```ts
const toHabitRow = (h: Row): HabitRow => ({
  id: h.id,
  nombre: h.nombre,
  position: Number(h.position),
  periods: (h.periods ?? [])
    .map((p: Row) => ({ desde: p.desde, hasta: p.hasta, turnos: p.turnos as HabitSlot[][] }))
    .sort((a: { desde: string }, b: { desde: string }) => Date.parse(a.desde) - Date.parse(b.desde)),
});
```

Si el orden actual está escrito de otra manera, conserva la semántica: periodos ascendentes por `desde`.

**Constante de la consulta de tareas.** Define `const TASK_SELECT = '*, project:projects(nombre, color), steps(*)';` y úsala en `loadDashboard`, en `getTask` y en `calendar`. Añade a los imports de `@sb/shared`: `buildCalendar`, `calendarGrid`, `type CalendarMonth` y `type HabitRow`.

**Nuevo método en `api`:**

```ts
  /** Mes del calendario: tareas que vencen o tienen pasos en la rejilla, hábitos y sus registros. */
  calendar: async (mes: string): Promise<CalendarMonth> => {
    const { start, end } = calendarGrid(mes);
    const [porDeadline, pasos, habits, logs] = await Promise.all([
      fetchAll<Row>((a, b) => sb.from('tasks').select(TASK_SELECT).gte('deadline', start).lte('deadline', end).order('position').order('id').range(a, b)),
      // pasos que empiezan hasta 1 año antes de la rejilla pueden cruzarla
      fetchAll<Row>((a, b) =>
        sb.from('steps').select('task_id').gte('start_date', addDays(start, -366)).lte('start_date', end).order('id').range(a, b),
      ),
      sb.from('habits').select('id, nombre, position, periods:habit_periods(desde, hasta, turnos)').order('position'),
      fetchAll<Row>((a, b) =>
        sb.from('habit_logs').select('habit_id, fecha, slot').eq('done', true).gte('fecha', start).lte('fecha', end).order('fecha').order('id').range(a, b),
      ),
    ]);
    const vistas = new Set(porDeadline.map((t) => t.id));
    const faltan = [...new Set(pasos.map((p) => p.task_id as string))].filter((id) => !vistas.has(id));
    const extra = faltan.length ? must(await sb.from('tasks').select(TASK_SELECT).in('id', faltan)) : [];
    return buildCalendar({
      mes,
      hoy: todayISO(),
      tasks: [...porDeadline, ...extra].map(toTask),
      habits: must(habits).map(toHabitRow),
      doneLogs: logs.map((l) => ({ habitId: l.habit_id, fecha: l.fecha, slot: l.slot as HabitSlot })),
    });
  },
```

**Invalidación de `['calendar']`**
- En la función `refresh` de `TaskModal.tsx` y de `ProjectModal.tsx`, añade `qc.invalidateQueries({ queryKey: ['calendar'] });`.
- En `useInvalidateHabits` (`useHabits.ts`), añade la misma línea.

- [ ] **Step 2: comprobar.** Run: `pnpm typecheck && pnpm test`. Expected: PASS.

- [ ] **Step 3: Commit.** Commit con el mensaje `web: API del calendario y color de proyecto en las tareas`.

---

### Task 3: Navegación + `CalendarView`

**Files:**
- Crear `apps/web/src/lib/useVista.ts` y `apps/web/src/components/CalendarView.tsx`.
- Modificar `apps/web/src/App.tsx` y `apps/web/src/lib/format.ts`.

- [ ] **Step 1: `useVista.ts`**

```ts
import { useEffect, useState } from 'react';

// Vistas por hash (#/ y #/calendario): recargar conserva la vista y sirve igual en GitHub Pages.
export type Vista = 'hoy' | 'calendario';
const HASH: Record<Vista, string> = { hoy: '#/', calendario: '#/calendario' };
const desdeHash = (h: string): Vista => (h === HASH.calendario ? 'calendario' : 'hoy');

export function useVista() {
  const [vista, setVista] = useState<Vista>(() => desdeHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setVista(desdeHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return vista;
}

export const hrefVista = (v: Vista) => HASH[v];
```

- [ ] **Step 2: `format.ts`.** Añade:

```ts
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-10' → "octubre 2026" */
export function mesLabel(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_LARGO[m - 1]} ${y}`;
}
```

- [ ] **Step 3: `CalendarView.tsx`**

```tsx
import { Children, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
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
export function CalendarView({ onEditTask }: { onEditTask: (t: Task) => void }) {
  const hoy = todayISO();
  const [mes, setMes] = useState(mesDe(hoy));
  const [sel, setSel] = useState(hoy);
  const { data, isLoading, error } = useQuery({ queryKey: ['calendar', mes], queryFn: () => api.calendar(mes) });
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
          {dia && <PanelDia dia={dia} hoy={hoy} onEditTask={onEditTask} />}
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
  const resumen = [
    `${dia.vencen.length} ${dia.vencen.length === 1 ? 'tarea' : 'tareas'}`,
    `${dia.pasos.length} ${dia.pasos.length === 1 ? 'paso' : 'pasos'}`,
    dia.habitos.pct != null ? `hábitos ${dia.habitos.pct}%` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={`${headerDate(dia.fecha)}: ${resumen}`}
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

function PanelDia({ dia, hoy, onEditTask }: { dia: CalendarDay; hoy: string; onEditTask: (t: Task) => void }) {
  const fichas = (['manana', 'tarde', 'noche'] as const).flatMap((f) => dia.habitos.porFranja[f]);
  return (
    <aside className="card self-start" aria-label={`Detalle: ${headerDate(dia.fecha)}`}>
      <h3 className="m-0 mb-3 font-display text-base font-semibold">{headerDate(dia.fecha)}</h3>
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
```

- [ ] **Step 4: `App.tsx`**
- Importa `useVista`, `hrefVista` y `type Vista` de `./lib/useVista`, y `CalendarView` de `./components/CalendarView`.
- En `Home`, añade `const vista = useVista();`.
- Al contenedor raíz de `Home`, cambia `max-w-[780px]` por `${vista === 'calendario' ? 'max-w-[1040px]' : 'max-w-[780px]'}`: el calendario necesita más ancho.
- Justo después de `</header>`, añade la navegación:

```tsx
      <nav className="mt-5 flex gap-1.5" aria-label="Vistas">
        {(
          [
            ['hoy', '☀️ Hoy'],
            ['calendario', '📅 Calendario'],
          ] as [Vista, string][]
        ).map(([v, label]) => (
          <a
            key={v}
            href={hrefVista(v)}
            aria-current={vista === v ? 'page' : undefined}
            className="rounded-full border border-line px-3.5 py-1.5 text-[13px] font-semibold text-muted no-underline transition hover:text-text aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-white"
          >
            {label}
          </a>
        ))}
      </nav>
```

- Envuelve la sección de acciones rápidas, los mensajes de carga y error y el bloque `{data && (…)}` en `{vista === 'hoy' && (<>…</>)}`. A continuación añade `{vista === 'calendario' && <CalendarView onEditTask={(task) => setModal({ kind: 'tarea', task })} />}`.
- El encabezado sigue usando `data` (de `['today']`) para la fecha. Eso no cambia, porque `useToday` se sigue llamando en las dos vistas.

- [ ] **Step 5: comprobar.** Run: `pnpm typecheck && pnpm test && pnpm build`. Expected: PASS.

- [ ] **Step 6: Commit.** Commit con el mensaje `web: pestañas Hoy · Calendario y vista mensual con panel del día`.

---

### Task 4 (controlador): docs, dev y verificación

- [ ] **`CLAUDE.md`:** cambia la descripción de `apps/web` ("sin router") por "navegación por hash (`useVista`): `#/` Hoy y `#/calendario`". Menciona la query `['calendar', mes]` y que el calendario es de solo lectura para hábitos.
- [ ] **Chrome (local):**
  1. Cambia de pestaña y recarga en `#/calendario`.
  2. Comprueba `‹`, `›` y "Hoy".
  3. Comprueba los puntos y las barras de una tarea con pasos programados, y el anillo.
  4. Abre un día y edita una tarea desde el panel: debe refrescarse el calendario.
  5. Revisa un día futuro ("programado"), el ancho de 375 px, los dos temas y que no haya errores en consola.
