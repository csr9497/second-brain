# Hábitos en varias franjas ("y" / "o") — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un hábito se programe como turnos ("y") de franjas alternativas ("o"), se marque una vez por turno y conserve un historial exacto.

**Architecture:**
- `habits.turnos jsonb`, validado por un CHECK, sustituye a `slot`, que queda como columna generada para no romper el frontend publicado.
- Cada periodo guarda su programación, y cambiar los turnos de un hábito abre un periodo nuevo.
- Los registros guardan la franja donde se hizo cada turno.
- El dominio cuenta turnos y no hábitos.
- La UI añade un constructor de turnos y fichas por franja.

**Tech Stack:** Postgres/pgTAP, Zod 4/vitest, React 19 y TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-06-habitos-turnos-design.md`

**Commits:** van en la rama `feat/entregable-2`, y cada mensaje termina con una línea en blanco seguida de `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Migración `habits_turnos` + seed + pgTAP

**Files:**
- Create: `supabase/migrations/<ts>_habits_turnos.sql`
- Modify: `supabase/seed.sql` (hábitos y sus registros)
- Modify: `supabase/tests/database/rls_and_triggers.test.sql`

- [ ] **Step 1: pgTAP (fallarán)**

Cambia `select plan(28);` por `select plan(34);`. Justo antes de la línea `-- Reloj del navegador atrasado…`, añade:

```sql
-- Turnos: "y" de franjas alternativas ("o"), cada franja una sola vez
select throws_ok($$ insert into public.habits (nombre, turnos) values ('repetido', '[["manana"],["manana"]]') $$,
  '23514', null, 'turnos con una franja repetida violan el CHECK');
select throws_ok($$ update public.habits set slot = 'tarde' where id = 'aaaaaaaa-0000-4000-8000-000000000005' $$,
  '428C9', null, 'slot es generado (primera franja) y no se escribe');
update public.habits set turnos = '[["tarde"],["noche"]]' where id = 'aaaaaaaa-0000-4000-8000-000000000005';
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005'), 3,
  'cambiar los turnos de un hábito activo abre un periodo nuevo');
select is((select turnos from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005' and hasta is null),
  '[["tarde"],["noche"]]'::jsonb, 'el periodo abierto guarda la nueva programación');
select lives_ok($$ insert into public.habit_logs (habit_id, fecha, slot) values
  ('aaaaaaaa-0000-4000-8000-000000000005', '2026-10-01', 'tarde'),
  ('aaaaaaaa-0000-4000-8000-000000000005', '2026-10-01', 'noche') $$,
  'un hábito puede tener registros en varias franjas el mismo día');
select throws_ok($$ insert into public.habit_logs (habit_id, fecha, slot) values
  ('aaaaaaaa-0000-4000-8000-000000000005', '2026-10-01', 'tarde') $$,
  '23505', null, 'un solo registro por hábito, fecha y franja');
```

- [ ] **Step 2: Comprobar que fallan**

Run: `supabase test db`
Expected: FAIL (`column "turnos" … does not exist`).

- [ ] **Step 3: Migración**

Run: `supabase migration new habits_turnos` (aislado) y escribe:

