# CRUD de hábitos y racha por vigencia — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear, editar, archivar, reactivar y eliminar hábitos desde la app, y que la racha y los % cuenten cada día solo los hábitos vigentes ese día.

**Architecture:**
- `habits` gana `created_at` y `archived_at`, y `active` pasa a ser una columna generada.
- La lógica pura de `packages/shared` decide qué hábitos están vigentes en cada fecha (`habitsOn`) y la usa en la racha, en el % del día y en el % semanal.
- La web añade la capa de datos en `api.ts` y dos modales, `HabitsManager` y `HabitModal`, coordinados desde el `ModalState` de `App`.

**Tech Stack:** Supabase/Postgres (migración + pgTAP), Zod 4 + vitest, React 19 + TanStack Query + Tailwind v4, y el `Select` y el `Dot` de la pieza 1.

**Spec:** `docs/superpowers/specs/2026-10-06-habitos-crud-design.md`

**Commits:** van en la rama `feat/entregable-2`, y cada mensaje termina con una línea en blanco seguida de `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Preparación:** Supabase local arriba (`supabase status`; si falla, abre Docker y ejecuta `pnpm db:start`).

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/<ts>_habits_vigencia.sql` | crear | `created_at`, `archived_at`, relleno y `active` generada |
| `supabase/tests/database/rls_and_triggers.test.sql` | modificar | 3 asserts de hábitos |
| `supabase/seed.sql` | modificar | Hábitos demo creados hace 10 días |
| `packages/shared/src/index.ts` | modificar | `updateHabitInput` sin `active`, tipos `CreateHabitInput`/`UpdateHabitInput`/`HabitAdmin` |
| `packages/shared/src/schemas.test.ts` | modificar | Tests de esquemas de hábitos |
| `packages/shared/src/domain/metrics.ts` | modificar | `computeStreak` con `totalOn` |
| `packages/shared/src/domain/domain.test.ts` | modificar | Tests de racha adaptados y nuevo |
| `packages/shared/src/domain/dashboard.ts` | modificar | `HabitRow` con vigencia, `habitsOn`, `doneByDate`, `buildToday`, `buildWeeklyReport` |
| `packages/shared/src/domain/dashboard.test.ts` | modificar | Fixture con vigencia + tests nuevos |
| `apps/web/src/lib/api.ts` | modificar | Carga de hábitos con vigencia + CRUD |
| `apps/web/src/lib/useHabits.ts` | crear | Query `['habits']` y su invalidación |
| `apps/web/src/components/HabitModal.tsx` | crear | Crear/editar un hábito |
| `apps/web/src/components/HabitsManager.tsx` | crear | Lista, archivar, reactivar y eliminar |
| `apps/web/src/App.tsx` | modificar | Botón "Gestionar" y los 2 modales |
| `CLAUDE.md`, `docs/DATA-MODEL.md` | modificar | Regla de racha y columnas nuevas |

---

### Task 1: Migración `habits_vigencia` + pgTAP + seed

**Files:**
- Create: `supabase/migrations/<timestamp>_habits_vigencia.sql` (lo genera la CLI)
- Modify: `supabase/tests/database/rls_and_triggers.test.sql`
- Modify: `supabase/seed.sql:28-31`

- [ ] **Step 1: Tests pgTAP (fallarán)**

En `rls_and_triggers.test.sql`, cambia `select plan(15);` por `select plan(18);`. Justo antes de la línea `-- ---------- Como B ----------`, añade:

```sql
-- Hábitos: active se deriva de archived_at
insert into public.habits (id, nombre) values ('aaaaaaaa-0000-4000-8000-000000000005', 'Hábito A');
select ok((select active and created_at is not null from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000005'),
  'un hábito nuevo nace activo y con created_at');
update public.habits set archived_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000005';
select is((select active from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000005'), false,
  'con archived_at el hábito queda inactivo');
select throws_ok(
  $$ update public.habits set active = true where id = 'aaaaaaaa-0000-4000-8000-000000000005' $$,
  '428C9', null, 'active no se escribe a mano (columna generada)');
```

