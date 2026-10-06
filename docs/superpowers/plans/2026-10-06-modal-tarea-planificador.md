# Modal grande de tarea con planificador — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el modal de tarea en dos paneles: formulario a la izquierda y planificador (Calendario y Gantt) a la derecha, para colocar la tarea y sus pasos marcando rangos de días.

**Architecture:**
- Un único estado de formulario (`form` y `steps` en `TaskModal`) que editan los dos paneles.
- El planificador recibe ese estado y devuelve cambios con `onCambiar(tarea, steps)`.
- El Gantt del planificador reutiliza `Barra` y la lógica pura de `shared/domain/gantt.ts`, aplicada sobre una tarea virtual.

**Tech Stack:** React 19, Pointer Events, Tailwind v4 y vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-modal-tarea-planificador-design.md`

**Commits:** en la rama `fix/semana-pasos`, que ya contiene el arreglo de Semana. Cada mensaje termina con una línea en blanco y `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `rangoSeleccion`, `pasosBorrador` y ancho de `Modal`

**Files:**
- Modificar `packages/shared/src/domain/pasos.ts` y `pasos.test.ts`.
- Crear `apps/web/src/lib/pasosBorrador.ts`.
- Modificar `apps/web/src/components/TaskModal.tsx` (solo los imports) y `apps/web/src/components/Modal.tsx`.

- [ ] **Step 1: test que falla.** En `pasos.test.ts`, añade `rangoSeleccion` al import y agrega al final:

```ts
describe('rangoSeleccion', () => {
  it('ordena e incluye ambos extremos', () => expect(rangoSeleccion('2026-10-09', '2026-10-06')).toEqual({ inicio: '2026-10-06', fin: '2026-10-09', dias: 4 }));
  it('un mismo día dura 1', () => expect(rangoSeleccion('2026-10-06', '2026-10-06')).toEqual({ inicio: '2026-10-06', fin: '2026-10-06', dias: 1 }));
});
```

Run: `pnpm --filter @sb/shared exec vitest run src/domain/pasos.test.ts`. Expected: FAIL.

- [ ] **Step 2: implementar.** En `pasos.ts`, añade `daysBetween` al import de `./dates` y agrega:

```ts
/** Rango marcado entre dos días (en cualquier orden), inclusivo, con su duración en días. */
export function rangoSeleccion(a: string, b: string) {
  const [inicio, fin] = a <= b ? [a, b] : [b, a];
  return { inicio, fin, dias: daysBetween(inicio, fin) + 1 };
}
```

Run: `pnpm --filter @sb/shared test`. Expected: PASS.

- [ ] **Step 3: `apps/web/src/lib/pasosBorrador.ts`**

