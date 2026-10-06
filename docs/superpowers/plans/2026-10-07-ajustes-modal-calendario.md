# Confirmaciones propias, calendario legible, modal compacto y crear desde rangos — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar las 5 observaciones de Cesar:
1. Confirmaciones propias en lugar de `window.confirm`.
2. Un calendario que se entienda.
3. "Detalles" y "Pasos" como colapsables en el modal.
4. "Pasos" al final del formulario.
5. Crear una tarea desde un rango marcado en Calendario o Gantt.

**Spec:** `docs/superpowers/specs/2026-10-07-ajustes-modal-calendario-design.md`

**Commits:** en la rama `fix/semana-pasos`. Cada mensaje termina con una línea en blanco y `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `confirmar()` + guardia asíncrona

**Files:**
- Crear `apps/web/src/components/ui/Confirmar.tsx`.
- Modificar `apps/web/src/lib/useVista.ts`, `apps/web/src/App.tsx`, `apps/web/src/components/TaskModal.tsx` y `apps/web/src/components/gantt/GanttView.tsx`.

- [ ] **Step 1: `Confirmar.tsx`**

```tsx
import { useEffect, useState } from 'react';

export interface OpcionesConfirmar {
  titulo: string;
  mensaje?: string;
  aceptar?: string;
  cancelar?: string;
}
type Peticion = OpcionesConfirmar & { resolver: (ok: boolean) => void };

let mostrar: ((p: Peticion) => void) | null = null;

/** Confirmación con el estilo de la app (sustituye a window.confirm). Resuelve true si se acepta. */
export function confirmar(o: OpcionesConfirmar): Promise<boolean> {
  return new Promise((resolve) => {
    if (!mostrar) return resolve(window.confirm(o.titulo)); // sin host montado (no debería pasar)
    mostrar({ ...o, resolver: resolve });
  });
}

