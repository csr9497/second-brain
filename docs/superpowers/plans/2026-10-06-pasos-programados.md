# Pasos con fecha y duración — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los pasos de una tarea tengan una fecha de inicio y una duración en días, con su rango calculado, un aviso cuando queden fuera del plazo de la tarea y un atajo para encadenarlos.

**Architecture:**
- **Base de datos:** dos columnas opcionales y nuevas en `steps`, con CHECK.
- **Lógica:** pura en `packages/shared/src/domain/pasos.ts`.
- **API:** mapeo de los campos nuevos y un `updateStep` general.
- **UI:** el modal de tarea edita la programación y la lista la muestra.

**Tech Stack:** Postgres/pgTAP, Zod 4/vitest, React 19.

**Spec:** `docs/superpowers/specs/2026-10-06-pasos-programados-design.md`

**Commits:** van en la rama `feat/entregable-2`. Cada mensaje termina con una línea en blanco y `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Migración `steps_programacion` + pgTAP

**Files:** crear `supabase/migrations/<ts>_steps_programacion.sql` y modificar `supabase/tests/database/rls_and_triggers.test.sql`.

- [ ] **Step 1: pgTAP (fallarán).** Cambia `select plan(35);` por `select plan(38);` y añade, justo antes de `-- ---------- Como B ----------`:

```sql
-- Pasos programados: fecha y días van juntos, duración ≥ 1
select throws_ok($$ update public.steps set start_date = '2026-10-06' where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  '23514', null, 'fecha de paso sin días viola el CHECK');
select throws_ok($$ update public.steps set start_date = '2026-10-06', duracion_dias = 0 where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  '23514', null, 'duración 0 viola el CHECK');
select lives_ok($$ update public.steps set start_date = '2026-10-06', duracion_dias = 2 where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  'un paso con fecha y días es válido');
```

- [ ] **Step 2: ver el fallo.** Run: `supabase test db`. Expected: FAIL, porque la columna no existe.

- [ ] **Step 3: migración.** Run: `supabase migration new steps_programacion` (aislado) y escribe:

```sql
-- Pasos programados: fecha de inicio + duración en días (fin = inicio + días - 1).
-- Ambos opcionales, pero juntos. Sin programar, el paso no aparece en el Gantt.
alter table public.steps
  add column start_date date,
  add column duracion_dias int,
  add constraint steps_programacion_completa check ((start_date is null) = (duracion_dias is null)),
  add constraint steps_duracion_positiva check (duracion_dias is null or duracion_dias >= 1);
```

- [ ] **Step 4: comprobar.** Run: `pnpm db:reset` (aislado) y luego `supabase test db`. Expected: PASS con 38 tests.

- [ ] **Step 5: Commit.** `git add supabase/` y commit con el mensaje `DB: pasos con fecha de inicio y duración en días`.

---

### Task 2: Esquemas y lógica de pasos (`packages/shared`)

**Files:**
- Modificar `packages/shared/src/index.ts`.
- Crear `packages/shared/src/domain/pasos.ts` y `packages/shared/src/domain/pasos.test.ts`.
- Modificar `packages/shared/src/schemas.test.ts`.

- [ ] **Step 1: tests (fallarán).** Crea `pasos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encadenar, finPaso, fueraDePlazo } from './pasos';

const p = (startDate: string | null, duracionDias: number | null) => ({ startDate, duracionDias });

describe('finPaso', () => {
  it('un día termina el mismo día', () => expect(finPaso(p('2026-10-06', 1))).toBe('2026-10-06'));
  it('varios días', () => expect(finPaso(p('2026-10-06', 3))).toBe('2026-10-08'));
  it('sin programar', () => expect(finPaso(p(null, null))).toBeNull());
});

describe('fueraDePlazo', () => {
  const tarea = { startDate: '2026-10-05', deadline: '2026-10-09' };
  it('dentro del plazo', () => expect(fueraDePlazo(p('2026-10-06', 3), tarea)).toBe(false));
  it('termina después del deadline', () => expect(fueraDePlazo(p('2026-10-08', 3), tarea)).toBe(true));
  it('empieza antes del inicio', () => expect(fueraDePlazo(p('2026-10-04', 1), tarea)).toBe(true));
  it('tarea sin fechas', () => expect(fueraDePlazo(p('2026-01-01', 99), { startDate: null, deadline: null })).toBe(false));
  it('paso sin programar', () => expect(fueraDePlazo(p(null, null), tarea)).toBe(false));
});