```ts
import { daysBetween, type GanttDraft, type Task } from '@sb/shared';

// Borradores del modal de tarea: strings de formulario ('' = vacío), compartidos con el planificador.
export type StepDraft = { id?: string; title: string; startDate: string; dias: string };
export type TareaPlan = { startDate: string; deadline: string };
/** Qué se está colocando en el planificador: la tarea o el paso de ese índice. */
export type Activo = 'tarea' | number;

/** Días escritos en el borrador (entero ≥ 1), o null si están vacíos o no son válidos. */
export function diasDe(s: StepDraft) {
  const n = Math.round(Number(s.dias));
  return s.dias.trim() && Number.isFinite(n) && n >= 1 ? n : null;
}

/** Borrador → programación: con fecha y sin días se usa 1; días redondeados, mínimo 1; sin fecha, nada. */
export function programacion(s: StepDraft) {
  if (!s.startDate) return { startDate: null, duracionDias: null };
  return { startDate: s.startDate, duracionDias: diasDe(s) ?? 1 };
}

/** Coloca la tarea (inicio–deadline) o un paso (inicio + días) en el rango [inicio, fin]. */
export function colocar(tarea: TareaPlan, steps: StepDraft[], activo: Activo, inicio: string, fin: string) {
  if (activo === 'tarea') return { tarea: { startDate: inicio, deadline: fin }, steps };
  const dias = daysBetween(inicio, fin) + 1;
  return { tarea, steps: steps.map((s, i) => (i === activo ? { ...s, startDate: inicio, dias: String(dias) } : s)) };
}

/** Tarea virtual (los pasos llevan su índice como id) para reutilizar la lógica del Gantt. */
export function comoTask(tarea: TareaPlan, steps: StepDraft[]): Task {
  return {
    id: 'tarea',
    projectId: null,
    projectName: null,
    projectColor: null,
    title: '',
    description: null,
    type: null,
    priority: 'media',
    status: 'por_hacer',
    startDate: tarea.startDate || null,
    deadline: tarea.deadline || null,
    position: 0,
    notes: null,
    completedAt: null,
    steps: steps.map((s, i) => ({ id: String(i), taskId: 'tarea', title: s.title, done: false, position: i, ...programacion(s) })),
  };
}

/** Aplica un borrador del Gantt (sobre `comoTask`) a la tarea y los pasos del formulario. */
export function desdeBorrador(tarea: TareaPlan, steps: StepDraft[], d: GanttDraft) {
  const dt = d.tasks.tarea;
  return {
    tarea: dt ? { startDate: dt.startDate ?? '', deadline: dt.deadline ?? '' } : tarea,
    steps: steps.map((s, i) => {
      const ds = d.steps[String(i)];
      return ds ? { ...s, startDate: ds.startDate ?? '', dias: ds.duracionDias ? String(ds.duracionDias) : '' } : s;
    }),
  };
}
```

- [ ] **Step 4: `TaskModal.tsx`.** Borra las definiciones locales de `StepDraft`, `diasDe` y `programacion` e impórtalas de `../lib/pasosBorrador`. El comportamiento no cambia.

- [ ] **Step 5: `Modal.tsx`.** Añade la prop opcional `ancho = 'max-w-[480px]'` y usa `className={`w-full ${ancho} rounded-2xl border border-line bg-surface p-5`}` en el `role="dialog"`. Su tipo se suma a las props existentes: `ancho?: string`.

- [ ] **Step 6: comprobar.** Run: `pnpm typecheck && pnpm test && pnpm build`. Expected: PASS.

- [ ] **Step 7: Commit.** Commit con el mensaje `Modal de tarea: borradores compartidos, rangoSeleccion y ancho configurable`.

---

### Task 2: Calendario del planificador + modal de dos paneles

**Files:**
- Crear `apps/web/src/components/planner/PlanificadorTarea.tsx` y `apps/web/src/components/planner/CalendarioPlan.tsx`.
- Modificar `apps/web/src/components/TaskModal.tsx`.

- [ ] **Step 1: `PlanificadorTarea.tsx`** (la pestaña Gantt muestra un marcador hasta la Task 3)

```tsx
import { useState } from 'react';
import type { PaletteColor } from '@sb/shared';
import type { Activo, StepDraft, TareaPlan } from '../../lib/pasosBorrador';
import { CalendarioPlan } from './CalendarioPlan';

export interface PlanProps {
  tarea: TareaPlan;
  steps: StepDraft[];
  color: PaletteColor;
  activo: Activo;
  setActivo: (a: Activo) => void;
  /** Aplica tarea y pasos a la vez (mover la tarea mueve también sus pasos) */
  onCambiar: (tarea: TareaPlan, steps: StepDraft[]) => void;
}

export const nombrePaso = (s: StepDraft, i: number) => s.title.trim() || `Paso ${i + 1}`;
const chip = 'rounded-full border px-2.5 py-1 text-xs font-semibold transition';

/** Panel derecho del modal de tarea: coloca la tarea o un paso marcando días en Calendario o Gantt. */
export function PlanificadorTarea(props: PlanProps) {
  const { steps, activo, setActivo } = props;
  const [vista, setVista] = useState<'calendario' | 'gantt'>('calendario');
  const nombre = activo === 'tarea' ? 'la tarea' : `«${nombrePaso(steps[activo], activo)}»`;
  const opciones: Activo[] = ['tarea', ...steps.map((_, i) => i)];

  return (
    <section aria-label="Planificador" className="rounded-xl border border-line p-3">
      <div role="tablist" aria-label="Vista del planificador" className="mb-2.5 flex gap-1 rounded-lg bg-surface2 p-0.5">
        {(['calendario', 'gantt'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold text-muted aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-sm"
          >
            {v === 'calendario' ? '📅 Calendario' : '📊 Gantt'}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Colocando" className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-faint">Colocando:</span>
        {opciones.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={activo === o}
            onClick={() => setActivo(o)}
            className={`${chip} ${activo === o ? 'border-accent bg-accent text-white' : 'border-line text-muted hover:text-text'}`}
          >
            {o === 'tarea' ? '📌 Tarea' : nombrePaso(steps[o], o)}
          </button>
        ))}
      </div>
      <p className="m-0 mb-2 text-[12px] text-faint">
        Arrastra del primer al último día de {nombre}, o toca el primero y luego el último.
      </p>
      {vista === 'calendario' ? <CalendarioPlan {...props} /> : <p className="text-sm text-faint">Gantt en construcción</p>}
    </section>
  );
}
```