```sql
-- Hábitos en varias franjas: `turnos` es una lista de turnos ("y") de franjas alternativas ("o"),
-- p. ej. [["manana"],["tarde","noche"]] = Mañana + (Tarde o Noche). Cada franja aparece una sola vez.
-- Debe coincidir con `turnosSchema` de packages/shared.
create function public.turnos_validos(t jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  turno jsonb;
  franja text;
  vistas text[] := '{}';
begin
  if t is null or jsonb_typeof(t) <> 'array' or jsonb_array_length(t) not between 1 and 3 then
    return false;
  end if;
  for turno in select value from jsonb_array_elements(t) loop
    if jsonb_typeof(turno) <> 'array' or jsonb_array_length(turno) = 0 then
      return false;
    end if;
    for franja in select value from jsonb_array_elements_text(turno) loop
      if franja not in ('manana', 'tarde', 'noche') or franja = any (vistas) then
        return false;
      end if;
      vistas := vistas || franja;
    end loop;
  end loop;
  return true;
end $$;

-- habits: turnos sustituye a slot; slot queda generado (primera franja) para el frontend publicado
alter table public.habits add column turnos jsonb;
update public.habits set turnos = jsonb_build_array(jsonb_build_array(slot));
alter table public.habits
  alter column turnos set not null,
  alter column turnos set default '[["manana"]]',
  add constraint habits_turnos_validos check (public.turnos_validos(turnos));
alter table public.habits drop column slot;
alter table public.habits add column slot text generated always as (turnos->0->>0) stored;

-- habit_periods: cada periodo guarda la programación vigente
alter table public.habit_periods add column turnos jsonb;
update public.habit_periods p set turnos = h.turnos from public.habits h where h.id = p.habit_id;
alter table public.habit_periods alter column turnos set not null;

create or replace function public.habits_sync_periods() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- el cliente archiva con la hora del navegador: nunca cerrar antes de abrir
  if tg_op = 'INSERT' then
    -- greatest() ignora los NULL: sin archived_at el periodo debe quedar abierto
    insert into public.habit_periods (user_id, habit_id, desde, hasta, turnos)
    values (new.user_id, new.id, new.created_at,
            case when new.archived_at is null then null else greatest(new.archived_at, new.created_at) end,
            new.turnos);
  elsif old.archived_at is null and new.archived_at is not null then
    update public.habit_periods set hasta = greatest(new.archived_at, desde) where habit_id = new.id and hasta is null;
  elsif old.archived_at is not null and new.archived_at is null then
    insert into public.habit_periods (user_id, habit_id, desde, turnos) values (new.user_id, new.id, now(), new.turnos);
  elsif new.archived_at is null and old.turnos is distinct from new.turnos then
    -- Cambiar las franjas de un hábito activo cierra el periodo y abre otro: el pasado no se reescribe
    update public.habit_periods set hasta = greatest(now(), desde) where habit_id = new.id and hasta is null;
    insert into public.habit_periods (user_id, habit_id, desde, turnos) values (new.user_id, new.id, now(), new.turnos);
  end if;
  return null;
end $$;

drop trigger habits_sync_periods on public.habits;
create trigger habits_sync_periods
  after insert or update of archived_at, turnos on public.habits
  for each row execute function public.habits_sync_periods();

-- habit_logs: franja en que se hizo; un registro por (hábito, fecha, franja)
alter table public.habit_logs add column slot text;
update public.habit_logs l set slot = h.slot from public.habits h where h.id = l.habit_id;
alter table public.habit_logs
  alter column slot set not null,
  add constraint habit_logs_slot_check check (slot in ('manana', 'tarde', 'noche'));
alter table public.habit_logs drop constraint habit_logs_habit_id_fecha_key;
alter table public.habit_logs add constraint habit_logs_habit_fecha_slot_key unique (habit_id, fecha, slot);
```

- [ ] **Step 4: Seed**

En `supabase/seed.sql`, sustituye el insert de hábitos y el de `habit_logs` por los siguientes. Se añade un séptimo hábito con dos turnos para la demo:

```sql
  -- Hábitos creados hace 10 días (uno con dos turnos: Mañana + (Tarde o Noche)) + 5 días previos completos
  insert into public.habits (user_id, nombre, turnos, position, created_at) values
    (uid, 'Ejercicio', '[["manana"]]', 1000, now() - interval '10 days'), (uid, 'Inglés', '[["manana"]]', 2000, now() - interval '10 days'),
    (uid, 'Estudiar', '[["tarde"]]', 3000, now() - interval '10 days'), (uid, 'Leer', '[["tarde"]]', 4000, now() - interval '10 days'),
    (uid, 'Revisar pendientes', '[["noche"]]', 5000, now() - interval '10 days'), (uid, 'Planear mañana', '[["noche"]]', 6000, now() - interval '10 days'),
    (uid, 'Tomar agua (2 L)', '[["manana"],["tarde","noche"]]', 7000, now() - interval '10 days');
  -- un registro por turno (en su primera franja) en cada uno de los 5 días previos
  insert into public.habit_logs (user_id, habit_id, fecha, done, slot)
    select uid, h.id, today - d, true, t->>0
    from public.habits h, jsonb_array_elements(h.turnos) t, generate_series(1, 5) d
    where h.user_id = uid;
```

- [ ] **Step 5: Pasan**

Run: `pnpm db:reset` (aislado, timeout largo) y `supabase test db`
Expected: `Result: PASS` con 34 tests. Comprueba además:

```bash
docker exec supabase_db_second-brain psql -U postgres -tAc "select count(*), count(*) filter (where hasta is null) from public.habit_periods"
```

Expected: `7|7`.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "DB: hábitos con turnos (y/o), periodos con programación y registros por franja"
```

---

### Task 2: Esquema de turnos, textos y tipos (`packages/shared`)

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/turnos.ts`
- Create: `packages/shared/src/turnos.test.ts`
- Modify: `packages/shared/src/schemas.test.ts` (los tests de hábitos)

- [ ] **Step 1: Tests (fallarán)**