- [ ] **Step 2: Comprobar que fallan**

Run: `supabase test db`
Expected: FAIL. La columna `created_at` no existe y aparece `column "created_at" does not exist`.

- [ ] **Step 3: Migración**

Run: `supabase migration new habits_vigencia` y escribe en el archivo generado:

```sql
-- Vigencia de hábitos: la racha y los % cuentan, cada día, los hábitos que existían
-- ese día (creados y aún no archivados). `active` pasa a derivarse de archived_at.
alter table public.habits
  add column created_at  timestamptz not null default now(),
  add column archived_at timestamptz;

-- Relleno: los hábitos existentes "nacen" el día de su primer registro
update public.habits h
   set created_at = coalesce((select min(l.fecha)::timestamptz from public.habit_logs l where l.habit_id = h.id), h.created_at);
update public.habits set archived_at = now() where not active;

alter table public.habits drop column active;
alter table public.habits add column active boolean generated always as (archived_at is null) stored;
```

- [ ] **Step 4: Seed**

En `supabase/seed.sql`, sustituye el insert de hábitos por:

```sql
  -- Hábitos (2 por franja), creados hace 10 días + 5 días previos completos para que haya racha
  insert into public.habits (user_id, nombre, slot, position, created_at) values
    (uid, 'Ejercicio', 'manana', 1000, now() - interval '10 days'), (uid, 'Inglés', 'manana', 2000, now() - interval '10 days'),
    (uid, 'Estudiar', 'tarde', 3000, now() - interval '10 days'), (uid, 'Leer', 'tarde', 4000, now() - interval '10 days'),
    (uid, 'Revisar pendientes', 'noche', 5000, now() - interval '10 days'), (uid, 'Planear mañana', 'noche', 6000, now() - interval '10 days');
```

Sustituye también el comentario anterior (`-- Hábitos (2 por franja) + 5 días previos…`), que el bloque de arriba ya incluye. El insert de `habit_logs` queda igual.

- [ ] **Step 5: Recrear y pasar los tests**

