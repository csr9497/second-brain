import { MIN_DIA, addDays, completarPaso, daysBetween, type GanttDraft, type PaletteColor, type PlazoTarea, type Task } from '@sb/shared';

// Borradores del modal de tarea: strings de formulario ('' = vacío), compartidos con el planificador.
export type StepDraft = {
  id?: string;
  /** Clave local estable de un paso aún no guardado (para reordenarlo arrastrando) */
  uid?: string;
  title: string;
  startDate: string;
  dias: string;
  /** Tiempo estimado (alternativa al rango: solo en un día); '' = por días. `unidad`: horas (admite '1.5') o minutos */
  tiempo?: string;
  unidad?: UnidadTiempo;
  /** Hecho (solo pasos ya guardados) */
  done?: boolean;
};

export type UnidadTiempo = 'h' | 'min';

/** Minutos → texto y unidad del formulario: horas si es múltiplo de 15 min y ≥ 1 h (90 → '1.5' h), si no minutos. */
export function tiempoTexto(min: number): { tiempo: string; unidad: UnidadTiempo } {
  return min >= 60 && min % 15 === 0 ? { tiempo: String(min / 60), unidad: 'h' } : { tiempo: String(min), unidad: 'min' };
}

/** El borrador es por tiempo estimado. */
export const porTiempo = (s: StepDraft) => !!s.tiempo?.trim();

/** Tiempo escrito en minutos (≥ 1, máximo 24 h), o null. */
export function minutosDe(s: StepDraft) {
  const n = Number((s.tiempo ?? '').replace(',', '.'));
  const min = Math.round((s.unidad ?? 'h') === 'h' ? n * 60 : n);
  return s.tiempo?.trim() && Number.isFinite(min) && min >= 1 ? Math.min(min, MIN_DIA) : null;
}

/** Último día del rango del borrador ('' si no tiene fecha). */
export const finBorrador = (s: StepDraft) => (s.startDate ? addDays(s.startDate, (diasDe(s) ?? 1) - 1) : '');

/** `titulo` solo se usa para rotular la barra de la tarea en el calendario. `minutosDia`: su día de trabajo (null = 8 h). */
export type TareaPlan = { startDate: string; deadline: string; titulo?: string; minutosDia?: number | null };

/** Plazo de la tarea del formulario ('' = sin fecha) para `completarPaso` y compañía. */
export const plazoDe = (t: TareaPlan): PlazoTarea => ({ startDate: t.startDate || null, deadline: t.deadline || null, minutosDia: t.minutosDia ?? null });
/** Qué se está colocando en el planificador: la tarea o el paso de ese índice. */
export type Activo = 'tarea' | number;

/** Rango de días marcado en el planificador (para agregar un paso). */
export type Seleccion = { inicio: string; fin: string };

/** Props comunes de las vistas del planificador (Calendario y Gantt). La tarea solo se lee:
 *  su duración se cambia en la cabecera del modal. */
export interface PlanProps {
  tarea: TareaPlan;
  steps: StepDraft[];
  color: PaletteColor;
  /** Cambia los pasos (mover/estirar/colocar un paso existente) */
  onPasos: (steps: StepDraft[]) => void;
  /** Días seleccionados para agregar un paso nuevo */
  sel: Seleccion | null;
  setSel: (r: Seleccion | null) => void;
}

/** Clave estable de un paso del borrador: su id o, si es nuevo, su `uid`. */
export const claveDe = (s: StepDraft) => s.id ?? s.uid ?? '';

/** Fila de paso vacía, con clave local. */
export const pasoVacio = (): StepDraft => ({ uid: crypto.randomUUID(), title: '', startDate: '', dias: '' });

/** Nombre visible de un paso: su título o, si está vacío, «Paso N» (también al guardarlo). */
export const nombrePaso = (s: StepDraft, i: number) => s.title.trim() || `Paso ${i + 1}`;

/** Días escritos en el borrador (entero ≥ 1), o null si están vacíos o no son válidos. */
export function diasDe(s: StepDraft) {
  const n = Math.round(Number(s.dias));
  return s.dias.trim() && Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Borrador → programación: días redondeados, mínimo 1; sin fecha, nada.
 * Por tiempo (solo en un día): duracionDias = 1 y los minutos; con un rango de varios días el tiempo no cuenta.
 * Con `tarea`, se completa con ella (`completarPaso`): por tiempo sin fecha, el día de inicio de la tarea; con fecha
 * y sin días, hasta su deadline. Sin `tarea`, con fecha y sin días se usa 1.
 */
export function programacion(s: StepDraft, tarea?: TareaPlan) {
  const min = (diasDe(s) ?? 1) === 1 ? minutosDe(s) : null;
  const base = s.startDate
    ? { startDate: s.startDate, duracionDias: diasDe(s) ?? (tarea && min == null ? null : 1), duracionMin: min }
    : { startDate: null, duracionDias: null, duracionMin: min };
  const r = tarea ? completarPaso(base, plazoDe(tarea)) : base;
  return r.startDate ? r : { startDate: null, duracionDias: null, duracionMin: null };
}

/** Programación guardada → campos del borrador. */
export function aBorrador(p: { startDate: string | null; duracionDias: number | null; duracionMin: number | null }) {
  return {
    startDate: p.startDate ?? '',
    dias: p.duracionDias ? String(p.duracionDias) : '',
    ...(p.duracionMin ? tiempoTexto(p.duracionMin) : { tiempo: '', unidad: 'h' as UnidadTiempo }),
  };
}

/** Coloca la tarea (inicio–deadline) o un paso (inicio + días) en el rango [inicio, fin]. Un paso por tiempo
 *  lo conserva si el rango es de un día; si abarca varios, pasa a ser por días. */
export function colocar(tarea: TareaPlan, steps: StepDraft[], activo: Activo, inicio: string, fin: string) {
  if (activo === 'tarea') return { tarea: { startDate: inicio, deadline: fin }, steps };
  const dias = daysBetween(inicio, fin) + 1;
  return {
    tarea,
    steps: steps.map((s, i) => (i === activo ? { ...s, startDate: inicio, dias: String(dias), ...(dias > 1 ? { tiempo: '' } : {}) } : s)),
  };
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
    minutosDia: tarea.minutosDia ?? null,
    position: 0,
    notes: null,
    completedAt: null,
    steps: steps.map((s, i) => ({ id: String(i), taskId: 'tarea', title: s.title, done: s.done ?? false, position: i, ...programacion(s, tarea) })),
    habitIds: [],
  };
}

/** Aplica un borrador del Gantt (sobre `comoTask`) a la tarea y los pasos del formulario. */
export function desdeBorrador(tarea: TareaPlan, steps: StepDraft[], d: GanttDraft) {
  const dt = d.tasks.tarea;
  return {
    tarea: dt ? { startDate: dt.startDate ?? '', deadline: dt.deadline ?? '' } : tarea,
    steps: steps.map((s, i) => {
      const ds = d.steps[String(i)];
      return ds ? { ...s, ...aBorrador(ds) } : s;
    }),
  };
}