`packages/shared/src/turnos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { turnosSchema } from './index';
import { formatTurnos, franjasLibres, resumenTurnos } from './turnos';

describe('turnosSchema', () => {
  it.each([[[['manana'], ['noche']]], [[['manana', 'tarde']]], [[['manana'], ['tarde', 'noche']]]])('acepta %j', (t) =>
    expect(turnosSchema.parse(t)).toEqual(t),
  );
  it.each([[[]], [[[]]], [[['manana'], ['manana']]], [[['manana', 'manana']]], [[['madrugada']]]])('rechaza %j', (t) =>
    expect(() => turnosSchema.parse(t)).toThrow(),
  );
});

describe('textos de turnos', () => {
  it('franjasLibres', () => expect(franjasLibres([['tarde']])).toEqual(['manana', 'noche']));
  it('formatTurnos', () => {
    expect(formatTurnos([['manana'], ['tarde', 'noche']])).toBe('Mañana + (Tarde o Noche)');
    expect(formatTurnos([['manana', 'tarde']])).toBe('Mañana o Tarde');
    expect(formatTurnos([['manana'], ['noche']])).toBe('Mañana + Noche');
  });
  it('resumenTurnos', () => {
    expect(resumenTurnos([['manana'], ['tarde', 'noche']])).toBe('Se marca 2 veces al día: por la mañana, y por la tarde o la noche');
    expect(resumenTurnos([['manana', 'tarde']])).toBe('Se marca 1 vez al día: por la mañana o la tarde');
    expect(resumenTurnos([['manana'], ['tarde'], ['noche']])).toBe('Se marca 3 veces al día: por la mañana, por la tarde, y por la noche');
  });
});
```

En `schemas.test.ts`, sustituye los tests del `describe('hábitos')` por:

```ts
describe('hábitos', () => {
  it('updateHabitInput ignora active (archivar tiene acción propia)', () =>
    expect(updateHabitInput.parse({ nombre: 'x', active: false })).toEqual({ nombre: 'x' }));
  it('updateHabitInput sin campos editables falla', () => expect(() => updateHabitInput.parse({ active: false })).toThrow());
  it('createHabitInput usa la mañana por defecto', () =>
    expect(createHabitInput.parse({ nombre: 'x' })).toEqual({ nombre: 'x', turnos: [['manana']] }));
  it('updateHabitInput valida los turnos', () => expect(() => updateHabitInput.parse({ turnos: [['manana'], ['manana']] })).toThrow());
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm --filter @sb/shared exec vitest run src/turnos.test.ts src/schemas.test.ts`
Expected: FAIL (`turnosSchema` no existe).

- [ ] **Step 3: Implementar**

En `index.ts`, justo después de `export type HabitSlot = …`, añade:

```ts
/** Turnos de un hábito: lista ("y") de franjas alternativas ("o"); cada franja una sola vez. Igual que turnos_validos() en la DB. */
export const turnosSchema = z
  .array(z.array(habitSlot).min(1, 'Elige al menos una franja'))
  .min(1, 'Elige al menos una franja')
  .max(3, 'Máximo 3 turnos')
  .refine((t) => new Set(t.flat()).size === t.flat().length, 'Cada franja solo puede usarse una vez');
export type Turnos = HabitSlot[][];
```

`turnosSchema` vive en `index.ts`, y no en `turnos.ts`, a propósito: `habitFields` lo usa al cargar el módulo, y `turnos.ts` solo importa tipos, así que no se crea un ciclo en tiempo de ejecución.

Sustituye `habitFields` y `createHabitInput` por:

```ts
const habitFields = z.object({ nombre: z.string().trim().min(1), turnos: turnosSchema });
export const createHabitInput = habitFields.extend({ turnos: turnosSchema.default([['manana']]) });
```

Sustituye `interface Habit` (y su uso, en la Task 3) por:

```ts
/** Ficha de un hábito en una franja de Hoy: una por cada franja de cada turno vigente. */
export interface HabitChip {
  id: string;
  nombre: string;
  position: number;
  /** Franja de esta ficha */
  slot: HabitSlot;
  /** Franjas alternativas del turno al que pertenece */
  turno: HabitSlot[];
  /** Turno hecho hoy (en cualquiera de sus franjas) */
  done: boolean;
  /** Franja donde se hizo, o null */
  doneIn: HabitSlot | null;
}
```

En `HabitAdmin`, cambia `slot: HabitSlot;` por `turnos: Turnos;`. En `TodayPayload`, cambia `porFranja: Record<HabitSlot, Habit[]>;` por `porFranja: Record<HabitSlot, HabitChip[]>;`. Al final de `index.ts`, añade `export * from './turnos';`.

`packages/shared/src/turnos.ts`:

