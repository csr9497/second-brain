# Periodos de vigencia de hábitos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la vigencia de un hábito sea la unión de sus periodos activos, para que reactivarlo no reescriba el pasado.

**Architecture:**
- Tabla `habit_periods` con RLS, que mantienen triggers sobre `habits`: insertar abre un periodo, archivar lo cierra y reactivar abre otro.
- El dominio pasa de `createdAt`/`archivedAt` a `periods[]`.
- La API embebe los periodos y reactivar solo limpia `archived_at`.

**Tech Stack:** Supabase/Postgres (migración, triggers, pgTAP), Zod/vitest y supabase-js.

**Spec:** sección "Revisión: periodos de vigencia" de `docs/superpowers/specs/2026-10-06-habitos-crud-design.md`.

**Commits:** van en la rama `feat/entregable-2`, y cada mensaje termina con una línea en blanco seguida de `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Migración `habit_periods` + triggers + pgTAP

**Files:**
- Create: `supabase/migrations/<ts>_habit_periods.sql`
- Modify: `supabase/tests/database/rls_and_triggers.test.sql`

- [ ] **Step 1: pgTAP (fallarán)**

Cambia `select plan(18);` por `select plan(23);`. En el bloque `-- Hábitos: active se deriva de archived_at`, justo después del `throws_ok` del código `'428C9'`, añade:

```sql
-- Periodos de vigencia (triggers sobre habits)
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005'), 1,
  'crear el hábito abre un periodo');
select isnt((select hasta from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005'), null,
  'archivar cierra el periodo');
update public.habits set archived_at = null where id = 'aaaaaaaa-0000-4000-8000-000000000005';
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005' and hasta is null), 1,
  'reactivar abre un periodo nuevo');
```

En la sección `-- ---------- Como B ----------`, después de `'B no ve los pasos de A'`, añade:

```sql
select is((select count(*)::int from public.habit_periods), 0, 'B no ve los periodos de A');
```

En la sección `-- ---------- Anónimo ----------`, después del `throws_ok` existente, añade:

```sql
select throws_ok($$ select * from public.habit_periods $$, '42501', null, 'anon no tiene acceso a habit_periods');
```

- [ ] **Step 2: Comprobar que fallan**

Run: `supabase test db`
Expected: FAIL con `relation "public.habit_periods" does not exist`.

- [ ] **Step 3: Migración**

Run: `supabase migration new habit_periods` (como comando aislado) y escribe:

```sql
-- Periodos de vigencia de hábitos: un hábito cuenta un día si algún periodo lo cubre.
-- Los mantienen los triggers sobre habits (crear abre, archivar cierra, reactivar abre otro),
-- así reactivar no reescribe el pasado.
create table public.habit_periods (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  desde    timestamptz not null,
  hasta    timestamptz,                 -- null = periodo abierto (hábito activo)
  check (hasta is null or hasta >= desde)
);
create index habit_periods_habit_idx on public.habit_periods (habit_id);
create index habit_periods_user_idx on public.habit_periods (user_id);

alter table public.habit_periods enable row level security;
create policy owner_all on public.habit_periods for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.habit_periods from anon;
grant select, insert, update, delete on public.habit_periods to authenticated;

-- Relleno: un periodo por hábito existente
insert into public.habit_periods (user_id, habit_id, desde, hasta)
  select user_id, id, created_at, archived_at from public.habits;

create function public.habits_sync_periods() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.habit_periods (user_id, habit_id, desde, hasta)
    values (new.user_id, new.id, new.created_at, new.archived_at);
  elsif old.archived_at is null and new.archived_at is not null then
    update public.habit_periods set hasta = new.archived_at where habit_id = new.id and hasta is null;
  elsif old.archived_at is not null and new.archived_at is null then
    insert into public.habit_periods (user_id, habit_id, desde) values (new.user_id, new.id, now());
  end if;
  return null;
end $$;

create trigger habits_sync_periods
  after insert or update of archived_at on public.habits
  for each row execute function public.habits_sync_periods();
```

- [ ] **Step 4: Pasan**

Run: `pnpm db:reset` (aislado, timeout largo) y `supabase test db`
Expected: `Result: PASS` con 23 tests. Comprueba además en el seed que cada hábito demo tiene 1 periodo:

```bash
docker exec supabase_db_second-brain psql -U postgres -tAc "select count(*) from public.habit_periods"
```

Expected: `6`.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "DB: periodos de vigencia de hábitos mantenidos por triggers"
```

---

### Task 2: Dominio con `periods`

**Files:**
- Modify: `packages/shared/src/domain/dashboard.ts` (`HabitRow`, `vigente`)
- Modify: `packages/shared/src/domain/dashboard.test.ts`

- [ ] **Step 1: Tests (fallarán)**

En `dashboard.test.ts`, sustituye el helper `habit` (deja `at` igual) por:

```ts
const per = (desde: string, hasta: string | null = null) => ({ desde, hasta });
const habit = (id: string, o: Partial<HabitRow> = {}): HabitRow => ({
  id,
  nombre: id,
  slot: 'manana',
  position: 1,
  periods: [per(at(2026, 9, 1))],
  ...o,
});
```