Run: `pnpm db:reset && supabase test db`
Expected: `Result: PASS` con 18 tests.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "DB: vigencia de hábitos (created_at, archived_at, active generada)"
```

---

### Task 2: Esquemas y tipos de hábitos

**Files:**
- Modify: `packages/shared/src/index.ts` (bloque `habitFields`/`createHabitInput`/`updateHabitInput`, e `interface Habit`)
- Modify: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Tests que fallan**

En `schemas.test.ts`, cambia el import por:

```ts
import { createHabitInput, createProjectInput, updateHabitInput, updateProjectInput, updateTaskInput } from './index';
```

y añade al final:

```ts
describe('hábitos', () => {
  it('updateHabitInput ignora active (archivar tiene acción propia)', () =>
    expect(updateHabitInput.parse({ nombre: 'x', active: false })).toEqual({ nombre: 'x' }));
  it('updateHabitInput sin campos editables falla', () => expect(() => updateHabitInput.parse({ active: false })).toThrow());
  it('createHabitInput usa la mañana por defecto', () => expect(createHabitInput.parse({ nombre: 'x' })).toEqual({ nombre: 'x', slot: 'manana' }));
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm --filter @sb/shared exec vitest run src/schemas.test.ts`
Expected: FAIL. Los dos primeros tests fallan, porque hoy `active` se conserva.

- [ ] **Step 3: Implementar**

En `packages/shared/src/index.ts`, sustituye la definición de `updateHabitInput` por:

```ts
export const updateHabitInput = habitFields.partial().refine(nonEmpty, 'Nada que actualizar');
export type CreateHabitInput = z.input<typeof createHabitInput>;
export type UpdateHabitInput = z.input<typeof updateHabitInput>;
```

Después de `interface Habit { … }`, añade:

```ts
/** Hábito para el modal de gestión (incluye archivados). */
export interface HabitAdmin {
  id: string;
  nombre: string;
  slot: HabitSlot;
  position: number;
  archivedAt: string | null;
}
```

- [ ] **Step 4: Pasan**

Run: `pnpm --filter @sb/shared exec vitest run src/schemas.test.ts && pnpm typecheck`
Expected: PASS (9 tests) y typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/schemas.test.ts
git commit -m "shared: esquemas de hábitos sin active y tipo HabitAdmin"
```

---

### Task 3: `computeStreak` con total por día

**Files:**
- Modify: `packages/shared/src/domain/metrics.ts` (`computeStreak`)
- Modify: `packages/shared/src/domain/domain.test.ts` (`describe('computeStreak')`)
- Modify: `packages/shared/src/domain/dashboard.ts` (2 llamadas, solo para que compile)

- [ ] **Step 1: Adaptar los tests y añadir el nuevo**

En `domain.test.ts`, en `describe('computeStreak')`:
- Cambia el último argumento numérico de cada llamada: los `4` pasan a ser `() => 4` y el `0` del test "sin hábitos" pasa a ser `() => 0`.
- Añade este test:

```ts
  it('un día sin hábitos vigentes corta la racha', () => {
    const totalOn = (d: string) => (d >= '2026-09-25' ? 1 : 0); // el hábito existe desde el 25
    expect(computeStreak(logs({ '2026-09-25': 1, '2026-09-24': 1 }), today, totalOn)).toBe(1);
  });
```

- [ ] **Step 2: Comprobar que falla**

Run: `pnpm --filter @sb/shared exec vitest run src/domain/domain.test.ts -t computeStreak`
Expected: FAIL. `pct` recibe una función como total y da `NaN`.

- [ ] **Step 3: Implementar**

Sustituye `computeStreak` en `metrics.ts` por:

```ts
/**
 * Días consecutivos con % de hábitos ≥ umbral, contando hacia atrás.
 * Hoy suma si ya está completo; si no, no rompe la racha (el día no ha cerrado).
 * Un día sin hábitos vigentes corta la racha.
 * @param doneByDate nº de hábitos vigentes hechos por fecha
 * @param totalOn nº de hábitos vigentes en cada fecha
 */
export function computeStreak(
  doneByDate: Map<string, number>,
  today: string,
  totalOn: (fecha: string) => number,
  threshold = STREAK_THRESHOLD,
): number {
  const ok = (d: string) => {
    const total = totalOn(d);
    return total > 0 && pct(doneByDate.get(d) ?? 0, total) >= threshold;
  };
  let streak = ok(today) ? 1 : 0;
  for (let d = addDays(today, -1); ok(d); d = addDays(d, -1)) streak++;
  return streak;
}
```

En `dashboard.ts`, mientras llega la Task 4, cambia las dos llamadas `computeStreak(…, habits.length)` por `computeStreak(…, () => habits.length)`.

- [ ] **Step 4: Pasan**

Run: `pnpm test && pnpm typecheck`
Expected: todo PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain
git commit -m "shared: computeStreak recibe el total de hábitos de cada día"
```

---

### Task 4: Vigencia en `buildToday` y `buildWeeklyReport`

**Files:**
- Modify: `packages/shared/src/domain/dashboard.ts`
- Modify: `packages/shared/src/domain/dashboard.test.ts`

- [ ] **Step 1: Fixture y tests (fallarán)**

En `dashboard.test.ts`:

Añade `habitsOn` al import de `./dashboard`. Sustituye la constante `habits` por:

```ts
// Timestamps a las 10:00 locales del día indicado (mes 1-12)
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).toISOString();
const habit = (id: string, o: Partial<HabitRow> = {}): HabitRow => ({
  id,
  nombre: id,
  slot: 'manana',
  position: 1,
  createdAt: at(2026, 9, 1),
  archivedAt: null,
  ...o,
});
const habits: HabitRow[] = [habit('h1', { nombre: 'Ejercicio' }), habit('h2', { nombre: 'Leer', slot: 'tarde', position: 2 })];
```

Añade al final del archivo:

```ts
describe('vigencia de hábitos', () => {
  const logs = (pairs: [string, string][]) => pairs.map(([habitId, fecha]) => ({ habitId, fecha }));
  const base = { tasks: [], projects: [], now }; // jueves 2026-10-01

  it('habitsOn incluye el día de creación y excluye desde el de archivado', () => {
    const x = habit('x', { createdAt: at(2026, 9, 28), archivedAt: at(2026, 9, 30) });
    expect(habitsOn([x], '2026-09-27')).toEqual([]);
    expect(habitsOn([x], '2026-09-28')).toEqual([x]);
    expect(habitsOn([x], '2026-09-29')).toEqual([x]);
    expect(habitsOn([x], '2026-09-30')).toEqual([]);
  });

  it('crear hoy un hábito no rompe la racha', () => {
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('nuevo', { createdAt: at(2026, 10, 1) })],
      doneLogs: logs([['a', '2026-09-30'], ['a', '2026-09-29']]),
    });
    expect(t.habits.streak).toBe(2);
    expect(t.habits.pctDia).toBe(0);
  });

  it('archivar un hábito no reescribe los días pasados y lo saca de Hoy', () => {
    // ayer solo se hizo "a"; archivar hoy "b" no convierte ayer en un día completo
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('b', { archivedAt: at(2026, 10, 1) })],
      doneLogs: logs([['a', '2026-09-30']]),
    });
    expect(t.habits.streak).toBe(0);
    expect(Object.values(t.habits.porFranja).flat().map((h) => h.id)).toEqual(['a']);
  });

  it('un día sin hábitos vigentes corta la racha', () => {
    const t = buildToday({
      ...base,
      habits: [habit('a', { createdAt: at(2026, 9, 30) })],
      doneLogs: logs([['a', '2026-09-30'], ['a', '2026-09-29']]),
    });
    expect(t.habits.streak).toBe(1);
  });

  it('habitsPct semanal suma los hábitos vigentes de cada día', () => {
    // lun 28 – jue 1: "a" vigente 4 días; "nuevo" desde el miércoles 30 → 6 hábito-día, 3 hechos
    const r = buildWeeklyReport(
      {
        ...base,
        habits: [habit('a'), habit('nuevo', { createdAt: at(2026, 9, 30) })],
        doneLogs: logs([['a', '2026-09-28'], ['a', '2026-09-29'], ['nuevo', '2026-09-30']]),
      },
      false,
    );
    expect(r.habitsPct).toBe(50);
  });
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm --filter @sb/shared exec vitest run src/domain/dashboard.test.ts`
Expected: FAIL. `habitsOn` no existe y `HabitRow` no tiene `createdAt`.

- [ ] **Step 3: Implementar en `dashboard.ts`**

Cambia el import de `./dates` por:

```ts
import { addDays, slotForHour, toISO, todayISO, weekRange, weekday } from './dates';
```

Sustituye `interface HabitRow` por:

```ts
export interface HabitRow {
  id: string;
  nombre: string;
  slot: HabitSlot;
  position: number;
  /** ISO timestamp: cuenta desde su día local de creación */
  createdAt: string;
  /** ISO timestamp o null: deja de contar desde su día local de archivado */
  archivedAt: string | null;
}
```

En `DashboardInput`, cambia el comentario de `habits` a `/** Todos los hábitos (también archivados, para el historial), ordenados por position */`.

Sustituye `doneByDate` (y su comentario) por:

```ts
const vigente = (h: HabitRow, fecha: string) =>
  toISO(new Date(h.createdAt)) <= fecha && (h.archivedAt == null || toISO(new Date(h.archivedAt)) > fecha);