```ts
import type { HabitSlot } from './index';

// Textos de las franjas y de las expresiones de turnos ("y" de franjas alternativas "o")
const ORDEN: HabitSlot[] = ['manana', 'tarde', 'noche'];
export const SLOT_NOMBRE: Record<HabitSlot, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
const CON_ARTICULO: Record<HabitSlot, string> = { manana: 'la mañana', tarde: 'la tarde', noche: 'la noche' };

/** Franjas aún no usadas, en orden mañana → noche. */
export function franjasLibres(turnos: HabitSlot[][]): HabitSlot[] {
  const usadas = new Set(turnos.flat());
  return ORDEN.filter((f) => !usadas.has(f));
}

/** "Mañana + (Tarde o Noche)": paréntesis solo en turnos con alternativas cuando hay varios turnos. */
export function formatTurnos(turnos: HabitSlot[][]): string {
  return turnos
    .map((t) => {
      const texto = t.map((f) => SLOT_NOMBRE[f]).join(' o ');
      return turnos.length > 1 && t.length > 1 ? `(${texto})` : texto;
    })
    .join(' + ');
}

/** "Se marca 2 veces al día: por la mañana, y por la tarde o la noche". */
export function resumenTurnos(turnos: HabitSlot[][]): string {
  const partes = turnos.map((t) => `por ${t.map((f) => CON_ARTICULO[f]).join(' o ')}`);
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')}, y ${partes[partes.length - 1]}`;
  const n = turnos.length;
  return `Se marca ${n} ${n === 1 ? 'vez' : 'veces'} al día: ${lista}`;
}
```

- [ ] **Step 4: Pasan**

Run: `pnpm --filter @sb/shared exec vitest run src/turnos.test.ts src/schemas.test.ts`
Expected: PASS. El typecheck del dominio (`dashboard.ts`) y el de la web fallarán: se arreglan en las Tasks 3 a 7.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/turnos.ts packages/shared/src/turnos.test.ts packages/shared/src/schemas.test.ts
git commit -m "shared: esquema y textos de turnos de hábitos"
```

---

### Task 3: Dominio por turnos (`dashboard.ts`)

**Files:**
- Modify: `packages/shared/src/domain/dashboard.ts`
- Modify: `packages/shared/src/domain/dashboard.test.ts`

- [ ] **Step 1: Tests (fallarán)**

En `dashboard.test.ts`:
- Añade `doneByDate` al import de `./dashboard` y `type HabitSlot` al import de `../index`.
- Sustituye los helpers `per` y `habit` y la constante `habits` por:

```ts
const per = (desde: string, hasta: string | null = null, turnos: HabitSlot[][] = [['manana']]) => ({ desde, hasta, turnos });
const habit = (id: string, o: Partial<HabitRow> = {}): HabitRow => ({
  id,
  nombre: id,
  position: 1,
  periods: [per(at(2026, 9, 1))],
  ...o,
});
const habits: HabitRow[] = [
  habit('h1', { nombre: 'Ejercicio' }),
  habit('h2', { nombre: 'Leer', position: 2, periods: [per(at(2026, 9, 1), null, [['tarde']])] }),
];
```

- En `input.doneLogs`, añade `slot` a cada registro: `'manana'` para `h1` y `'borrado'`, y `'tarde'` para `h2`.
- En `describe('vigencia de hábitos')`, cambia el helper `logs` por:

```ts
  const logs = (rows: [string, string, HabitSlot?][]) => rows.map(([habitId, fecha, slot = 'manana']) => ({ habitId, fecha, slot }));
```

- Los `per(desde, hasta)` existentes siguen valiendo (turnos `[['manana']]` por defecto).
- Añade al final:

```ts
describe('turnos', () => {
  const logs = (rows: [string, string, HabitSlot][]) => rows.map(([habitId, fecha, slot]) => ({ habitId, fecha, slot }));
  const base = { tasks: [], projects: [], now };
  const conTurnos = (id: string, turnos: HabitSlot[][]) => habit(id, { periods: [per(at(2026, 9, 1), null, turnos)] });

  it('Mañana + Noche con solo la mañana hecha: 50% y ficha en ambas pestañas', () => {
    const t = buildToday({ ...base, habits: [conTurnos('d', [['manana'], ['noche']])], doneLogs: logs([['d', '2026-10-01', 'manana']]) });
    expect(t.habits.pctDia).toBe(50);
    expect(t.habits.porFranja.manana.map((c) => [c.id, c.done])).toEqual([['d', true]]);
    expect(t.habits.porFranja.noche.map((c) => [c.id, c.done])).toEqual([['d', false]]);
  });

  it('Tarde o Noche hecho por la tarde: la ficha de noche sale hecha con doneIn tarde', () => {
    const t = buildToday({ ...base, habits: [conTurnos('w', [['tarde', 'noche']])], doneLogs: logs([['w', '2026-10-01', 'tarde']]) });
    expect(t.habits.pctDia).toBe(100);
    expect(t.habits.porFranja.noche[0]).toMatchObject({ id: 'w', done: true, doneIn: 'tarde', turno: ['tarde', 'noche'] });
  });

  it('un día con dos turnos exige los dos para la racha', () => {
    const t = buildToday({
      ...base,
      habits: [conTurnos('d', [['manana'], ['noche']])],
      doneLogs: logs([['d', '2026-09-30', 'manana'], ['d', '2026-09-30', 'noche'], ['d', '2026-09-29', 'manana']]),
    });
    expect(t.habits.streak).toBe(1);
  });

  it('cambiar los turnos hoy no reescribe los días pasados', () => {
    // hasta ayer era solo Mañana (hecho); desde hoy es Mañana + Noche
    const x = habit('x', { periods: [per(at(2026, 9, 1), at(2026, 10, 1)), per(at(2026, 10, 1), null, [['manana'], ['noche']])] });
    const t = buildToday({ ...base, habits: [x], doneLogs: logs([['x', '2026-09-30', 'manana'], ['x', '2026-09-29', 'manana']]) });
    expect(t.habits.streak).toBe(2);
    expect(t.habits.porFranja.noche.map((c) => c.id)).toEqual(['x']);
  });

  it('habitsPct semanal cuenta turnos', () => {
    // lun 28 – jue 1, "d" = Mañana + Noche → 8 turnos; 3 hechos
    const r = buildWeeklyReport(
      {
        ...base,
        habits: [conTurnos('d', [['manana'], ['noche']])],
        doneLogs: logs([['d', '2026-09-28', 'manana'], ['d', '2026-09-28', 'noche'], ['d', '2026-09-29', 'manana']]),
      },
      false,
    );
    expect(r.habitsPct).toBe(38);
  });

  it('dos registros del mismo turno alternativo cuentan una vez', () => {
    const w = conTurnos('w', [['tarde', 'noche']]);
    expect(doneByDate([w], logs([['w', '2026-09-30', 'tarde'], ['w', '2026-09-30', 'noche']])).get('2026-09-30')).toBe(1);
  });
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm --filter @sb/shared exec vitest run src/domain/dashboard.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar en `dashboard.ts`**

- Import de tipos de `'../index'`: cambia `Habit` por `HabitChip`.
- `HabitPeriod` gana `/** Programación vigente en el periodo */ turnos: HabitSlot[][];`.
- `HabitRow` pierde `slot`.
- `DashboardInput.doneLogs` pasa a `{ habitId: string; fecha: string; slot: HabitSlot }[]`.
- Sustituye `vigente`, `habitsOn` y `doneByDate` por:

```ts
const cubre = (p: HabitPeriod, fecha: string) =>
  toISO(new Date(p.desde)) <= fecha && (p.hasta == null || toISO(new Date(p.hasta)) > fecha);

/** Periodo que cubre `fecha` (día local), si el hábito estaba vigente ese día. */
export const periodoEn = (h: HabitRow, fecha: string) => h.periods.find((p) => cubre(p, fecha));

/** Hábitos vigentes en `fecha` (día local): algún periodo cubre ese día. */
export const habitsOn = (habits: HabitRow[], fecha: string) => habits.filter((h) => periodoEn(h, fecha) != null);

/** Hábitos vigentes en `fecha` con los turnos de su programación de ese día. */
export function turnosEn(habits: HabitRow[], fecha: string) {
  return habits.flatMap((h) => {
    const p = periodoEn(h, fecha);
    return p ? [{ habit: h, turnos: p.turnos }] : [];
  });
}

/** Nº de turnos vigentes en `fecha`. */
const totalTurnos = (habits: HabitRow[], fecha: string) => turnosEn(habits, fecha).reduce((n, x) => n + x.turnos.length, 0);

/** Turnos hechos por fecha, según la programación vigente de cada hábito ese día. */
export function doneByDate(habits: HabitRow[], doneLogs: DashboardInput['doneLogs']) {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const hechos = new Map<string, Set<string>>(); // fecha → "hábito|índice de turno"
  for (const l of doneLogs) {
    const h = byId.get(l.habitId);
    const p = h && periodoEn(h, l.fecha);
    const i = p ? p.turnos.findIndex((t) => t.includes(l.slot)) : -1;
    if (i < 0) continue;
    const set = hechos.get(l.fecha) ?? new Set<string>();
    set.add(`${l.habitId}|${i}`);
    hechos.set(l.fecha, set);
  }
  return new Map([...hechos].map(([fecha, set]) => [fecha, set.size]));
}
```

- En `buildToday`, sustituye desde `const doneToday = …` hasta el bucle que llena `porFranja` (incluido) por:

```ts
  const logsHoy = doneLogs.filter((l) => l.fecha === today);
  const porFranja: Record<HabitSlot, HabitChip[]> = { manana: [], tarde: [], noche: [] };
  let turnosHoy = 0;
  let hechosHoy = 0;
  for (const { habit, turnos } of turnosEn(habits, today)) {
    for (const turno of turnos) {
      turnosHoy++;
      const doneIn = turno.find((f) => logsHoy.some((l) => l.habitId === habit.id && l.slot === f)) ?? null;
      if (doneIn) hechosHoy++;
      for (const slot of turno) {
        porFranja[slot].push({ id: habit.id, nombre: habit.nombre, position: habit.position, slot, turno, done: doneIn != null, doneIn });
      }
    }
  }