Reescribe cada uso de `createdAt`/`archivedAt` en ese archivo como `periods`, conservando el significado:
- `{ createdAt: at(C) }` pasa a `{ periods: [per(at(C))] }`.
- `{ archivedAt: at(A) }` (creado el 1 de septiembre por defecto) pasa a `{ periods: [per(at(2026, 9, 1), at(A))] }`.
- `{ createdAt: at(C), archivedAt: at(A) }` pasa a `{ periods: [per(at(C), at(A))] }`.

Añade dentro de `describe('vigencia de hábitos')`:

```ts
  it('con dos periodos el hábito no es vigente en el hueco', () => {
    const x = habit('x', { periods: [per(at(2026, 9, 1), at(2026, 9, 10)), per(at(2026, 9, 20))] });
    expect(habitsOn([x], '2026-09-09')).toEqual([x]);
    expect(habitsOn([x], '2026-09-15')).toEqual([]);
    expect(habitsOn([x], '2026-09-20')).toEqual([x]);
  });

  it('archivar y reactivar el mismo día no infla la racha', () => {
    // ayer solo se hizo "a"; "b" se archivó y reactivó hoy → ayer sigue incompleto
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('b', { periods: [per(at(2026, 9, 1), at(2026, 10, 1)), per(at(2026, 10, 1))] })],
      doneLogs: logs([['a', '2026-09-30']]),
    });
    expect(t.habits.streak).toBe(0);
    expect(Object.values(t.habits.porFranja).flat().map((h) => h.id)).toEqual(['a', 'b']);
  });
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm --filter @sb/shared exec vitest run src/domain/dashboard.test.ts`
Expected: FAIL (tipos y vigencia).

- [ ] **Step 3: Implementar**

En `dashboard.ts`, sustituye `interface HabitRow` por:

```ts
/** Periodo de vigencia (timestamps ISO). `hasta` null = sigue activo. */
export interface HabitPeriod {
  desde: string;
  hasta: string | null;
}

export interface HabitRow {
  id: string;
  nombre: string;
  slot: HabitSlot;
  position: number;
  /** Cuenta los días locales cubiertos por algún periodo */
  periods: HabitPeriod[];
}
```

y `vigente` por:

```ts
const vigente = (h: HabitRow, fecha: string) =>
  h.periods.some((p) => toISO(new Date(p.desde)) <= fecha && (p.hasta == null || toISO(new Date(p.hasta)) > fecha));
```

Actualiza el comentario de `habitsOn` a `/** Hábitos vigentes en \`fecha\` (día local): algún periodo cubre ese día. */`.

- [ ] **Step 4: Pasan**

Run: `pnpm test && pnpm --filter @sb/shared typecheck`
Expected: PASS (50 tests). El typecheck de `apps/web` fallará en `api.ts` hasta la Task 3.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain
git commit -m "shared: vigencia de hábitos por periodos"
```

---

### Task 3: API con periodos + docs

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`loadDashboard`, `reactivateHabit`)
- Modify: `CLAUDE.md`, `docs/DATA-MODEL.md`

- [ ] **Step 1: API**

En `loadDashboard`, la consulta de hábitos pasa a ser:

```ts
    sb.from('habits').select('id, nombre, slot, position, periods:habit_periods(desde, hasta)').order('position'),
```

y su mapeo a:

```ts
    habits: must(habits).map((h) => ({
      id: h.id,
      nombre: h.nombre,
      slot: h.slot as HabitSlot,
      position: Number(h.position),
      periods: (h.periods ?? []).map((p: Row) => ({ desde: p.desde, hasta: p.hasta })),
    })),
```

Sustituye `reactivateHabit` (y su JSDoc) por:

```ts
  /** El trigger habits_sync_periods abre un periodo nuevo; el historial anterior se conserva. */
  reactivateHabit: async (id: string) => {
    must(await sb.from('habits').update({ archived_at: null }).eq('id', id));
  },
```

- [ ] **Step 2: Docs**

En `CLAUDE.md`:
- Cambia "Hay tres reglas en **triggers**" por "Hay cuatro reglas en **triggers**" y añade a la enumeración `; y archivar o reactivar un hábito cierra o abre su periodo en \`habit_periods\` (\`habits_sync_periods\`)`.
- En la regla de **Racha**, cambia `(\`habitsOn\`: creados hasta ese día y no archivados)` por `(\`habitsOn\`: algún periodo de \`habit_periods\` cubre ese día)`.
- En la regla de **Hábitos**, cambia `Reactivar pone \`created_at = now()\`: cuenta como nuevo desde hoy.` por `Reactivar pone \`archived_at = null\` y el trigger abre un periodo nuevo: el historial previo se conserva.`

En `docs/DATA-MODEL.md`:
- En el diagrama, añade la relación `habits ||--o{ habit_periods : vigencia` junto a las demás de `habits`.
- Añade la entidad:

```
  habit_periods {
    uuid id PK
    uuid habit_id FK
    timestamptz desde
    timestamptz hasta "null = abierto"
  }
```

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts CLAUDE.md docs/DATA-MODEL.md
git commit -m "web: hábitos con periodos de vigencia; reactivar conserva el historial"
```

---

### Verificación final (controlador)

- `pnpm db:push:dev`. Comprueba en dev que cada hábito tiene su periodo.
- Repite en Chrome, contra el Supabase local, el flujo crear, editar, archivar, reactivar y eliminar. La racha debe mantenerse en 5. Además: archivar y reactivar el mismo día no cambia la racha, y tras eliminar no quedan periodos huérfanos.