/** Hábitos vigentes en `fecha` (día local): creados hasta ese día y aún no archivados. */
export const habitsOn = (habits: HabitRow[], fecha: string) => habits.filter((h) => vigente(h, fecha));

/** Hábitos hechos por fecha, contando solo los vigentes ese día. */
export function doneByDate(habits: HabitRow[], doneLogs: DashboardInput['doneLogs']) {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const map = new Map<string, number>();
  for (const l of doneLogs) {
    const h = byId.get(l.habitId);
    if (h && vigente(h, l.fecha)) map.set(l.fecha, (map.get(l.fecha) ?? 0) + 1);
  }
  return map;
}
```

En `buildToday`, sustituye las líneas de `doneToday`/`habitList` por:

```ts
  const doneToday = new Set(doneLogs.filter((l) => l.fecha === today).map((l) => l.habitId));
  const habitList: Habit[] = habitsOn(habits, today).map((h) => ({
    id: h.id,
    nombre: h.nombre,
    slot: h.slot,
    position: h.position,
    done: doneToday.has(h.id),
  }));
```

y en el objeto `habits` del return:

```ts
      pctDia: pct(habitList.filter((h) => h.done).length, habitList.length),
      streak: computeStreak(doneByDate(habits, doneLogs), today, (d) => habitsOn(habits, d).length),