```

  En el return: `pctDia: pct(hechosHoy, turnosHoy),` y `streak: computeStreak(doneByDate(habits, doneLogs), today, (d) => totalTurnos(habits, d)),`.

- En `buildWeeklyReport`, sustituye `const totalOn = (d: string) => habitsOn(habits, d).length;` por `const totalOn = (d: string) => totalTurnos(habits, d);`.

- [ ] **Step 4: Pasan**

Run: `pnpm --filter @sb/shared test && pnpm --filter @sb/shared typecheck`
Expected: PASS. Todos los tests previos siguen pasando con los fixtures adaptados.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain
git commit -m "shared: Hoy, racha y % semanal cuentan turnos"
```

---

### Task 4: API con turnos

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Implementar**

En `loadDashboard`:
- La consulta de hábitos pasa a `select('id, nombre, position, periods:habit_periods(desde, hasta, turnos)')`.
- El mapeo de cada hábito queda como `{ id: h.id, nombre: h.nombre, position: Number(h.position), periods: (h.periods ?? []).map((p: Row) => ({ desde: p.desde, hasta: p.hasta, turnos: p.turnos as HabitSlot[][] })) }`, sin `slot`.
- La consulta de registros pasa a `.select('habit_id, fecha, slot')`.
- `doneLogs` queda como `logs.map((l) => ({ habitId: l.habit_id, fecha: l.fecha, slot: l.slot as HabitSlot }))`.

Sustituye `toggleHabit` por:

```ts
  /**
   * Marca o desmarca el turno de una ficha. Si el turno ya está hecho (en esta u otra de sus
   * franjas), desmarca ese registro; si no, lo marca en la franja de la ficha.
   */
  toggleHabit: async ({ id, slot, doneIn }: { id: string; slot: HabitSlot; doneIn: HabitSlot | null }) => {
    must(
      await sb
        .from('habit_logs')
        .upsert({ habit_id: id, fecha: todayISO(), slot: doneIn ?? slot, done: doneIn == null }, { onConflict: 'habit_id,fecha,slot' }),
    );
  },
```

- En `habits()`, la consulta pasa a `select('id, nombre, position, turnos, archived_at')` y el mapeo devuelve `turnos: h.turnos as HabitSlot[][]` en lugar de `slot`.
- En `createHabit`: `const { nombre, turnos } = createHabitInput.parse(input);` e `insert({ nombre, turnos, position })`.
- En `updateHabit`: `const { nombre, turnos } = updateHabitInput.parse(patch);` y filtra `{ nombre, turnos }`.

- [ ] **Step 2: Verificar**

Run: `pnpm --filter @sb/web typecheck`
Expected: solo quedan errores en `Habits.tsx`, `HabitModal.tsx` y `HabitsManager.tsx`, que arreglan las Tasks 5 a 7. `api.ts` no debe tener errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "web: API de hábitos con turnos y registros por franja"
```

---

### Task 5: Fichas por franja en Hoy (`Habits.tsx`)

**Files:**
- Modify: `apps/web/src/components/Habits.tsx`

- [ ] **Step 1: Implementar**

Imports: `import type { HabitChip, HabitSlot, TodayPayload } from '@sb/shared';`.

En el componente:
- `all` y `done` se sustituyen por `const { total, hechos } = contarTurnos(habits.porFranja);`. El texto del progreso usa `hechos` y `total`, con `total === 0` como el caso "Aún no tienes hábitos".
- La mutación queda así:

```ts
  const toggle = useTodayMutation(
    (c: HabitChip) => api.toggleHabit({ id: c.id, slot: c.slot, doneIn: c.doneIn }),
    (data, c) => {
      // marca o desmarca todas las fichas del mismo turno (en cualquiera de sus franjas)
      const flip = (x: HabitChip) => (x.id === c.id && x.turno.includes(c.slot) ? { ...x, done: !c.done, doneIn: c.done ? null : c.slot } : x);
      const porFranja = Object.fromEntries(Object.entries(data.habits.porFranja).map(([k, list]) => [k, list.map(flip)])) as PorFranja;
      return { ...data, habits: { ...data.habits, porFranja, pctDia: contarTurnos(porFranja).pct } };
    },
  );