describe('encadenar', () => {
  it('cada paso empieza el día siguiente al fin del anterior (duración 1 por defecto)', () => {
    const r = encadenar([{ t: 'a', ...p(null, 2) }, { t: 'b', ...p(null, null) }, { t: 'c', ...p('2026-01-01', 3) }], '2026-10-06');
    expect(r.map((x) => [x.t, x.startDate, x.duracionDias])).toEqual([
      ['a', '2026-10-06', 2],
      ['b', '2026-10-08', 1],
      ['c', '2026-10-09', 3],
    ]);
  });
});
```

En `schemas.test.ts`, añade `createTaskInput` y `updateStepInput` al import de `./index` y agrega al final:

```ts
describe('pasos programados', () => {
  it('createTaskInput acepta pasos con fecha y días', () =>
    expect(createTaskInput.parse({ title: 't', steps: [{ title: 'p', startDate: '2026-10-06', duracionDias: 2 }] }).steps[0]).toEqual({
      title: 'p',
      startDate: '2026-10-06',
      duracionDias: 2,
    }));
  it('createTaskInput rechaza duración 0', () =>
    expect(() => createTaskInput.parse({ title: 't', steps: [{ title: 'p', startDate: '2026-10-06', duracionDias: 0 }] })).toThrow());
  it('updateStepInput vacío falla', () => expect(() => updateStepInput.parse({})).toThrow());
  it('updateStepInput permite desprogramar', () =>
    expect(updateStepInput.parse({ startDate: null, duracionDias: null })).toEqual({ startDate: null, duracionDias: null }));
});
```

- [ ] **Step 2: ver el fallo.** Run: `pnpm --filter @sb/shared exec vitest run src/domain/pasos.test.ts src/schemas.test.ts`. Expected: FAIL.

- [ ] **Step 3: implementar.**

En `index.ts`:
- `createTaskInput.steps` pasa a ser `z.array(stepFields).default([])`.
- Antes de `taskFields`, define:

```ts
// Programación de un paso: fecha de inicio + duración en días (ambos o ninguno; lo garantiza el CHECK de la DB)
const stepFields = z.object({
  title: z.string().trim().min(1),
  startDate: isoDate.nullish(),
  duracionDias: z.number().int().min(1).nullish(),
});
```

- Después de `createStepInput`, añade:

```ts
export const updateStepInput = stepFields.partial().refine(nonEmpty, 'Nada que actualizar');
export type UpdateStepInput = z.input<typeof updateStepInput>;
```

`nonEmpty` se declara más abajo en el archivo. Si TypeScript se queja de usarlo antes de declararlo, muévelo encima de `updateStepInput`.

- En `interface Step`, añade `startDate: string | null;` y `duracionDias: number | null;` después de `done`.
- Añade `export * from './domain/pasos';` junto a los demás `export * from './domain/…'`.

Crea `packages/shared/src/domain/pasos.ts`:

```ts
// Programación de los pasos de una tarea (días locales, fechas ISO 'YYYY-MM-DD').
import { addDays } from './dates';

type Programable = { startDate: string | null; duracionDias: number | null };

/** Último día del paso (inicio + días − 1), o null si no está programado. */
export const finPaso = (p: Programable) => (p.startDate && p.duracionDias ? addDays(p.startDate, p.duracionDias - 1) : null);

/** El paso empieza antes del inicio de la tarea o termina después de su deadline (lados sin fecha no cuentan). */
export function fueraDePlazo(p: Programable, tarea: { startDate: string | null; deadline: string | null }) {
  const fin = finPaso(p);
  if (!p.startDate || !fin) return false;
  return (tarea.startDate != null && p.startDate < tarea.startDate) || (tarea.deadline != null && fin > tarea.deadline);
}