```

En `buildWeeklyReport`, sustituye desde `const days = …` hasta el bucle `for (const [fecha, n] of byDate) …` (incluido) por:

```ts
  const byDate = doneByDate(habits, doneLogs);
  const totalOn = (d: string) => habitsOn(habits, d).length;
  let habitsDone = 0;
  let habitsTotal = 0;
  for (let d = start; d <= lastDay; d = addDays(d, 1)) {
    habitsDone += byDate.get(d) ?? 0;
    habitsTotal += totalOn(d);
  }
```

y en el return, `habitsPct: pct(habitsDone, habitsTotal),` y `streak: computeStreak(byDate, today, totalOn),`.

- [ ] **Step 4: Pasan**

Run: `pnpm test && pnpm --filter @sb/shared typecheck`
Expected: todo PASS. Los tests previos de `buildToday`/`buildWeeklyReport` (racha 2, % 63) siguen pasando sin cambios. `apps/web` puede fallar el typecheck en `api.ts` porque `HabitRow` exige campos nuevos: es lo esperado, y se arregla en la Task 5.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain
git commit -m "shared: racha y % de hábitos por vigencia de cada día"
```

---

### Task 5: API de hábitos

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/useHabits.ts`

- [ ] **Step 1: Imports y carga**

En `api.ts`, añade al import de `@sb/shared`: `createHabitInput`, `updateHabitInput`, `type CreateHabitInput`, `type HabitAdmin` y `type UpdateHabitInput`.

En `loadDashboard`, sustituye la consulta de hábitos por:

```ts
    sb.from('habits').select('id, nombre, slot, position, created_at, archived_at').order('position'),
```

y su mapeo en el return por:

```ts
    habits: must(habits).map((h) => ({
      id: h.id,
      nombre: h.nombre,
      slot: h.slot as HabitSlot,
      position: Number(h.position),
      createdAt: h.created_at,
      archivedAt: h.archived_at,
    })),
```

Cambia la firma de `maxPosition` a `async function maxPosition(table: 'tasks' | 'steps' | 'habits', taskId?: string)`.

- [ ] **Step 2: CRUD**

En el objeto `api`, sustituye el bloque `// Hábitos: un registro por (hábito, fecha)` por:

```ts
  // Hábitos: un registro por (hábito, fecha). Archivar conserva el historial.
  toggleHabit: async (id: string) => {
    const fecha = todayISO();
    const existing = must(await sb.from('habit_logs').select('done').eq('habit_id', id).eq('fecha', fecha).maybeSingle());
    must(await sb.from('habit_logs').upsert({ habit_id: id, fecha, done: !existing?.done }, { onConflict: 'habit_id,fecha' }));
  },
  habits: async (): Promise<HabitAdmin[]> =>
    must(await sb.from('habits').select('id, nombre, slot, position, archived_at').order('position')).map((h) => ({
      id: h.id,
      nombre: h.nombre,
      slot: h.slot as HabitSlot,
      position: Number(h.position),
      archivedAt: h.archived_at,
    })),
  createHabit: async (input: CreateHabitInput) => {
    const { nombre, slot } = createHabitInput.parse(input);
    const position = positionBetween(await maxPosition('habits'), null);
    must(await sb.from('habits').insert({ nombre, slot, position }));
  },
  updateHabit: async (id: string, patch: UpdateHabitInput) => {
    const { nombre, slot } = updateHabitInput.parse(patch);
    const cols = Object.fromEntries(Object.entries({ nombre, slot }).filter(([, v]) => v !== undefined));
    must(await sb.from('habits').update(cols).eq('id', id));
  },
  archiveHabit: async (id: string) => {
    must(await sb.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', id));
  },
  /** Cuenta como nuevo desde hoy: los días que pasó archivado no se vuelven incumplidos. */
  reactivateHabit: async (id: string) => {
    must(await sb.from('habits').update({ archived_at: null, created_at: new Date().toISOString() }).eq('id', id));
  },
  /** Borrado real: sus habit_logs se van en cascada. */
  deleteHabit: async (id: string) => {
    must(await sb.from('habits').delete().eq('id', id));
  },
```