/** Se monta una vez en App; muestra la confirmación pendiente por encima de los modales. */
export function ConfirmHost() {
  const [p, setP] = useState<Peticion | null>(null);
  useEffect(() => {
    mostrar = setP;
    return () => {
      mostrar = null;
    };
  }, []);
  useEffect(() => {
    if (!p) return;
    // Captura: Esc cancela la confirmación y el modal de debajo lo ignora (defaultPrevented)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      p.resolver(false);
      setP(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [p]);
  if (!p) return null;
  const fin = (ok: boolean) => {
    p.resolver(ok);
    setP(null);
  };
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/55 px-4"
      onPointerDown={(e) => e.target === e.currentTarget && fin(false)}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo" aria-describedby={p.mensaje ? 'confirmar-mensaje' : undefined} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <h3 id="confirmar-titulo" className="m-0 font-display text-[17px] font-bold">
          {p.titulo}
        </h3>
        {p.mensaje && (
          <p id="confirmar-mensaje" className="m-0 mt-1.5 text-[13px] text-muted">
            {p.mensaje}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" autoFocus className="btn" onClick={() => fin(false)}>
            {p.cancelar ?? 'Seguir editando'}
          </button>
          <button type="button" className="btn border-hot bg-hot text-white" onClick={() => fin(true)}>
            {p.aceptar ?? 'Descartar'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `useVista.ts`.** La guardia pasa a ser asíncrona:

```ts
let guardia: (() => Promise<boolean>) | null = null;
/** true si se puede salir de la vista actual (pregunta si hay cambios sin guardar). */
export const puedeSalir = (): Promise<boolean> => (guardia ? guardia() : Promise.resolve(true));
```

Dentro de `useGuardiaSalida`, sustituye `guardia = () => window.confirm(mensaje);` por `guardia = () => confirmar({ titulo: mensaje, mensaje: 'Los cambios que no guardaste se perderán.' });`, importando `confirmar` desde `../components/ui/Confirmar`.

- [ ] **Step 3: `App.tsx`**
- Monta `<ConfirmHost />` al final del árbol de `Home`, como último hijo del contenedor.
- Enlaces de la navegación: `onClick={async (e) => { e.preventDefault(); if (await puedeSalir()) window.location.hash = hrefVista(v); }}`.
- Botón Salir: `if (!(await puedeSalir())) return;`. El handler ya es `async`.

- [ ] **Step 4: `TaskModal.tsx`.** `cerrar` pasa a:

```ts
  const cerrar = async () => {
    if (JSON.stringify({ form, steps }) !== foto && !(await confirmar({ titulo: '¿Descartar los cambios de la tarea?', mensaje: 'Lo que cambiaste en esta tarea no se guardará.' }))) return;
    onClose();
  };
```

El `Modal` acepta `onClose: () => void`; pásale `onClose={() => void cerrar()}` y usa lo mismo en el botón Cancelar.

- [ ] **Step 5: `GanttView.tsx`.** `salir` pasa a ser `async` y usa `await confirmar({ titulo: '¿Descartar los cambios sin guardar?', mensaje: 'Las barras volverán a sus fechas guardadas.' })`.

- [ ] **Step 6: comprobar.** Run: `grep -rn "window.confirm" apps/web/src`. Expected: solo aparece el fallback de `Confirmar.tsx`. Después, `pnpm typecheck && pnpm build`.

- [ ] **Step 7: Commit.** Commit con el mensaje `web: confirmaciones propias (sin window.confirm) y guardia de navegación asíncrona`.

---

### Task 2: Modal de tarea con "Detalles" y "Pasos" colapsables

**Files:** modificar `apps/web/src/components/TaskModal.tsx`.

- [ ] **Step 1: implementar.**

Reordena el panel izquierdo: Título, Descripción, la rejilla con Fecha inicio y Deadline, Notas, `<details>` "Detalles" y, por último, `<details>` "Pasos".

**Estilos** (en el módulo):

```ts
const detalles = 'group mb-[13px] rounded-lg border border-line';
const resumen = 'flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-muted select-none [&::-webkit-details-marker]:hidden';
```

**Colapsable "Detalles"** (envuelve Tipo, Prioridad, Proyecto y Estado, con su rejilla actual):

```tsx
            <details className={detalles}>
              <summary className={resumen}>
                <span aria-hidden className="transition group-open:rotate-90">▸</span>
                Detalles
                <span className="ml-auto truncate font-normal text-faint">{resumenDetalles}</span>
              </summary>
              <div className="px-3 pt-1 pb-0.5">{/* rejillas Tipo/Prioridad y Proyecto/Estado actuales */}</div>
            </details>
```

con

```ts
  const etiqueta = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label;
  const resumenDetalles = [
    etiqueta(PRIORITY_OPTIONS, form.priority),
    form.projectId ? projectOptions.find((o) => o.value === form.projectId)?.label : 'sin proyecto',
    editing ? etiqueta(TASK_STATUS_OPTIONS, form.status) : null,
  ]
    .filter(Boolean)
    .join(' · ');
```

**Colapsable "Pasos"** (el bloque actual de pasos, con sus botones "+ Añadir paso" y "Encadenar"):
- El estado de apertura es `const [verPasos, setVerPasos] = useState(!!task && task.steps.length > 0);`.
- El elemento es `<details open={verPasos} onToggle={(e) => setVerPasos(e.currentTarget.open)} className={detalles}>`.
- El `summary` lleva el texto `Pasos` y, en el extremo derecho, `` `${conTitulo} ${conTitulo === 1 ? 'paso' : 'pasos'} · ${programados} programados` ``, con:

```ts
  const conTitulo = steps.filter((s) => s.title.trim()).length;
  const programados = steps.filter((s) => s.startDate).length;
```

- El `Field label="Pasos (subtareas)" group` desaparece, porque el `summary` hace de título. Conserva un contenedor `role="group" aria-label="Pasos"` alrededor de las filas.

- [ ] **Step 2: comprobar.** Run: `pnpm typecheck && pnpm build`. Expected: PASS.

- [ ] **Step 3: Commit.** Commit con el mensaje `Modal de tarea: Detalles y Pasos colapsables (Pasos al final)`.

---

### Task 3: Items legibles por día (`shared/domain/calendar.ts`)

**Files:** modificar `packages/shared/src/domain/calendar.ts` y `calendar.test.ts`.

- [ ] **Step 1: tests (fallarán).** Añade al final de `calendar.test.ts`:

```ts
describe('items por día', () => {
  const c = buildCalendar({
    mes: '2026-10',
    hoy: '2026-10-06',
    tasks: [
      // jue 8 → mar 13: cruza el lunes 12
      task('rango', { title: 'Rango', startDate: '2026-10-08', deadline: '2026-10-13', steps: [step('p', '2026-10-09', 2)] }),
      task('soloDeadline', { title: 'Solo deadline', deadline: '2026-10-09' }),
    ],
    habits: [],
    doneLogs: [],
  });
  const items = (f: string) => c.semanas.flat().find((d) => d.fecha === f)!.items;

  it('la tarea con rango ocupa sus días y se etiqueta al inicio y cada lunes', () => {
    expect(items('2026-10-08').find((i) => i.key === 't-rango')).toMatchObject({ tipo: 'tarea', inicio: true, etiqueta: true });
    expect(items('2026-10-10').find((i) => i.key === 't-rango')).toMatchObject({ inicio: false, etiqueta: false });
    expect(items('2026-10-12').find((i) => i.key === 't-rango')).toMatchObject({ etiqueta: true });
    expect(items('2026-10-13').find((i) => i.key === 't-rango')).toMatchObject({ fin: true });
    expect(items('2026-10-14').find((i) => i.key === 't-rango')).toBeUndefined();
  });
  it('solo deadline → vence; los pasos son items de paso', () => {
    expect(items('2026-10-09').map((i) => [i.tipo, i.titulo])).toEqual([
      ['tarea', 'Rango'],
      ['paso', '↳ p'],
      ['vence', 'Solo deadline'],
    ]);
  });
});
```

Run: `pnpm --filter @sb/shared exec vitest run src/domain/calendar.test.ts`. Expected: FAIL.

- [ ] **Step 2: implementar.** En `calendar.ts`:

```ts
/** Lo que se ve en una celda: tareas con rango, pasos y tareas que solo vencen. */
export interface ItemDia {
  key: string;
  tipo: 'tarea' | 'paso' | 'vence';
  titulo: string;
  tarea: Task;
  /** primer / último día del item */
  inicio: boolean;
  fin: boolean;
  /** mostrar el título: primer día o lunes (la barra continúa de la semana anterior) */
  etiqueta: boolean;
}
```

Añade `items: ItemDia[]` a `CalendarDay`. En `buildCalendar`, antes del bucle de días, construye los rangos:

```ts
  const ORDEN = { tarea: 0, paso: 1, vence: 2 } as const;
  const rangos: { key: string; tipo: ItemDia['tipo']; titulo: string; tarea: Task; desde: string; hasta: string }[] = [];
  for (const t of tasks) {
    if (t.startDate && (!t.deadline || t.startDate <= t.deadline)) {
      rangos.push({ key: `t-${t.id}`, tipo: 'tarea', titulo: t.title, tarea: t, desde: t.startDate, hasta: t.deadline ?? t.startDate });
    } else if (t.deadline) {
      rangos.push({ key: `v-${t.id}`, tipo: 'vence', titulo: t.title, tarea: t, desde: t.deadline, hasta: t.deadline });
    }
    for (const s of t.steps) {
      const fin = finPaso(s);
      if (s.startDate && fin) rangos.push({ key: `p-${s.id}`, tipo: 'paso', titulo: `↳ ${s.title}`, tarea: t, desde: s.startDate, hasta: fin });
    }
  }
  rangos.sort((a, b) => a.desde.localeCompare(b.desde) || ORDEN[a.tipo] - ORDEN[b.tipo] || a.key.localeCompare(b.key));
```

Y en cada día:

```ts
      items: rangos
        .filter((r) => r.desde <= fecha && fecha <= r.hasta)
        .map((r) => ({
          key: r.key,
          tipo: r.tipo,
          titulo: r.titulo,
          tarea: r.tarea,
          inicio: fecha === r.desde,
          fin: fecha === r.hasta,
          etiqueta: fecha === r.desde || weekday(fecha) === 1,
        })),
```

- [ ] **Step 3: comprobar.** Run: `pnpm --filter @sb/shared test && pnpm --filter @sb/shared typecheck`. Expected: PASS.

- [ ] **Step 4: Commit.** Commit con el mensaje `shared: items legibles por día en el calendario (rangos, pasos, vence)`.

---

### Task 4: Vista Calendario legible + crear desde un rango

**Files:** modificar `apps/web/src/components/CalendarView.tsx` y `apps/web/src/App.tsx`.

- [ ] **Step 1: celdas con títulos y leyenda.** En `Celda`, sustituye las marcas (puntos y barras) por los items:

```tsx
      <div className="flex min-w-0 flex-col gap-0.5" aria-hidden>
        {dia.items.slice(0, MAX_MARCAS).map((it) => {
          const c = it.tarea.projectColor ?? 'gris';
          if (it.tipo === 'vence') {
            const vencida = isOverdue(it.tarea, hoy);
            return (
              <span key={it.key} className={`flex min-w-0 items-center gap-1 text-[10px] font-semibold ${vencida ? 'text-hot' : 'text-text'}`}>
                <span>⚑</span>
                <span className="hidden truncate sm:inline">{it.titulo}</span>
              </span>
            );
          }
          const redondeo = `${it.inicio ? 'rounded-l-md' : ''} ${it.fin ? 'rounded-r-md' : ''}`;
          return it.tipo === 'tarea' ? (
            <span key={it.key} className={`-mx-1 flex h-4 min-w-0 items-center px-1 text-[10px] font-semibold text-white ${redondeo}`} style={{ background: `var(--c-${c})` }}>
              <span className="hidden truncate sm:inline">{it.etiqueta ? it.titulo : ' '}</span>
            </span>
          ) : (
            <span
              key={it.key}
              className={`-mx-1 flex h-3.5 min-w-0 items-center px-1 text-[9.5px] ${redondeo}`}
              style={{ background: `color-mix(in srgb, var(--c-${c}) 30%, transparent)` }}
            >
              <span className="hidden truncate sm:inline">{it.etiqueta ? it.titulo : ' '}</span>
            </span>
          );
        })}
        {dia.items.length > MAX_MARCAS && <span className="text-[10px] font-semibold text-faint">+{dia.items.length - MAX_MARCAS}</span>}
      </div>
```

Mantén el anillo de hábitos y el número del día, y elimina el código de "marcas" que quede sin uso. El `aria-label` de la celda suma `dia.items.length` (por ejemplo, `3 elementos`).

Encima de la rejilla, dentro de la tarjeta, añade la leyenda:

```tsx
            <p className="m-0 mb-1.5 flex flex-wrap gap-3 px-1 text-[11px] text-faint">
              <span>▬ tarea</span>
              <span>▭ paso</span>
              <span>⚑ vence</span>
              <span>◔ hábitos</span>
            </p>
```

- [ ] **Step 2: selección de rango y botones.**

**Props y estado.** `CalendarView` cambia su prop a `onNewTask: (rango?: { inicio: string; fin: string }) => void`. Estado nuevo:

```ts
  const [rango, setRango] = useState<{ inicio: string; fin: string } | null>(null);
  const [marcandoDesde, setMarcandoDesde] = useState<string | null>(null); // táctil: "marcar rango desde este día"
  const arrastre = useRef<{ desde: string; hasta: string; movio: boolean } | null>(null);
```

**Comportamiento de cada `Celda`** (recibe `enRango` y los handlers):
- **`onPointerDown`** (solo ratón y botón principal): `arrastre.current = { desde: d, hasta: d, movio: false }`.
- **`onPointerEnter`**: si hay arrastre y `d !== hasta`, entonces `hasta = d`, `movio = true` y `setRango(rangoSeleccion(desde, d))`.
- **Al soltar en `window`** (un listener registrado una vez): `arrastre.current = null`. La selección queda en `rango`.
- **`onClick(e)`**, en este orden:
  1. Si `marcandoDesde`, entonces `setRango(rangoSeleccion(marcandoDesde, d))` y `setMarcandoDesde(null)`.
  2. Si no, y es `e.shiftKey`, entonces `setRango(rangoSeleccion(sel, d))`.
  3. Si no, y el arrastre no se movió, entonces `setSel(d)` y `setRango(null)`. Si se movió, el clic se ignora.

  El clic de un arrastre sobre varios días no llega a la celda, porque cae en el ancestro común. Aun así, comprueba `movio` por si se suelta en el día inicial.
- **`enRango`**: la celda lleva `ring-2 ring-accent bg-accent/10` si está dentro de `rango`.
- **Esc**: un `useEffect` mientras haya `rango` o `marcandoDesde` escucha `keydown` y los limpia.

**Cabecera.** Junto a ‹ Hoy ›:

```tsx
          <button type="button" className="btn btn-primary px-3 py-1 text-xs" onClick={() => onNewTask(rango ?? undefined)}>
            {rango ? `＋ Tarea del ${shortDate(rango.inicio)}${rango.fin !== rango.inicio ? ` al ${shortDate(rango.fin)}` : ''}` : '＋ Nueva tarea'}
          </button>
          {rango && (
            <button type="button" aria-label="Quitar selección" className={navBtn} onClick={() => setRango(null)}>
              ✕
            </button>
          )}
```

Importa `rangoSeleccion` desde `@sb/shared` y `shortDate` desde `../lib/format`. Al confirmar `onNewTask`, limpia el rango.

**`PanelDia`.** Recibe `onRangoDesde` y suma un botón debajo de "＋ Tarea este día":

```tsx
        <button type="button" onClick={() => onRangoDesde(dia.fecha)} className="mb-3 ml-2 rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted hover:text-text">
          ↔ Marcar rango desde este día
        </button>
```

Con `marcandoDesde` activo, encima de la rejilla se ve `Elige el último día del rango (Esc cancela)`. "＋ Tarea este día" pasa a llamar a `onNewTask({ inicio: dia.fecha, fin: dia.fecha })`.

- [ ] **Step 3: `App.tsx`.** Usa un único handler para Calendario y Gantt:

```ts
  const nuevaTarea = (rango?: { inicio: string; fin: string }) =>
    setModal({ kind: 'tarea', inicial: rango ? { startDate: rango.inicio, deadline: rango.fin < todayISO() ? '' : rango.fin } : undefined });
```

Pásalo como `onNewTask={nuevaTarea}` a `CalendarView`, y también a `GanttView` en la Task 5. Sustituye al handler anterior de "Tarea este día".

- [ ] **Step 4: comprobar.** Run: `pnpm typecheck && pnpm test && pnpm build`. Expected: PASS.

- [ ] **Step 5: Commit.** Commit con el mensaje `web: calendario con títulos y leyenda; crear tarea desde un rango de días`.

---

### Task 5: Gantt — "＋ Nueva tarea" y fila para marcar un rango

**Files:**
- Crear `apps/web/src/components/gantt/Pista.tsx`, extrayendo `Pista` de `planner/GanttPlan.tsx`.
- Modificar `GanttPlan.tsx`, `gantt/GanttView.tsx` y `App.tsx`.

- [ ] **Step 1: extraer `Pista`.** Mueve el componente `Pista` (con todas sus props actuales, incluidas `activa` y `onToque` si existen) a `components/gantt/Pista.tsx`, exportado. `GanttPlan` lo importa desde ahí. El comportamiento no cambia.

- [ ] **Step 2: `GanttView`.**
- Recibe la prop `onNewTask: (rango?: { inicio: string; fin: string }) => void` y el estado `const [rango, setRango] = useState<{ inicio: string; fin: string } | null>(null);`.
- **Cabecera:** con `!editando`, añade antes de "✏️ Editar" un botón igual al del calendario: "＋ Nueva tarea", o "＋ Tarea del …" si hay `rango`, más su ✕. Al pulsarlo llama a `onNewTask(rango ?? undefined)` y limpia `rango`.
- **Fila final:** después de los grupos, solo con `!editando`:

```tsx
            {!editando && (
              <div className="flex border-b border-line/60">
                <div className="sticky left-0 z-[15] flex flex-none items-center border-r border-line bg-surface px-2 text-[12px] font-semibold text-accent" style={{ width: ETIQUETA, height: 34 }}>
                  ＋ Nueva tarea
                </div>
                <Pista ancho={ancho} inicio={ventana.inicio} onRango={(a, b) => setRango(rangoSeleccion(a, b))} />
              </div>
            )}
```

  Ajusta las props de `Pista` a su firma real (por ejemplo `activa` u `onToque`). La fila tiene la etiqueta "Arrastra o toca dos días para marcar el rango" mediante `title` en la celda de la etiqueta.
- **Esc** limpia `rango`, igual que en el calendario.
- Importa `rangoSeleccion` y `shortDate`.

- [ ] **Step 3: `App.tsx`.** Pasa `onNewTask={nuevaTarea}` a `GanttView`.

- [ ] **Step 4: comprobar.** Run: `pnpm typecheck && pnpm build`. Expected: PASS.

- [ ] **Step 5: Commit.** Commit con el mensaje `web: Gantt con "＋ Nueva tarea" y fila para marcar un rango`.

---

### Task 6 (controlador): docs y verificación en Chrome

Recorre la lista de pruebas manuales del spec. Después actualiza `CLAUDE.md`: `confirmar()` y `ConfirmHost` sustituyen a `window.confirm`; la guardia es asíncrona; existen `items` del calendario y "crear desde rango".