```

- Las fichas de la pestaña se renderizan así:
  - `key={`${c.id}-${c.slot}`}`, `aria-pressed={c.done}` y `onClick={() => toggle.mutate(c)}`.
  - El texto sigue siendo `{c.nombre}`.
  - Cuando `c.done && c.doneIn && c.doneIn !== c.slot`, se añade detrás `<small className="text-[11px] font-normal opacity-80">· hecho por {POR[c.doneIn]}</small>`, con el mapa local `const POR: Record<HabitSlot, string> = { manana: 'la mañana', tarde: 'la tarde', noche: 'la noche' };`.

- [ ] **Step 2: Verificar**

Run: `pnpm --filter @sb/web typecheck`
Expected: `Habits.tsx` sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/Habits.tsx
git commit -m "web: Hoy muestra fichas por turno y franja"
```

---

### Task 6: Constructor de turnos + `HabitModal`

**Files:**
- Create: `apps/web/src/components/ui/TurnosBuilder.tsx`
- Modify: `apps/web/src/components/HabitModal.tsx`

- [ ] **Step 1: `TurnosBuilder.tsx`**

```tsx
import { useState } from 'react';
import { SLOT_COLOR, SLOT_NOMBRE, franjasLibres, type HabitSlot } from '@sb/shared';
import { Dot } from './Dot';

type Abierto = { kind: 'o'; turno: number } | { kind: 'turno' } | null;
const LLENO = 'Ya usaste las 3 franjas';

/** Constructor de turnos: filas unidas por "+" (y); las franjas de cada fila, por "o" (alternativas). */
export function TurnosBuilder({ value, onChange }: { value: HabitSlot[][]; onChange: (t: HabitSlot[][]) => void }) {
  const [abierto, setAbierto] = useState<Abierto>(null);
  const libres = franjasLibres(value);
  const sinLibres = libres.length === 0;
  const unaSola = value.flat().length === 1;

  // Quitar la última franja de un turno elimina el turno
  const quitar = (i: number, f: HabitSlot) =>
    onChange(value.map((t, j) => (j === i ? t.filter((x) => x !== f) : t)).filter((t) => t.length > 0));
  const elegir = (f: HabitSlot) => {
    if (abierto?.kind === 'o') onChange(value.map((t, j) => (j === abierto.turno ? [...t, f] : t)));
    else onChange([...value, [f]]);
    setAbierto(null);
  };

  const opciones = (label: (f: HabitSlot) => string) => (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Franjas libres">
      {libres.map((f) => (
        <button
          key={f}
          type="button"
          aria-label={label(f)}
          onClick={() => elegir(f)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-text"
        >
          <Dot color={SLOT_COLOR[f]} />
          {SLOT_NOMBRE[f]}
        </button>
      ))}
      <button type="button" onClick={() => setAbierto(null)} className="px-1 text-xs text-faint hover:text-text">
        Cancelar
      </button>
    </div>
  );

  return (
    <div>
      {value.map((turno, i) => (
        <div key={i}>
          {i > 0 && <div className="my-1 text-center text-xs font-bold text-faint" aria-hidden>+</div>}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface2 px-2.5 py-2">
            {turno.map((f, k) => (
              <span key={f} className="inline-flex items-center gap-1.5">
                {k > 0 && <span className="text-xs font-semibold text-faint">o</span>}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold">
                  <Dot color={SLOT_COLOR[f]} />
                  {SLOT_NOMBRE[f]}
                  <button
                    type="button"
                    aria-label={`Quitar ${SLOT_NOMBRE[f]}`}
                    title={unaSola ? 'El hábito necesita al menos una franja' : undefined}
                    disabled={unaSola}
                    onClick={() => quitar(i, f)}
                    className="text-faint hover:text-hot disabled:opacity-40"
                  >
                    ✕
                  </button>
                </span>
              </span>
            ))}
            <button
              type="button"
              disabled={sinLibres}
              title={sinLibres ? LLENO : 'Añadir una franja alternativa'}
              onClick={() => setAbierto({ kind: 'o', turno: i })}
              className="ml-auto rounded-md px-2 py-0.5 text-xs font-semibold text-muted hover:text-text disabled:opacity-40"
            >
              o…
            </button>
          </div>
          {abierto?.kind === 'o' && abierto.turno === i && opciones((f) => `Añadir ${SLOT_NOMBRE[f]} como alternativa`)}
        </div>
      ))}
      <button
        type="button"
        disabled={sinLibres}
        title={sinLibres ? LLENO : undefined}
        onClick={() => setAbierto({ kind: 'turno' })}
        className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted disabled:opacity-40"
      >
        + Añadir turno
      </button>
      {abierto?.kind === 'turno' && opciones((f) => `Añadir turno de ${SLOT_NOMBRE[f]}`)}
    </div>
  );
}
```

- [ ] **Step 2: `HabitModal.tsx`**