- [ ] **Step 3: `useHabits.ts`**

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { TODAY_KEY } from './useToday';

export const HABITS_KEY = ['habits'] as const;

export const useHabits = () => useQuery({ queryKey: HABITS_KEY, queryFn: api.habits });

/** Refresca Hoy y la lista de gestión tras cualquier cambio en hábitos. */
export function useInvalidateHabits() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TODAY_KEY });
    qc.invalidateQueries({ queryKey: HABITS_KEY });
  };
}
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm test`
Expected: PASS en ambos paquetes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/useHabits.ts
git commit -m "web: API de hábitos (vigencia, crear, editar, archivar, reactivar, eliminar)"
```

---

### Task 6: `HabitModal`

**Files:**
- Create: `apps/web/src/components/HabitModal.tsx`

- [ ] **Step 1: Componente**

```tsx
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { slotForHour, type HabitAdmin, type HabitSlot } from '@sb/shared';
import { api } from '../lib/api';
import { SLOT_OPTIONS } from '../lib/options';
import { useInvalidateHabits } from '../lib/useHabits';
import { Field, Modal, ModalActions } from './Modal';
import { Select } from './ui/Select';
import { useToast } from './Toast';

/** Crea un hábito o, si recibe `habit`, lo edita (nombre y franja). */
export function HabitModal({ habit, onClose }: { habit?: HabitAdmin; onClose: () => void }) {
  const toast = useToast();
  const refresh = useInvalidateHabits();
  const editing = !!habit;
  const [nombre, setNombre] = useState(habit?.nombre ?? '');
  const [slot, setSlot] = useState<HabitSlot>(habit?.slot ?? slotForHour(new Date().getHours()));

  const save = useMutation({
    mutationFn: () => {
      const input = { nombre: nombre.trim(), slot };
      return editing ? api.updateHabit(habit.id, input) : api.createHabit(input);
    },
    onSuccess: () => {
      toast(editing ? '✅ Hábito actualizado' : '✅ Hábito creado');
      onClose();
    },
    onError: (err) => toast(`⚠ ${err.message}`),
    onSettled: refresh,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim()) save.mutate();
  }

  return (
    <Modal title={editing ? '✏️ Editar hábito' : '🌱 Nuevo hábito'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre">
          <input className="input" autoFocus required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="p. ej. Meditar 10 min" />
        </Field>
        <Field label="Franja">
          <Select value={slot} onChange={setSlot} options={SLOT_OPTIONS} />
        </Field>
        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !nombre.trim()}>
            {editing ? 'Guardar' : 'Crear hábito'}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. Si `habit.id` no se estrecha dentro del `mutationFn`, usa `habit!.id` con el comentario `// editing ⇒ habit definido`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/HabitModal.tsx
git commit -m "web: modal para crear y editar hábitos"
```

---

### Task 7: `HabitsManager` + conexión en `App`

**Files:**
- Create: `apps/web/src/components/HabitsManager.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: `HabitsManager.tsx`**

```tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SLOT_COLOR, type HabitAdmin } from '@sb/shared';
import { api } from '../lib/api';
import { SLOT_OPTIONS } from '../lib/options';
import { useHabits, useInvalidateHabits } from '../lib/useHabits';
import { ConfirmDelete, Modal, ModalActions } from './Modal';
import { Dot } from './ui/Dot';
import { useToast } from './Toast';

type Action = 'archive' | 'reactivate' | 'delete';
const DONE_MSG: Record<Action, string> = { archive: '📦 Hábito archivado', reactivate: '✅ Hábito reactivado', delete: '🗑 Hábito eliminado' };
const linkBtn = 'text-xs font-semibold text-muted hover:text-text disabled:opacity-50';

/** Lista de hábitos: editar y archivar los activos; reactivar o eliminar los archivados. */
export function HabitsManager({ onNew, onEdit, onClose }: { onNew: () => void; onEdit: (h: HabitAdmin) => void; onClose: () => void }) {
  const toast = useToast();
  const refresh = useInvalidateHabits();
  const { data: habits, isLoading, error } = useHabits();
  const [showArchived, setShowArchived] = useState(false);

  const run = useMutation({
    mutationFn: ({ action, id }: { action: Action; id: string }) =>
      action === 'archive' ? api.archiveHabit(id) : action === 'reactivate' ? api.reactivateHabit(id) : api.deleteHabit(id),
    onSuccess: (_r, { action }) => toast(DONE_MSG[action]),
    onError: (err) => toast(`⚠ ${err.message}`),
    onSettled: refresh,
  });

  const active = (habits ?? []).filter((h) => !h.archivedAt);
  const archived = (habits ?? []).filter((h) => h.archivedAt);

  return (
    <Modal title="✏️ Gestionar hábitos" onClose={onClose}>
      {isLoading && <p className="m-0 mb-3 text-sm text-muted">Cargando…</p>}
      {error && <p className="m-0 mb-3 text-sm text-hot">No se pudo cargar: {error.message}</p>}
      {habits && active.length === 0 && <p className="m-0 mb-3 text-[13px] text-faint">Aún no tienes hábitos.</p>}

      {SLOT_OPTIONS.map((s) => {
        const list = active.filter((h) => h.slot === s.value);
        if (list.length === 0) return null;
        return (
          <section key={s.value} className="mb-3">
            <h4 className="m-0 mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted">
              <Dot color={s.color} />
              {s.label}
            </h4>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {list.map((h) => (
                <li key={h.id} className="flex items-center gap-3 rounded-lg bg-surface2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{h.nombre}</span>
                  <button type="button" className={linkBtn} onClick={() => onEdit(h)}>
                    Editar
                  </button>
                  <button type="button" className={linkBtn} disabled={run.isPending} onClick={() => run.mutate({ action: 'archive', id: h.id })}>
                    Archivar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <button type="button" onClick={onNew} className="rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted">
        + Nuevo hábito
      </button>

      {archived.length > 0 && (
        <section className="mt-4 border-t border-line pt-3">
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)} className={linkBtn}>
            {showArchived ? '▾' : '▸'} Archivados ({archived.length})
          </button>
          {showArchived && (
            <>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                {archived.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 rounded-lg bg-surface2 px-3 py-2 text-sm">
                    <Dot color={SLOT_COLOR[h.slot]} />
                    <span className="min-w-0 flex-1 truncate text-muted">{h.nombre}</span>
                    <button type="button" className={linkBtn} disabled={run.isPending} onClick={() => run.mutate({ action: 'reactivate', id: h.id })}>
                      Reactivar
                    </button>
                    <ConfirmDelete label="Eliminar" disabled={run.isPending} onConfirm={() => run.mutate({ action: 'delete', id: h.id })} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 mb-0 text-[11.5px] text-faint">Eliminar borra también su historial. Reactivar lo cuenta como nuevo desde hoy.</p>
            </>
          )}
        </section>
      )}

      <ModalActions>
        <button type="button" className="btn" onClick={onClose}>
          Cerrar
        </button>
      </ModalActions>
    </Modal>
  );
}
```

`ConfirmDelete` lleva la clase `mr-auto`. Dentro de la fila no estorba, porque el `span` con `flex-1` ya ocupa el espacio. Si visualmente queda desalineado, déjalo y avísalo: no cambies `ConfirmDelete`.

