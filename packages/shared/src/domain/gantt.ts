// Borrador del modo edición del Gantt: funciones puras sobre tareas y pasos (fechas ISO, días locales).
import type { Step, Task } from '../index';
import { addDays, daysBetween } from './dates';
import { finPaso, fueraDePlazo } from './pasos';

export interface TaskPlan {
  startDate: string | null;
  deadline: string | null;
}
export interface StepPlan {
  startDate: string | null;
  duracionDias: number | null;
}
/** Cambios pendientes por id (aún no guardados). */
export interface GanttDraft {
  tasks: Record<string, TaskPlan>;
  steps: Record<string, StepPlan>;
}
export const borradorVacio = (): GanttDraft => ({ tasks: {}, steps: {} });

export interface CambioTarea {
  tipo: 'tarea';
  id: string;
  titulo: string;
  antes: TaskPlan;
  despues: TaskPlan;
}
export interface CambioPaso {
  tipo: 'paso';
  id: string;
  titulo: string;
  tarea: string;
  antes: StepPlan;
  despues: StepPlan;
  /** Con la tarea ya modificada */
  fueraDePlazo: boolean;
}
export type Cambio = CambioTarea | CambioPaso;

/** Primer y último día que ocupa una tarea (inicio, deadline y pasos), o null si no tiene fechas. */
export function spanTarea(t: Pick<Task, 'startDate' | 'deadline' | 'steps'>): { inicio: string; fin: string } | null {
  const fechas = [t.startDate, t.deadline, ...t.steps.flatMap((s) => [s.startDate, finPaso(s)])].filter((f): f is string => !!f).sort();
  return fechas.length ? { inicio: fechas[0], fin: fechas[fechas.length - 1] } : null;
}

/** Tareas tal como se ven con el borrador aplicado. */
export function aplicarBorrador(tasks: Task[], draft: GanttDraft): Task[] {
  return tasks.map((t) => ({ ...t, ...draft.tasks[t.id], steps: t.steps.map((s) => ({ ...s, ...draft.steps[s.id] })) }));
}

const desplazar = (f: string | null, d: number) => (f ? addDays(f, d) : null);

/** Mueve la tarea `d` días con todos sus pasos programados. `t` va con el borrador aplicado. */
export function moverTarea(draft: GanttDraft, t: Task, d: number): GanttDraft {
  const steps = { ...draft.steps };
  for (const s of t.steps) if (s.startDate) steps[s.id] = { startDate: addDays(s.startDate, d), duracionDias: s.duracionDias };
  return { tasks: { ...draft.tasks, [t.id]: { startDate: desplazar(t.startDate, d), deadline: desplazar(t.deadline, d) } }, steps };
}

/** Cambia el deadline `d` días (sin deadline, parte del fin de su rango); nunca antes del inicio. */
export function estirarTarea(draft: GanttDraft, t: Task, d: number): GanttDraft {
  const base = t.deadline ?? spanTarea(t)?.fin;
  if (!base) return draft;
  let deadline = addDays(base, d);
  if (t.startDate && deadline < t.startDate) deadline = t.startDate;
  return { ...draft, tasks: { ...draft.tasks, [t.id]: { startDate: t.startDate, deadline } } };
}

/** Mueve el inicio del paso `d` días (si está programado). */
export function moverPaso(draft: GanttDraft, s: Step, d: number): GanttDraft {
  if (!s.startDate) return draft;
  return { ...draft, steps: { ...draft.steps, [s.id]: { startDate: addDays(s.startDate, d), duracionDias: s.duracionDias } } };
}

/** Cambia la duración del paso `d` días (mínimo 1). */
export function estirarPaso(draft: GanttDraft, s: Step, d: number): GanttDraft {
  if (!s.startDate || !s.duracionDias) return draft;
  return { ...draft, steps: { ...draft.steps, [s.id]: { startDate: s.startDate, duracionDias: Math.max(1, s.duracionDias + d) } } };
}

/** Lista de cambios reales (omite lo que volvió a su valor original), para el resumen y el guardado. */
export function cambiosDelBorrador(tasks: Task[], draft: GanttDraft): Cambio[] {
  const vistas = aplicarBorrador(tasks, draft);
  const out: Cambio[] = [];
  tasks.forEach((t, i) => {
    const dt = draft.tasks[t.id];
    if (dt && (dt.startDate !== t.startDate || dt.deadline !== t.deadline)) {
      out.push({ tipo: 'tarea', id: t.id, titulo: t.title, antes: { startDate: t.startDate, deadline: t.deadline }, despues: dt });
    }
    t.steps.forEach((s, j) => {
      const ds = draft.steps[s.id];
      if (ds && (ds.startDate !== s.startDate || ds.duracionDias !== s.duracionDias)) {
        out.push({
          tipo: 'paso',
          id: s.id,
          titulo: s.title,
          tarea: t.title,
          antes: { startDate: s.startDate, duracionDias: s.duracionDias },
          despues: ds,
          fueraDePlazo: fueraDePlazo(vistas[i].steps[j], vistas[i]),
        });
      }
    });
  });
  return out;
}

/** Días visibles: de hoy −7 a hoy +56, ampliados para cubrir todos los rangos (margen 2 antes y 7 después). */
export function ventanaGantt(tasks: Task[], hoy: string): { inicio: string; fin: string; dias: number } {
  let inicio = addDays(hoy, -7);
  let fin = addDays(hoy, 56);
  for (const t of tasks) {
    const s = spanTarea(t);
    if (!s) continue;
    if (s.inicio < addDays(inicio, 2)) inicio = addDays(s.inicio, -2);
    if (s.fin > addDays(fin, -7)) fin = addDays(s.fin, 7);
  }
  return { inicio, fin, dias: daysBetween(inicio, fin) + 1 };
}