- Imports: quita `SLOT_OPTIONS` y `Select`, y añade `formatTurnos`, `resumenTurnos`, `turnosSchema` y `type Turnos` desde `@sb/shared`, y `TurnosBuilder` desde `./ui/TurnosBuilder`.
- El estado de franja pasa a `const [turnos, setTurnos] = useState<Turnos>(habit?.turnos ?? [[slotForHour(new Date().getHours())]]);` y se añade `const validos = turnosSchema.safeParse(turnos).success;`.
- `input` pasa a `{ nombre: nombre.trim(), turnos }`.
- El `Field` "Franja" se sustituye por:

```tsx
        <Field label="Franjas" group>
          <TurnosBuilder value={turnos} onChange={setTurnos} />
          <p className="mt-2 mb-0 text-[13px] font-semibold">{formatTurnos(turnos)}</p>
          <p className="m-0 text-[12px] text-faint">{resumenTurnos(turnos)}</p>
        </Field>
```

- El botón de guardar queda `disabled={save.isPending || !nombre.trim() || !validos}`, y `submit` comprueba `nombre.trim() && validos`.

- [ ] **Step 3: Verificar**

Run: `pnpm --filter @sb/web typecheck`
Expected: sin errores en estos dos archivos.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/TurnosBuilder.tsx apps/web/src/components/HabitModal.tsx
git commit -m "web: constructor de turnos (y/o) al crear y editar hábitos"
```

---

### Task 7: `HabitsManager` con lista plana y "Nuevo" arriba

**Files:**
- Modify: `apps/web/src/components/HabitsManager.tsx`

- [ ] **Step 1: Implementar**

- Imports: quita `SLOT_OPTIONS`, y añade `formatTurnos` (de `@sb/shared`) junto a `SLOT_COLOR`.
- Justo al inicio del contenido del `Modal`, antes de los mensajes de carga, coloca el botón primario separado de la lista:

```tsx
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={onNew} className="btn btn-primary px-3 py-1.5 text-xs">
          + Nuevo hábito
        </button>
      </div>
```

- Borra el antiguo botón punteado "+ Nuevo hábito".
- Sustituye el bloque `SLOT_OPTIONS.map(…)` por una lista plana de los activos (ya vienen ordenados por `position`):

```tsx
      {active.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {active.map((h) => (
            <li key={h.id} className="flex items-center gap-3 rounded-lg bg-surface2 px-3 py-2 text-sm">
              <span className="flex flex-none gap-1">
                {h.turnos.flat().map((f) => (
                  <Dot key={f} color={SLOT_COLOR[f]} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{h.nombre}</span>
                <span className="block truncate text-[11.5px] text-faint">{formatTurnos(h.turnos)}</span>
              </span>
              <button type="button" className={linkBtn} aria-label={`Editar ${h.nombre}`} onClick={() => onEdit(h)}>
                Editar
              </button>
              <button
                type="button"
                className={linkBtn}
                aria-label={`Archivar ${h.nombre}`}
                disabled={run.isPending}
                onClick={() => run.mutate({ action: 'archive', id: h.id })}
              >
                Archivar
              </button>
            </li>
          ))}
        </ul>
      )}
```

- En la fila de cada archivado, cambia `<Dot color={SLOT_COLOR[h.slot]} />` por los dots de `h.turnos.flat()`, y debajo del nombre añade `formatTurnos(h.turnos)` con el mismo estilo que en los activos.

- [ ] **Step 2: Verificar**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS en todo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/HabitsManager.tsx
git commit -m "web: gestionar hábitos con lista plana, turnos y Nuevo destacado arriba"
```

---

### Task 8 (controlador): docs, dev y verificación

- [ ] **Docs.** En `CLAUDE.md`:
  - Añade `turnos` a las reglas de **Hábitos**: lista "y" de franjas alternativas "o", sin repetir franjas; se marca una vez por turno; `slot` es generado.
  - Cambia la **Racha** para que cuente turnos.
  - Recoge la quinta regla de trigger (cambiar `turnos` abre un periodo).

  En `docs/DATA-MODEL.md`: `habits.turnos`, `habit_periods.turnos` y `habit_logs.slot`.
- [ ] **Dev.** Ejecuta `pnpm db:push:dev`, y comprueba que cada hábito de dev tiene `turnos` y que sus periodos llevan `turnos`.
- [ ] **Chrome (local, con la racha del seed).**
  1. Crea `Mañana + (Tarde o Noche)` con el constructor, comprobando que las franjas usadas quedan deshabilitadas y que "Guardar" se activa solo con turnos válidos.
  2. En Hoy, marca la ficha de tarde: la ficha de noche debe mostrar "hecho por la tarde".
  3. Comprueba el % y la racha.
  4. Edita el hábito a `Mañana o Tarde` y comprueba que la racha de los días pasados no cambia.
  5. Revisa el ancho de 375 px, los temas claro y oscuro, y que la consola no tenga errores.