- [ ] **Step 2: `App.tsx`**

- Añade los imports `import { HabitModal } from './components/HabitModal';` y `import { HabitsManager } from './components/HabitsManager';`, y añade `HabitAdmin` al import de tipos de `@sb/shared` (`import type { HabitAdmin, Project, Task } from '@sb/shared';`).
- Amplía `ModalState` con dos variantes: `| { kind: 'habitos' }` y `| { kind: 'habito'; habit?: HabitAdmin }`.
- En `Home`, debajo de `const close = …`, añade:

```tsx
  // Crear/editar un hábito cierra "Gestionar hábitos" y vuelve a él al terminar (sin modales apilados)
  const backToHabits = useCallback(() => setModal({ kind: 'habitos' }), []);
```

- En el encabezado de la sección de hábitos, sustituye `<small className="text-xs text-faint">se abre según la hora</small>` por:

```tsx
              <button
                onClick={() => setModal({ kind: 'habitos' })}
                className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
              >
                ✏️ Gestionar
              </button>
```

- Junto a los demás modales, al final, añade:

```tsx
      {modal?.kind === 'habitos' && (
        <HabitsManager onClose={close} onNew={() => setModal({ kind: 'habito' })} onEdit={(habit) => setModal({ kind: 'habito', habit })} />
      )}
      {modal?.kind === 'habito' && <HabitModal habit={modal.habit} onClose={backToHabits} />}
```

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/HabitsManager.tsx apps/web/src/App.tsx
git commit -m "web: gestionar hábitos (lista, archivar, reactivar, eliminar)"
```

---

### Task 8: Docs, migración en dev y verificación manual

**Files:**
- Modify: `CLAUDE.md` (regla de racha)
- Modify: `docs/DATA-MODEL.md` (entidad `habits` y línea de racha)

- [ ] **Step 1: Docs**

En `CLAUDE.md`, sustituye la línea que empieza por `- **Racha:**` por:

```md
- **Racha:** días consecutivos al 100% de los hábitos **vigentes ese día** (`habitsOn`: creados hasta ese día y no archivados). Hoy suma si está completo, pero si no lo está no rompe la racha; un día sin hábitos vigentes la corta.
- **Hábitos:** archivar pone `archived_at` y conserva el historial; `active` es una columna generada (`archived_at is null`), no se escribe. Reactivar pone `created_at = now()`: cuenta como nuevo desde hoy. Eliminar borra también sus `habit_logs`.
```

En `docs/DATA-MODEL.md`, en `habits { … }`, sustituye `bool active` por estas tres líneas:

```
    timestamptz created_at
    timestamptz archived_at
    bool active "generada: archived_at is null"
```

En la línea 102, sustituye `con % = 100% (o umbral)` por `con % = 100% (o umbral) de los hábitos vigentes ese día`.

- [ ] **Step 2: Migración en dev**

Run: `pnpm db:push:dev`
Expected: aparece `Applying migration <ts>_habits_vigencia.sql…` y después `Finished supabase db push.`

- [ ] **Step 3: Verificación manual en Chrome contra dev**

Con `pnpm dev` (http://localhost:5173, `dev@local.test` / `devpassword`):

1. La racha y el % se ven igual que antes de la migración.
2. **Gestionar → + Nuevo hábito:** se crea en su franja; la franja por defecto es la actual; la racha no cambia.
3. **Editar:** cambia el nombre y la franja; el hábito se mueve de pestaña en Hoy.
4. **Archivar:** desaparece de Hoy, la racha de días pasados no cambia y aparece en "Archivados (n)".
5. **Reactivar:** vuelve a Hoy.
6. **Eliminar** (dos clics): desaparece de la lista.
7. **Cancelar o Esc en HabitModal** vuelve a "Gestionar hábitos"; Esc o "Cerrar" en Gestionar cierra todo.
8. Revisa los temas claro y oscuro y el ancho de 375 px. La consola no debe mostrar errores.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/DATA-MODEL.md
git commit -m "docs: racha por vigencia y ciclo de vida de hábitos"
```