/** Fechas seguidas desde `desde`: cada paso empieza el día siguiente al fin del anterior (duración 1 si no tiene). */
export function encadenar<T extends Programable>(pasos: T[], desde: string): T[] {
  let inicio = desde;
  return pasos.map((p) => {
    const duracionDias = p.duracionDias ?? 1;
    const r = { ...p, startDate: inicio, duracionDias };
    inicio = addDays(inicio, duracionDias);
    return r;
  });
}
```

- [ ] **Step 4: comprobar.** Run: `pnpm --filter @sb/shared test && pnpm --filter @sb/shared typecheck`. Expected: PASS. Si `apps/web` falla en `toTask` porque `Step` exige los campos nuevos, es lo esperado: se arregla en la Task 3.

- [ ] **Step 5: Commit.** Commit con el mensaje `shared: programación de pasos (fin, fuera de plazo, encadenar)`.

---

### Task 3: API de pasos

**Files:** modificar `apps/web/src/lib/api.ts`.

- [ ] **Step 1: implementar.**
- En `toTask`, el mapeo de cada paso añade `startDate: s.start_date` y `duracionDias: s.duracion_dias`.
- En `createTask`, el insert de pasos pasa a ser:

```ts
      must(
        await sb.from('steps').insert(
          steps.map((s, i) => ({
            task_id: task.id,
            title: s.title,
            start_date: s.startDate ?? null,
            duracion_dias: s.duracionDias ?? null,
            position: (i + 1) * 1000,
          })),
        ),
      );
```

- `addStep` pasa a ser:

```ts
  addStep: async (taskId: string, step: { title: string; startDate?: string | null; duracionDias?: number | null }) => {
    const position = positionBetween(await maxPosition('steps', taskId), null);
    must(
      await sb
        .from('steps')
        .insert({ task_id: taskId, title: step.title, start_date: step.startDate ?? null, duracion_dias: step.duracionDias ?? null, position }),
    );
  },
```

- `renameStep` se sustituye por:

```ts
  /** Título y/o programación del paso; solo escribe los campos definidos. */
  updateStep: async (id: string, patch: UpdateStepInput) => {
    const { title, startDate, duracionDias } = updateStepInput.parse(patch);
    const cols = Object.fromEntries(
      Object.entries({ title, start_date: startDate, duracion_dias: duracionDias }).filter(([, v]) => v !== undefined),
    );
    must(await sb.from('steps').update(cols).eq('id', id));
  },
