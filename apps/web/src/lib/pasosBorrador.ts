import { daysBetween, type GanttDraft, type PaletteColor, type Task } from '@sb/shared';

// Borradores del modal de tarea: strings de formulario ('' = vacío), compartidos con el planificador.
export type StepDraft = { id?: string; title: string; startDate: string; dias: string; /** Hecho (solo pasos ya guardados) */ done?: boolean };
export type TareaPlan = { startDate: string; deadline: string };
/** Qué se está colocando en el planificador: la tarea o el paso de ese índice. */
export type Activo = 'tarea' | number;

/** Props comunes de las vistas del planificador (Calendario y Gantt). */
export interface PlanProps {
  tarea: TareaPlan;
  steps: StepDraft[];
  color: PaletteColor;
  activo: Activo;
  setActivo: (a: Activo) => void;
  /** Aplica tarea y pasos a la vez (mover la tarea mueve también sus pasos) */
  onCambiar: (tarea: TareaPlan, steps: StepDraft[]) => void;
}

/** Nombre visible de un paso: su título o, si está vacío, «Paso N» (también al guardarlo). */
export const nombrePaso = (s: StepDraft, i: number) => s.title.trim() || `Paso ${i + 1}`;

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

/** Tarea virtual (los pasos llevan su índice como id y su `done`) para reutilizar la lógica del Gantt. */
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
    steps: steps.map((s, i) => ({ id: String(i), taskId: 'tarea', title: s.title, done: s.done ?? false, position: i, ...programacion(s) })),
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
