# Selects con dot de color — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir todos los `<select>` nativos por un `<Select>` con un dot de color por opción, y dar a cada proyecto un color elegible.

**Architecture:**
- Una paleta fija de 8 claves (`paletteColor`) vive en `packages/shared`, junto con los mapas enum→color.
- La base guarda la clave en `projects.color`, protegida con un CHECK.
- En la web, cada clave es un token CSS `--c-<clave>` (claro y oscuro), que pintan `Dot`, `Select` (sobre Radix) y `ColorPicker`.

**Tech Stack:**
- Supabase/Postgres (migración + pgTAP).
- Zod 4 + vitest (`packages/shared`).
- React 19, Tailwind v4 y `@radix-ui/react-select` (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-10-05-select-colores-design.md`

**Commits:** se hacen en la rama `feat/entregable-2`, y cada mensaje termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/<ts>_projects_color.sql` | crear | Columna `color` + CHECK |
| `supabase/tests/database/rls_and_triggers.test.sql` | modificar | 2 asserts del CHECK y del default |
| `supabase/seed.sql` | modificar | Color distinto para cada proyecto demo |
| `packages/shared/src/index.ts` | modificar | `paletteColor`, `color` en `projectFields`, `createProjectInput` y `Project` |
| `packages/shared/src/colors.ts` | crear | Mapas enum → `PaletteColor` |
| `packages/shared/src/colors.test.ts` | crear | Cobertura de los mapas |
| `packages/shared/src/schemas.test.ts` | modificar | Default y validación de `color` |
| `packages/shared/src/domain/dashboard.ts` | modificar | `ProjectRow.color`, `projectViews` lo propaga |
| `packages/shared/src/domain/dashboard.test.ts` | modificar | Helper `project()` con `color` |
| `apps/web/src/lib/api.ts` | modificar | Leer y escribir `color` |
| `apps/web/src/index.css` | modificar | Tokens `--c-*` en los 3 bloques de tema |
| `apps/web/src/lib/options.ts` | crear | Opciones (label + color) de cada enum |
| `apps/web/src/components/ui/Dot.tsx` | crear | Círculo de color |
| `apps/web/src/components/ui/Select.tsx` | crear | Select de Radix con dots |
| `apps/web/src/components/ui/ColorPicker.tsx` | crear | Radiogroup de la paleta |
| `apps/web/src/components/Modal.tsx` | modificar | Esc respeta `defaultPrevented` |
| `apps/web/src/components/TaskModal.tsx` | modificar | 4 selects → `<Select>` |
| `apps/web/src/components/ProjectModal.tsx` | modificar | 2 selects → `<Select>` + `ColorPicker` |
| `docs/DATA-MODEL.md` | modificar | Documentar `projects.color` |

Preparación: el Supabase local debe estar arriba. Si `supabase status` falla, ejecuta `pnpm db:start`.

---

### Task 1: Migración `projects.color` + pgTAP + seed

**Files:**
- Create: `supabase/migrations/<timestamp>_projects_color.sql`, generado por la CLI
- Modify: `supabase/tests/database/rls_and_triggers.test.sql`
- Modify: `supabase/seed.sql:37-45`

- [ ] **Step 1: Escribir los tests pgTAP (fallarán)**

En `rls_and_triggers.test.sql`, cambia `select plan(13);` por `select plan(15);`. Luego, justo antes de la línea `-- ---------- Como B ----------`, añade:

```sql
-- Color de proyecto: paleta fija con default
select is((select color from public.projects where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'azul',
  'un proyecto sin color queda en azul');
select throws_ok(
  $$ insert into public.projects (nombre, color) values ('Proyecto fucsia', 'fucsia') $$,
  '23514', null, 'color fuera de la paleta viola el CHECK');
```

- [ ] **Step 2: Comprobar que fallan**

Run: `supabase test db`
Expected: FAIL. La columna `color` no existe y aparece el error `column "color" does not exist`.

- [ ] **Step 3: Crear la migración**

Run: `supabase migration new projects_color`

Escribe en el archivo generado (`supabase/migrations/<timestamp>_projects_color.sql`):

```sql
-- Color del proyecto: clave de una paleta fija (los hex viven en apps/web/src/index.css).
-- Debe coincidir con `paletteColor` de packages/shared.
alter table public.projects
  add column color text not null default 'azul'
  check (color in ('azul','verde','ambar','rojo','violeta','rosa','cian','gris'));
```

- [ ] **Step 4: Colores en el seed**

En `supabase/seed.sql`, añade `color` a los 3 inserts de proyectos:

```sql
  insert into public.projects (user_id, nombre, next_action, schedule_days, total_progress, prioridad, color)
    values (uid, 'Preparación rol Node.js (NTT)', 'Repasar AWS serverless', jsonb_build_array(dow, (dow + 2) % 7), 40, 'alta', 'azul')
    returning id into p_ntt;
  insert into public.projects (user_id, nombre, next_action, schedule_days, total_progress, color)
    values (uid, 'Roadmap DevOps → MLOps', 'Módulo Docker/K8s', jsonb_build_array(dow, (dow + 3) % 7), 15, 'cian')
    returning id into p_devops;
  insert into public.projects (user_id, nombre, next_action, schedule_days, total_progress, color)
    values (uid, 'Tesis — definir tema', 'Validar dirección GNN con el asesor', jsonb_build_array((dow + 1) % 7), 20, 'violeta')
    returning id into p_tesis;
```

- [ ] **Step 5: Recrear la DB y pasar los tests**

Run: `pnpm db:reset && supabase test db`
Expected: `All tests successful`, 15 asserts.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "DB: color por proyecto con paleta fija"
```

---

### Task 2: `paletteColor` y `color` en los esquemas de proyecto

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Tests que fallan**

En `schemas.test.ts`, cambia el import por:

```ts
import { createProjectInput, updateProjectInput, updateTaskInput } from './index';
```

y añade al final:

```ts
describe('color de proyecto', () => {
  it('createProjectInput usa azul por defecto', () => expect(createProjectInput.parse({ nombre: 'x' }).color).toBe('azul'));
  it('rechaza colores fuera de la paleta', () => expect(() => createProjectInput.parse({ nombre: 'x', color: 'fucsia' })).toThrow());
  it('updateProjectInput no rellena color', () => expect(updateProjectInput.parse({ nombre: 'x' })).not.toHaveProperty('color'));
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm --filter @sb/shared exec vitest run src/schemas.test.ts`
Expected: FAIL. `color` es `undefined` y no lanza con `'fucsia'`.

- [ ] **Step 3: Implementar**

En `packages/shared/src/index.ts`:

Después de `export const taskFilter = …`, añade:

```ts
// Paleta fija de colores; la DB guarda la clave (CHECK en projects.color)
export const paletteColor = z.enum(['azul', 'verde', 'ambar', 'rojo', 'violeta', 'rosa', 'cian', 'gris']);
```

Después de `export type TaskFilter = …`, añade:

```ts
export type PaletteColor = z.infer<typeof paletteColor>;
export type TaskType = z.infer<typeof taskType>;
export type ProjectStatus = z.infer<typeof projectStatus>;
```

En `projectFields`, añade `color: paletteColor,` después de `totalProgress`. En `createProjectInput`, añade `color: paletteColor.default('azul'),` después de `totalProgress: …`.

- [ ] **Step 4: Pasan los tests**

Run: `pnpm --filter @sb/shared exec vitest run src/schemas.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/schemas.test.ts
git commit -m "shared: paleta de colores y color en proyectos"
```

---

### Task 3: Mapas enum → color

**Files:**
- Create: `packages/shared/src/colors.ts`
- Create: `packages/shared/src/colors.test.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

- [ ] **Step 1: Test que falla**

`packages/shared/src/colors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { habitSlot, paletteColor, priority, projectStatus, taskStatus, taskType } from './index';
import { PRIORITY_COLOR, PROJECT_STATUS_COLOR, SLOT_COLOR, TASK_STATUS_COLOR, TASK_TYPE_COLOR } from './colors';

// Cada valor de cada enum tiene un color de la paleta (y nada sobra)
const cases = [
  ['priority', priority.options, PRIORITY_COLOR],
  ['taskStatus', taskStatus.options, TASK_STATUS_COLOR],
  ['projectStatus', projectStatus.options, PROJECT_STATUS_COLOR],
  ['taskType', taskType.options, TASK_TYPE_COLOR],
  ['habitSlot', habitSlot.options, SLOT_COLOR],
] as const;

describe('colores de enums', () => {
  it.each(cases)('%s cubre todas sus opciones con colores de la paleta', (_, options, map) => {
    expect(Object.keys(map).sort()).toEqual([...options].sort());
    for (const c of Object.values(map)) expect(paletteColor.options).toContain(c);
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `pnpm --filter @sb/shared exec vitest run src/colors.test.ts`
Expected: FAIL con `Failed to resolve import "./colors"`.

- [ ] **Step 3: Implementar**

`packages/shared/src/colors.ts`:

```ts
import type { HabitSlot, PaletteColor, Priority, ProjectStatus, TaskStatus, TaskType } from './index';

// Colores de los enums fijos. `Record` obliga a asignar color a cada valor nuevo.
export const PRIORITY_COLOR: Record<Priority, PaletteColor> = { alta: 'rojo', media: 'ambar', baja: 'gris' };

export const TASK_STATUS_COLOR: Record<TaskStatus, PaletteColor> = { por_hacer: 'gris', en_curso: 'azul', hecha: 'verde' };

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, PaletteColor> = {
  idea: 'violeta',
  en_curso: 'azul',
  en_pausa: 'ambar',
  completado: 'verde',
  archivado: 'gris',
};

export const TASK_TYPE_COLOR: Record<TaskType, PaletteColor> = {
  Estudio: 'azul',
  Trabajo: 'ambar',
  Tesis: 'violeta',
  Personal: 'verde',
  Revisión: 'cian',
};

export const SLOT_COLOR: Record<HabitSlot, PaletteColor> = { manana: 'ambar', tarde: 'rojo', noche: 'violeta' };
```

Al final de `packages/shared/src/index.ts`, después de los `export * from './domain/…'`, añade:

```ts
export * from './colors';
```

- [ ] **Step 4: Pasa el test**

Run: `pnpm --filter @sb/shared exec vitest run src/colors.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/colors.ts packages/shared/src/colors.test.ts packages/shared/src/index.ts
git commit -m "shared: colores de prioridad, estados, tipo y franja"
```

---

### Task 4: `color` en `ProjectRow`, `projectViews` y `api.ts`

**Files:**
- Modify: `packages/shared/src/index.ts` (`interface Project`)
- Modify: `packages/shared/src/domain/dashboard.ts:15-24` y `:52-63`
- Modify: `packages/shared/src/domain/dashboard.test.ts:13-23`
- Modify: `apps/web/src/lib/api.ts:80-89` y `:106-116`

- [ ] **Step 1: Test que falla**

En `dashboard.test.ts`, añade `color: 'azul',` al helper `project()`, después de `totalProgress: 0,`. Añade `projectViews` al import de `./dashboard` y pon al final del archivo:

```ts
describe('projectViews', () => {
  it('projectViews propaga el color del proyecto', () => {
  const [p] = projectViews([project('p1', { color: 'violeta' })], [], '2026-10-05');
  expect(p.color).toBe('violeta');
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `pnpm --filter @sb/shared exec vitest run src/domain/dashboard.test.ts -t "color"`
Expected: FAIL (`expected undefined to be 'violeta'`). Typecheck también falla porque `ProjectRow` no tiene `color`.

- [ ] **Step 3: Implementar**

En `packages/shared/src/index.ts`, `interface Project` gana `color: PaletteColor;` después de `totalProgress: number;`.

En `dashboard.ts`, `interface ProjectRow` gana `color: PaletteColor;` después de `totalProgress`, y el import de tipos de `'../index'` incluye `PaletteColor`. En `projectViews`, añade `color: p.color,` después de `totalProgress: p.totalProgress,`.

En `apps/web/src/lib/api.ts`:
- en `toProjectRow`, añade `color: r.color ?? 'azul',` después de `totalProgress`;
- en `projectColumns`, añade `color: p.color,` después de `total_progress: p.totalProgress,`.

- [ ] **Step 4: Tests y typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: todo PASS. Si `pnpm typecheck` falla en `ProjectModal.tsx` porque el form inicial no tiene `color`, está previsto: se arregla en la Task 9. Para que este commit compile, añade ya `color: project?.color ?? 'azul',` al `useState` del form de `ProjectModal` (después de `totalProgress`).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src apps/web/src/lib/api.ts apps/web/src/components/ProjectModal.tsx
git commit -m "Proyectos: leer y guardar color"
```

---

### Task 5: Tokens de color y `Dot`

**Files:**
- Modify: `apps/web/src/index.css:4-24`
- Create: `apps/web/src/components/ui/Dot.tsx`

- [ ] **Step 1: Tokens**

En `index.css`, añade esta línea al bloque `:root { … }` de tema oscuro, después de la línea de `--accent`:

```css
  --c-azul: #7c9cff; --c-verde: #7bc86c; --c-ambar: #e6b450; --c-rojo: #e2725b;
  --c-violeta: #b48cf2; --c-rosa: #e57fb0; --c-cian: #5cc6d0; --c-gris: #8a867f;
```

Y en los **dos** bloques de tema claro (`@media (prefers-color-scheme: light) :root:not([data-theme='dark'])` y `:root[data-theme='light']`):

```css
  --c-azul: #3d5bd6; --c-verde: #3b7d2c; --c-ambar: #a5751a; --c-rojo: #b8442e;
  --c-violeta: #7a4fc9; --c-rosa: #b8407a; --c-cian: #1d8691; --c-gris: #8a857c;
```

`azul`, `verde`, `ambar` y `rojo` coinciden con `--accent`, `--good`, `--warn` y `--hot` de cada tema.

- [ ] **Step 2: `Dot`**

`apps/web/src/components/ui/Dot.tsx`:

```tsx
import type { PaletteColor } from '@sb/shared';

/** Círculo de color de la paleta (tokens --c-* de index.css). */
export function Dot({ color, size = 8 }: { color: PaletteColor; size?: number }) {
  return <span aria-hidden className="inline-block flex-none rounded-full" style={{ width: size, height: size, background: `var(--c-${color})` }} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/index.css apps/web/src/components/ui/Dot.tsx
git commit -m "web: tokens de la paleta y componente Dot"
```

---

### Task 6: `Select` sobre Radix + Esc del modal

**Files:**
- Modify: `apps/web/package.json` (dependencia)
- Create: `apps/web/src/components/ui/Select.tsx`
- Modify: `apps/web/src/components/Modal.tsx:5`

- [ ] **Step 1: Instalar Radix Select**

Run: `pnpm --filter @sb/web add @radix-ui/react-select`
Expected: se añade `"@radix-ui/react-select": "^2.x"` a `apps/web/package.json` y se actualiza `pnpm-lock.yaml`.

- [ ] **Step 2: Componente**

`apps/web/src/components/ui/Select.tsx`:

```tsx
import * as RS from '@radix-ui/react-select';
import type { PaletteColor } from '@sb/shared';
import { Dot } from './Dot';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  color?: PaletteColor;
}

// Radix no admite value="" en un Item: la opción vacía usa este centinela
const NONE = '__none__';
const toRadix = (v: string) => (v === '' ? NONE : v);

/** Select accesible (Radix) con un dot de color por opción. `''` = opción vacía. */
export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  'aria-label'?: string;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <RS.Root value={toRadix(value)} onValueChange={(v) => onChange((v === NONE ? '' : v) as T)}>
      <RS.Trigger aria-label={ariaLabel} className="input flex items-center gap-2 text-left">
        {selected?.color && <Dot color={selected.color} />}
        <span className="min-w-0 flex-1 truncate">
          <RS.Value placeholder={placeholder} />
        </span>
        <RS.Icon className="text-xs text-faint">▾</RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[11px] border border-line bg-surface p-1 shadow-lg"
        >
          <RS.Viewport>
            {options.map((o) => (
              <RS.Item
                key={toRadix(o.value)}
                value={toRadix(o.value)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-text outline-none select-none data-[highlighted]:bg-surface2"
              >
                {o.color ? <Dot color={o.color} /> : <span className="w-2 flex-none" />}
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator className="ml-auto text-accent">✓</RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
```

- [ ] **Step 3: Esc del modal**

En `Modal.tsx`, cambia la línea del listener:

```ts
    // Radix (Select) cierra su lista con Esc y marca el evento: no cerrar también el modal
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/ui/Select.tsx apps/web/src/components/Modal.tsx
git commit -m "web: Select con dots (Radix) y Esc del modal"
```

---

### Task 7: Opciones de cada enum y `ColorPicker`

**Files:**
- Create: `apps/web/src/lib/options.ts`
- Create: `apps/web/src/components/ui/ColorPicker.tsx`

- [ ] **Step 1: Opciones**

`apps/web/src/lib/options.ts`:

```ts
import {
  PRIORITY_COLOR,
  PROJECT_STATUS_COLOR,
  SLOT_COLOR,
  TASK_STATUS_COLOR,
  TASK_TYPE_COLOR,
  habitSlot,
  priority,
  projectStatus,
  taskStatus,
  taskType,
  type PaletteColor,
} from '@sb/shared';
import type { SelectOption } from '../components/ui/Select';

const PRIORITY_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' } as const;
const TASK_STATUS_LABEL = { por_hacer: 'Por hacer', en_curso: 'En curso', hecha: 'Hecha' } as const;
export const PROJECT_STATUS_LABEL = { idea: 'Idea', en_curso: 'En curso', en_pausa: 'En pausa', completado: 'Completado', archivado: 'Archivado' } as const;
const SLOT_LABEL = { manana: '🌅 Mañana', tarde: '☀️ Tarde', noche: '🌙 Noche' } as const;

export const COLOR_LABEL: Record<PaletteColor, string> = {
  azul: 'Azul',
  verde: 'Verde',
  ambar: 'Ámbar',
  rojo: 'Rojo',
  violeta: 'Violeta',
  rosa: 'Rosa',
  cian: 'Cian',
  gris: 'Gris',
};

export const PRIORITY_OPTIONS = priority.options.map((v) => ({ value: v, label: PRIORITY_LABEL[v], color: PRIORITY_COLOR[v] }));
export const TASK_STATUS_OPTIONS = taskStatus.options.map((v) => ({ value: v, label: TASK_STATUS_LABEL[v], color: TASK_STATUS_COLOR[v] }));
export const PROJECT_STATUS_OPTIONS = projectStatus.options.map((v) => ({ value: v, label: PROJECT_STATUS_LABEL[v], color: PROJECT_STATUS_COLOR[v] }));
export const SLOT_OPTIONS = habitSlot.options.map((v) => ({ value: v, label: SLOT_LABEL[v], color: SLOT_COLOR[v] }));
/** Tipo de tarea, con la opción vacía "—" (la tarea puede no tener tipo). */
export const TASK_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: '—' },
  ...taskType.options.map((v) => ({ value: v, label: v, color: TASK_TYPE_COLOR[v] })),
];
```

- [ ] **Step 2: `ColorPicker`**

`apps/web/src/components/ui/ColorPicker.tsx`:

```tsx
import type { KeyboardEvent } from 'react';
import { paletteColor, type PaletteColor } from '@sb/shared';
import { COLOR_LABEL } from '../../lib/options';

const COLORS = paletteColor.options;

/** Radiogroup de la paleta: clic o flechas para elegir. */
export function ColorPicker({ value, onChange }: { value: PaletteColor; onChange: (c: PaletteColor) => void }) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = COLORS[(COLORS.indexOf(value) + dir + COLORS.length) % COLORS.length];
    onChange(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-color="${next}"]`)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          data-color={c}
          aria-checked={c === value}
          aria-label={COLOR_LABEL[c]}
          title={COLOR_LABEL[c]}
          tabIndex={c === value ? 0 : -1}
          onClick={() => onChange(c)}
          className="size-7 rounded-full ring-offset-2 ring-offset-surface transition aria-checked:ring-2 aria-checked:ring-accent"
          style={{ background: `var(--c-${c})` }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/options.ts apps/web/src/components/ui/ColorPicker.tsx
git commit -m "web: opciones con color por enum y ColorPicker"
```

---

### Task 8: `TaskModal` usa `<Select>`

**Files:**
- Modify: `apps/web/src/components/TaskModal.tsx`

- [ ] **Step 1: Imports y setter por valor**

Cambia los imports de la cabecera:

```tsx
import { type CreateTaskInput, type Task, type TaskStatus } from '@sb/shared';
import { api } from '../lib/api';
import { PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, TASK_TYPE_OPTIONS } from '../lib/options';
import { TODAY_KEY } from '../lib/useToday';
import { ConfirmDelete, Field, Modal, ModalActions } from './Modal';
import { Select, type SelectOption } from './ui/Select';
import { useToast } from './Toast';
```

Debajo de la línea `const set = …`, añade:

```tsx
  const setValue = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const projectOptions: SelectOption[] = [
    { value: '', label: '— Ninguno —' },
    ...(projects.data ?? []).map((p) => ({
      value: p.id,
      label: p.nombre + (p.estado !== 'en_curso' ? ` (${p.estado.replace('_', ' ')})` : ''),
      color: p.color,
    })),
  ];
```

- [ ] **Step 2: Reemplazar los 4 `<select>`**

- **Tipo:** `<Select value={form.type} onChange={setValue('type')} options={TASK_TYPE_OPTIONS} />`
- **Prioridad:** `<Select value={form.priority} onChange={setValue('priority')} options={PRIORITY_OPTIONS} />`
- **Proyecto:** `<Select value={form.projectId} onChange={setValue('projectId')} options={projectOptions} />`
- **Estado:** `<Select value={form.status} onChange={setValue('status')} options={TASK_STATUS_OPTIONS} />`

Cada uno sustituye su bloque `<select className="input" …>…</select>` completo, dentro de su `<Field>`.

- [ ] **Step 3: Verificar que no queda ningún `<select`**

Run: `grep -n "<select" apps/web/src/components/TaskModal.tsx; pnpm typecheck`
Expected: grep sin resultados y typecheck PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/TaskModal.tsx
git commit -m "TaskModal: selects con dot de color"
```

---

### Task 9: `ProjectModal` usa `<Select>` + `ColorPicker`

**Files:**
- Modify: `apps/web/src/components/ProjectModal.tsx`

- [ ] **Step 1: Imports**

Sustituye `import { projectStatus, type Project, type ProjectInput } from '@sb/shared';` por:

```tsx
import { type Project, type ProjectInput } from '@sb/shared';
import { PRIORITY_OPTIONS, PROJECT_STATUS_OPTIONS } from '../lib/options';
import { ColorPicker } from './ui/ColorPicker';
import { Select } from './ui/Select';
```

Borra la constante local `ESTADO_LABEL`, que ya no se usa porque las etiquetas viven en `options.ts`.

- [ ] **Step 2: Reemplazar selects y añadir el color**

- **Estado:** `<Select value={form.estado} onChange={(v) => set('estado', v)} options={PROJECT_STATUS_OPTIONS} />`
- **Prioridad:** `<Select value={form.prioridad} onChange={(v) => set('prioridad', v)} options={PRIORITY_OPTIONS} />`

Después del `</div>` de la rejilla Estado/Prioridad, y antes de "Días de aplicación", añade:

```tsx
        <Field label="Color" group>
          <ColorPicker value={form.color} onChange={(c) => set('color', c)} />
        </Field>
```

Confirma que `useState` ya incluye `color: project?.color ?? 'azul'` (añadido en la Task 4).

- [ ] **Step 3: Sin selects nativos en toda la web**

Run: `grep -rn "<select" apps/web/src; pnpm typecheck && pnpm test`
Expected: grep sin resultados; typecheck y tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ProjectModal.tsx
git commit -m "ProjectModal: selects con dot y selector de color"
```

---

### Task 10: Docs, verificación manual y dev

**Files:**
- Modify: `docs/DATA-MODEL.md` (entidad `projects`)

- [ ] **Step 1: Documentar la columna**

En el diagrama de `docs/DATA-MODEL.md`, dentro de `projects { … }` y después de `int total_progress`, añade:

```
    text color "azul|verde|ambar|rojo|violeta|rosa|cian|gris"
```

- [ ] **Step 2: Verificación manual en local**

Run: `pnpm dev:local` y abre http://localhost:5173 con `dev@local.test` / `devpassword`. Comprueba:

1. **Tarea rápida:** los 4 selects muestran el dot en el trigger y en la lista. El de proyecto muestra azul, cian y violeta.
2. **Teclado:**
   - Tab hasta un select y Enter lo abre; las flechas mueven; Enter elige.
   - Teclear "ba" en prioridad salta a "Baja".
   - Esc cierra **solo** la lista; un segundo Esc cierra el modal.
3. **Editar un proyecto:**
   - Cambia el color con clic y con flechas, guarda y reabre: el color persiste.
   - En una tarea de ese proyecto, el dot del select de proyecto usa el nuevo color.
4. **Tipo "—"** se puede elegir y guarda la tarea sin tipo.
5. **Tema claro** (DevTools → Rendering → `prefers-color-scheme: light`): dots y lista legibles.
6. **Ancho de 375 px:** la lista no se sale de la pantalla.

- [ ] **Step 3: Aplicar la migración en dev**

Run: `pnpm db:push:dev`
Expected: `Applying migration <ts>_projects_color.sql…` y después `Finished supabase db push.`

No hagas `supabase db push` a producción: se aplica al publicar el entregable completo.

- [ ] **Step 4: Commit**

```bash
git add docs/DATA-MODEL.md
git commit -m "docs: color de proyecto en el modelo de datos"
```