```

- Añade `updateStepInput` y `type UpdateStepInput` al import de `@sb/shared`.

- [ ] **Step 2: comprobar.** Run: `pnpm --filter @sb/web typecheck`. Expected: solo falla `TaskModal.tsx`, porque todavía usa `renameStep` y `addStep` con un string. Se arregla en la Task 4.

- [ ] **Step 3: Commit.** Commit con el mensaje `web: API de pasos con programación (updateStep)`.

---

### Task 4: Programación de pasos en `TaskModal`

**Files:**
- Modificar `apps/web/src/components/TaskModal.tsx`.
- Modificar `apps/web/src/lib/format.ts` (helper de rango).

- [ ] **Step 1: helper de rango.** En `format.ts`, importa `finPaso` desde `@sb/shared` y añade:

```ts
/** "6 oct → 8 oct" (o "6 oct" si dura un día); null si el paso no está programado. */
export function rangoPaso(p: { startDate: string | null; duracionDias: number | null }) {
  const fin = finPaso(p);
  if (!p.startDate || !fin) return null;
  return fin === p.startDate ? shortDate(p.startDate) : `${shortDate(p.startDate)} → ${shortDate(fin)}`;
}
```

- [ ] **Step 2: modal.**

**Borradores**
- `StepDraft` pasa a ser `{ id?: string; title: string; startDate: string; dias: string }`. Los campos del formulario son strings y `''` significa vacío.
- El estado inicial mapea `startDate: s.startDate ?? ''` y `dias: s.duracionDias ? String(s.duracionDias) : ''`.
- Los pasos nuevos empiezan como `{ title: '', startDate: '', dias: '' }`.

**Normalización**, en una función del módulo:

```ts
/** Borrador → programación: con fecha y sin días se usa 1; días redondeados, mínimo 1; sin fecha, nada. */
function programacion(s: StepDraft) {
  if (!s.startDate) return { startDate: null, duracionDias: null };
  const n = Math.round(Number(s.dias));
  return { startDate: s.startDate, duracionDias: Number.isFinite(n) && n >= 1 ? n : 1 };
}
```

**Guardar**
- **Al crear:** `steps.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), ...programacion(s) }))`.
- **Al editar:**
  - Borra los pasos quitados, igual que ahora.
  - Para cada paso que se conserva, compara título y programación con el original (`s.title`, `s.startDate` y `s.duracionDias` del `task.steps` que corresponde). Si algo cambió, llama a `api.updateStep(id, { title, ...programacion(draft) })`.
  - Los pasos nuevos se crean con `api.addStep(task.id, { title, ...programacion(draft) })`.

**Render de cada paso.** Sustituye la fila actual por:

```tsx
              <div key={s.id ?? `new-${i}`} className="flex flex-col gap-1.5 rounded-lg border border-line p-2">
                <div className="flex items-center gap-[7px]">
                  <input
                    className="input flex-1"
                    value={s.title}
                    placeholder={i === 0 ? 'Primer paso' : 'Otro paso…'}
                    onChange={(e) => setStep(i, { title: e.target.value })}
                  />
                  <button type="button" title="Quitar paso" className="text-base text-faint" onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    aria-label={`Inicio del paso ${i + 1}`}
                    className="input w-auto py-1 text-[13px]"
                    value={s.startDate}
                    onChange={(e) => setStep(i, { startDate: e.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    aria-label={`Días del paso ${i + 1}`}
                    placeholder="días"
                    className="input w-20 py-1 text-[13px]"
                    value={s.dias}
                    onChange={(e) => setStep(i, { dias: e.target.value })}
                  />
                  {rangoPaso(programacion(s)) && <span className="text-xs text-muted">{rangoPaso(programacion(s))}</span>}
                  {fueraDePlazo(programacion(s), { startDate: form.startDate || null, deadline: form.deadline || null }) && (
                    <span className="rounded-full bg-hot/15 px-2 py-0.5 text-[11px] font-semibold text-hot">fuera de plazo</span>
                  )}
                </div>
              </div>
```

Con el helper `const setStep = (i: number, patch: Partial<StepDraft>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));`.

**Encadenar.** Junto a "+ Añadir paso", en un contenedor `flex flex-wrap gap-2`, va el botón:

```tsx
          <button
            type="button"
            disabled={!steps.some((s) => s.title.trim())}
            onClick={() => {
              const desde = form.startDate || todayISO();
              const conTitulo = steps.filter((s) => s.title.trim());
              const encadenados = encadenar(conTitulo.map((s) => ({ ...s, ...programacion(s) })), desde);
              let k = 0;
              setSteps((xs) =>
                xs.map((x) => {
                  if (!x.title.trim()) return x;
                  const e = encadenados[k++];
                  return { ...x, startDate: e.startDate!, dias: String(e.duracionDias) };
                }),
              );
            }}
            className="rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted disabled:opacity-40"
          >
            ⛓ Encadenar pasos
          </button>
```

**Imports nuevos:** `encadenar`, `fueraDePlazo` y `todayISO` desde `@sb/shared`, y `rangoPaso` desde `../lib/format`.

- [ ] **Step 3: comprobar.** Run: `pnpm typecheck && pnpm test && pnpm build`. Expected: PASS en todo.

- [ ] **Step 4: Commit.** Commit con el mensaje `web: programar pasos en el modal de tarea (fecha, días, encadenar, fuera de plazo)`.

---

### Task 5: Rango de los pasos en la lista

**Files:** modificar `apps/web/src/components/Tasks.tsx`.

- [ ] **Step 1: implementar.** Importa `fueraDePlazo` desde `@sb/shared` y `rangoPaso` desde `../lib/format`. En la lista de pasos (`task.steps.map`), después del `<span>` con el título, añade:

```tsx
                {rangoPaso(s) && <span className="text-[11px] text-faint">{rangoPaso(s)}</span>}
                {fueraDePlazo(s, task) && <span className="rounded-full bg-hot/15 px-1.5 text-[10.5px] font-semibold text-hot">fuera de plazo</span>}
```

- [ ] **Step 2: comprobar.** Run: `pnpm typecheck && pnpm build`. Expected: PASS.

- [ ] **Step 3: Commit.** Commit con el mensaje `web: la lista de tareas muestra el rango de cada paso`.

---

### Task 6 (controlador): docs, dev y verificación

- [ ] **Docs:** añade a `docs/DATA-MODEL.md` (entidad `steps`) las columnas `date start_date` y `int duracion_dias "fin = inicio + días - 1"`. En `CLAUDE.md`, en la sección de reglas de dominio, añade una línea sobre los pasos programados (fin inclusivo, fuera de plazo con aviso, ambos campos o ninguno).
- [ ] **Dev:** ejecuta `pnpm db:push:dev`.
- [ ] **Chrome (local):**
  1. Crea una tarea con deadline y tres pasos y pulsa "Encadenar pasos". Comprueba las fechas seguidas.
  2. Alarga el último paso hasta pasar el deadline y comprueba que aparece "fuera de plazo".
  3. Guarda, reabre y comprueba que todo persiste.
  4. En la lista, comprueba que se ve el rango de cada paso.
  5. Revisa el ancho de 375 px y que no haya errores en la consola.