- [ ] **Step 2: `CalendarioPlan.tsx`**

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, calendarGrid, finPaso, fueraDePlazo, mesDe, rangoSeleccion, sumarMeses, todayISO } from '@sb/shared';
import { headerDate, mesLabel, shortDate } from '../../lib/format';
import { colocar, programacion } from '../../lib/pasosBorrador';
import type { PlanProps } from './PlanificadorTarea';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const navBtn = 'rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted hover:text-text';

/** Mes en el que se marca un rango arrastrando (ratón) o con dos toques (táctil, teclado, clic). */
export function CalendarioPlan({ tarea, steps, color, activo, onCambiar }: PlanProps) {
  const hoy = todayISO();
  const [mes, setMes] = useState(mesDe(tarea.startDate || tarea.deadline || hoy));
  const [arrastre, setArrastre] = useState<{ desde: string; hasta: string } | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const arrastreRef = useRef<{ desde: string; hasta: string } | null>(null);
  // Si cambia lo que se coloca, se descarta el primer toque
  useEffect(() => setPendiente(null), [activo]);

  const aplicar = (a: string, b: string) => {
    const r = rangoSeleccion(a, b);
    const res = colocar(tarea, steps, activo, r.inicio, r.fin);
    onCambiar(res.tarea, res.steps);
  };
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;

  // Soltar el ratón en cualquier parte termina el arrastre (si abarcó más de un día)
  useEffect(() => {
    const soltar = () => {
      const a = arrastreRef.current;
      if (!a) return;
      arrastreRef.current = null;
      setArrastre(null);
      if (a.desde !== a.hasta) aplicarRef.current(a.desde, a.hasta);
    };
    window.addEventListener('pointerup', soltar);
    return () => window.removeEventListener('pointerup', soltar);
  }, []);

  const tocar = (d: string) => {
    if (pendiente) {
      aplicar(pendiente, d);
      setPendiente(null);
    } else setPendiente(d);
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && pendiente) {
      e.preventDefault(); // el modal ignora los Esc ya atendidos
      setPendiente(null);
    }
  };

  const { start, end } = calendarGrid(mes);
  const dias: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dias.push(d);
  const sel = arrastre ? rangoSeleccion(arrastre.desde, arrastre.hasta) : pendiente ? { inicio: pendiente, fin: pendiente } : null;
  const plazo = { startDate: tarea.startDate || null, deadline: tarea.deadline || null };
  const pasos = steps.map((s, i) => ({ i, p: programacion(s) })).filter((x) => x.p.startDate);
  const enTarea = (d: string) =>
    tarea.startDate && tarea.deadline ? d >= tarea.startDate && d <= tarea.deadline : d === tarea.startDate || d === tarea.deadline;

  return (
    <div onKeyDown={tecla}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold first-letter:uppercase">{mesLabel(mes)}</span>
        <div className="flex gap-1">
          <button type="button" aria-label="Mes anterior" className={navBtn} onClick={() => setMes(sumarMeses(mes, -1))}>
            ‹
          </button>
          <button type="button" aria-label="Mes siguiente" className={navBtn} onClick={() => setMes(sumarMeses(mes, 1))}>
            ›
          </button>
        </div>
      </div>
      {pendiente && (
        <p className="m-0 mb-1.5 text-[12px] font-semibold text-accent" aria-live="polite">
          Inicio: {shortDate(pendiente)} · elige el último día (Esc cancela)
        </p>
      )}
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-faint" aria-hidden>
        {DIAS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {dias.map((d) => {
          const marcado = sel != null && d >= sel.inicio && d <= sel.fin;
          const cubre = pasos.filter((x) => d >= x.p.startDate! && d <= finPaso(x.p)!);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={marcado}
              aria-label={`${headerDate(d)}${enTarea(d) ? ', dentro de la tarea' : ''}${d === tarea.deadline ? ', deadline' : ''}${cubre.length ? `, ${cubre.length} paso(s)` : ''}`}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                arrastreRef.current = { desde: d, hasta: d };
                setArrastre({ desde: d, hasta: d });
              }}
              onPointerEnter={() => {
                const a = arrastreRef.current;
                if (a && a.hasta !== d) {
                  a.hasta = d;
                  setArrastre({ ...a });
                }
              }}
              onClick={() => tocar(d)}
              className={`relative flex min-h-11 flex-col gap-0.5 rounded-md border p-1 text-left text-[11px] select-none ${
                marcado ? 'border-accent bg-accent/15' : 'border-transparent hover:bg-surface2'
              } ${mesDe(d) === mes ? '' : 'opacity-40'}`}
            >
              <span className={`font-semibold ${d === hoy ? 'text-accent' : ''}`}>{Number(d.slice(8))}</span>
              {enTarea(d) && <span aria-hidden className="h-1.5 rounded-full opacity-50" style={{ background: `var(--c-${color})` }} />}
              {cubre.map((x) => (
                <span
                  key={x.i}
                  aria-hidden
                  className={`h-1 rounded-full ${x.i === activo ? 'outline outline-1 outline-text' : ''}`}
                  style={{ background: fueraDePlazo(x.p, plazo) ? 'var(--hot)' : `var(--c-${color})` }}
                />
              ))}
              {d === tarea.deadline && (
                <span aria-hidden className="absolute top-1 right-1 text-[9px] leading-none font-bold text-hot">
                  ▍
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `TaskModal.tsx` en dos paneles**
- Imports: `PlanificadorTarea` de `./planner/PlanificadorTarea`, y `type Activo` y `type TareaPlan` de `../lib/pasosBorrador`.
- Estado nuevo: `const [activo, setActivo] = useState<Activo>('tarea');`.
- Color del proyecto: `const color = projects.data?.find((p) => p.id === form.projectId)?.color ?? 'azul';`.
- Quitar un paso: el botón ✕ pasa a llamar a `quitarPaso(i)`:

```tsx
  const quitarPaso = (i: number) => {
    setSteps((xs) => xs.filter((_, j) => j !== i));
    setActivo((a) => (a === i ? 'tarea' : typeof a === 'number' && a > i ? a - 1 : a));
  };
  const cambiarPlan = (t: TareaPlan, s: typeof steps) => {
    setForm((f) => ({ ...f, startDate: t.startDate, deadline: t.deadline }));
    setSteps(s);
  };
```

- En la fila de cada paso, antes del ✕, añade el botón 📍:

```tsx
                  <button
                    type="button"
                    aria-pressed={activo === i}
                    aria-label={`Colocar el paso ${i + 1} en el planificador`}
                    title="Colocar en el planificador"
                    onClick={() => setActivo(i)}
                    className="rounded-md px-1 text-base text-faint aria-pressed:bg-accent/15 aria-pressed:text-accent"
                  >
                    📍
                  </button>
```

- El `Modal` recibe `ancho="max-w-[1120px]"`.
- Dentro del `<form>`, envuelve **todos los `Field`** (de Título a Notas) en el panel izquierdo y añade el planificador:

```tsx
        <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div>{/* …todos los Field actuales… */}</div>
          <div className="self-start lg:sticky lg:top-0">
            <PlanificadorTarea
              tarea={{ startDate: form.startDate, deadline: form.deadline }}
              steps={steps}
              color={color}
              activo={activo}
              setActivo={setActivo}
              onCambiar={cambiarPlan}
            />
          </div>
        </div>
```

  `ModalActions` queda después de esta rejilla.

- [ ] **Step 4: comprobar.** Run: `pnpm typecheck && pnpm build`. Expected: PASS.

- [ ] **Step 5: Commit.** Commit con el mensaje `Modal de tarea en dos paneles con calendario para colocar tarea y pasos`.

---

### Task 3: Gantt del planificador

**Files:**
- Crear `apps/web/src/components/planner/GanttPlan.tsx`.
- Modificar `apps/web/src/components/planner/PlanificadorTarea.tsx`.

- [ ] **Step 1: `GanttPlan.tsx`**

```tsx
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  addDays,
  borradorVacio,
  daysBetween,
  estirarPaso,
  estirarTarea,
  fueraDePlazo,
  moverPaso,
  moverTarea,
  rangoSeleccion,
  spanTarea,
  todayISO,
} from '@sb/shared';
import { colocar, comoTask, desdeBorrador, type Activo, type StepDraft, type TareaPlan } from '../../lib/pasosBorrador';
import { Barra, type Fase, type Op } from '../gantt/Barra';
import { COL } from '../gantt/constantes';
import { nombrePaso, type PlanProps } from './PlanificadorTarea';

const ETQ = 112;

/** Gantt del modal: barras (mover/estirar) y filas en las que se marca un rango para colocar. */
export function GanttPlan({ tarea, steps, color, activo, setActivo, onCambiar }: PlanProps) {
  const hoy = todayISO();
  const virtual = comoTask(tarea, steps);
  const span = spanTarea(virtual);
  const calcular = () => {
    const i0 = addDays(hoy, -3);
    const f0 = addDays(hoy, 27);
    return {
      inicio: span && span.inicio < i0 ? addDays(span.inicio, -3) : i0,
      fin: span && span.fin > f0 ? addDays(span.fin, 5) : f0,
    };
  };
  // Mientras se arrastra una barra, la ventana no se mueve
  const [fija, setFija] = useState<{ inicio: string; fin: string } | null>(null);
  const ventana = fija ?? calcular();
  const ndias = daysBetween(ventana.inicio, ventana.fin) + 1;
  const ancho = ndias * COL;
  const x = (f: string) => daysBetween(ventana.inicio, f) * COL;
  const plazo = { startDate: tarea.startDate || null, deadline: tarea.deadline || null };

  const operar = (t: TareaPlan, s: StepDraft[], obj: Activo, op: Op, d: number) => {
    const tb = comoTask(t, s);
    const dr =
      obj === 'tarea'
        ? op === 'mover'
          ? moverTarea(borradorVacio(), tb, d)
          : estirarTarea(borradorVacio(), tb, d)
        : op === 'mover'
          ? moverPaso(borradorVacio(), tb.steps[obj], d)
          : estirarPaso(borradorVacio(), tb.steps[obj], d);
    const r = desdeBorrador(t, s, dr);
    onCambiar(r.tarea, r.steps);
  };
  const base = useRef<{ tarea: TareaPlan; steps: StepDraft[]; obj: Activo } | null>(null);
  const arrastre = (obj: Activo) => (op: Op, d: number, fase: Fase) => {
    if (fase === 'inicio') {
      base.current = { tarea, steps, obj };
      setFija(ventana);
      setActivo(obj);
      return;
    }
    const b = base.current;
    if (!b) return;
    // delta 0: se vuelve al punto de partida (un clic sin mover no cambia nada)
    if (d === 0) onCambiar(b.tarea, b.steps);
    else operar(b.tarea, b.steps, b.obj, op, d);
    if (fase === 'fin') {
      base.current = null;
      setFija(null);
    }
  };
  const colocarEn = (obj: Activo) => (a: string, b: string) => {
    const r = rangoSeleccion(a, b);
    const res = colocar(tarea, steps, obj, r.inicio, r.fin);
    onCambiar(res.tarea, res.steps);
    setActivo(obj);
  };

  const filas: { obj: Activo; nombre: string; barra: ReactNode }[] = [
    {
      obj: 'tarea',
      nombre: '📌 Tarea',
      barra: span && (
        <Barra
          tipo="tarea"
          left={x(span.inicio)}
          width={(daysBetween(span.inicio, span.fin) + 1) * COL}
          color={color}
          deadline={tarea.deadline ? x(tarea.deadline) - x(span.inicio) : null}
          alerta={virtual.steps.some((s) => fueraDePlazo(s, virtual))}
          modificada={false}
          editable
          etiqueta={`Tarea: ${span.inicio} a ${span.fin}`}
          onArrastre={arrastre('tarea')}
          onTecla={(op, d) => operar(tarea, steps, 'tarea', op, d)}
        />
      ),
    },
    ...virtual.steps.map((s, i) => ({
      obj: i as Activo,
      nombre: nombrePaso(steps[i], i),
      barra: s.startDate && s.duracionDias && (
        <Barra
          tipo="paso"
          left={x(s.startDate)}
          width={s.duracionDias * COL}
          color={color}
          deadline={null}
          alerta={fueraDePlazo(s, virtual)}
          modificada={false}
          editable
          etiqueta={`${nombrePaso(steps[i], i)}: desde ${s.startDate}, ${s.duracionDias} días`}
          onArrastre={arrastre(i)}
          onTecla={(op, d) => operar(tarea, steps, i, op, d)}
        />
      ),
    })),
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <div className="relative" style={{ width: ETQ + ancho }}>
        <div className="flex border-b border-line bg-surface" aria-hidden>
          <div className="sticky left-0 z-20 flex-none border-r border-line bg-surface" style={{ width: ETQ }} />
          <div className="relative h-7" style={{ width: ancho }}>
            {Array.from({ length: ndias }, (_, i) => addDays(ventana.inicio, i)).map((d, i) => (
              <span key={d} className={`absolute top-1.5 text-center text-[10px] ${d === hoy ? 'font-bold text-accent' : 'text-faint'}`} style={{ left: i * COL, width: COL }}>
                {Number(d.slice(8))}
              </span>
            ))}
          </div>
        </div>
        {hoy >= ventana.inicio && hoy <= ventana.fin && (
          <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-accent/70" style={{ left: ETQ + x(hoy) + COL / 2 }} />
        )}
        {filas.map((f) => (
          <div key={String(f.obj)} className={`flex border-b border-line/60 ${activo === f.obj ? 'bg-accent/10' : ''}`}>
            <button
              type="button"
              onClick={() => setActivo(f.obj)}
              className="sticky left-0 z-[15] flex flex-none items-center truncate border-r border-line bg-surface px-2 text-left text-[12px]"
              style={{ width: ETQ, height: 34 }}
            >
              <span className="truncate">{f.nombre}</span>
            </button>
            <Pista ancho={ancho} inicio={ventana.inicio} onRango={colocarEn(f.obj)}>
              {f.barra}
            </Pista>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fondo de una fila: con ratón, arrastrar marca un rango; un clic o un toque, dos toques (inicio y fin). */
function Pista({ ancho, inicio, onRango, children }: { ancho: number; inicio: string; onRango: (a: string, b: string) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const sel = useRef<{ desde: number; hasta: number } | null>(null);
  const arrastrado = useRef(false);
  const [vista, setVista] = useState<{ a: number; b: number } | null>(null);
  const [pendiente, setPendiente] = useState<number | null>(null);
  const diaEn = (clientX: number) => Math.max(0, Math.floor((clientX - ref.current!.getBoundingClientRect().left) / COL));
  const fecha = (n: number) => addDays(inicio, n);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.pointerType !== 'mouse' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const n = diaEn(e.clientX);
    sel.current = { desde: n, hasta: n };
    setVista({ a: n, b: n });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = sel.current;
    if (!s) return;
    const n = diaEn(e.clientX);
    if (n !== s.hasta) {
      s.hasta = n;
      setVista({ a: s.desde, b: n });
    }
  };
  const up = () => {
    const s = sel.current;
    if (!s) return;
    sel.current = null;
    setVista(null);
    if (s.desde !== s.hasta) {
      arrastrado.current = true; // el click que sigue no es un toque
      onRango(fecha(s.desde), fecha(s.hasta));
    }
  };
  const click = (e: { target: EventTarget; currentTarget: EventTarget; clientX: number }) => {
    if (arrastrado.current) {
      arrastrado.current = false;
      return;
    }
    if (e.target !== e.currentTarget) return;
    const n = diaEn(e.clientX);
    if (pendiente == null) setPendiente(n);
    else {
      onRango(fecha(pendiente), fecha(n));
      setPendiente(null);
    }
  };
  const marca = vista ?? (pendiente != null ? { a: pendiente, b: pendiente } : null);

  return (
    <div
      ref={ref}
      className="relative cursor-crosshair"
      style={{
        width: ancho,
        height: 34,
        backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${COL - 1}px, color-mix(in srgb, var(--line) 45%, transparent) ${COL - 1}px ${COL}px)`,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onClick={click}
    >
      {marca && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 rounded-md border border-dashed border-accent bg-accent/15"
          style={{ left: Math.min(marca.a, marca.b) * COL, width: (Math.abs(marca.b - marca.a) + 1) * COL }}
        />
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: `PlanificadorTarea.tsx`.** Importa `GanttPlan` y sustituye el marcador por `<GanttPlan {...props} />`.

- [ ] **Step 3: comprobar.** Run: `pnpm typecheck && pnpm build`. Expected: PASS.

- [ ] **Step 4: Commit.** Commit con el mensaje `Planificador: Gantt del modal (mover, estirar y colocar en filas)`.

---

### Task 4: "＋ Tarea este día" desde el Calendario

**Files:** modificar `apps/web/src/lib/modal.ts`, `App.tsx`, `components/CalendarView.tsx` y `components/TaskModal.tsx`.

- [ ] **Step 1: implementar.**
- **`ModalState`:** `{ kind: 'tarea'; task?: Task; inicial?: { startDate: string; deadline: string } }`.
- **`TaskModal`:** recibe la prop `inicial?: { startDate: string; deadline: string }`. En el estado inicial del formulario, `startDate: task?.startDate ?? inicial?.startDate ?? ''` y lo mismo para `deadline`.
- **`App`:** pasa `inicial={modal.inicial}` al `TaskModal` y añade a `CalendarView` la prop `onNewTask={(fecha) => setModal({ kind: 'tarea', inicial: { startDate: fecha, deadline: fecha } })}`.
- **`CalendarView`:** acepta `onNewTask: (fecha: string) => void` y la pasa a `PanelDia`. Debajo del `h3`, añade:

```tsx
      <button type="button" onClick={() => onNewTask(dia.fecha)} className="mb-3 rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted hover:text-text">
        ＋ Tarea este día
      </button>
```

- [ ] **Step 2: comprobar.** Run: `pnpm typecheck && pnpm build`. Expected: PASS.

- [ ] **Step 3: Commit.** Commit con el mensaje `Calendario: crear una tarea ya colocada en el día`.

---

### Task 5 (controlador): docs y verificación

- [ ] **`CLAUDE.md`:** el modal de tarea es de dos paneles y edita un solo estado. El planificador usa `lib/pasosBorrador.ts`, y su Gantt reutiliza `Barra` y `shared/domain/gantt.ts` sobre `comoTask`.
- [ ] **Chrome (local):** recorre la lista de pruebas manuales del spec.
