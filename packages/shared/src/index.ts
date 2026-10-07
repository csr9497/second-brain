import { z } from 'zod';

// Fechas ISO YYYY-MM-DD
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

// Enums: valores en español sin tildes, igual que los CHECK de supabase/migrations
export const priority = z.enum(['alta', 'media', 'baja']);
export const taskStatus = z.enum(['por_hacer', 'en_curso', 'hecha']);
export const taskType = z.enum(['Estudio', 'Trabajo', 'Tesis', 'Personal', 'Revisión']);
export const habitSlot = z.enum(['manana', 'tarde', 'noche']);
export const projectStatus = z.enum(['idea', 'en_curso', 'en_pausa', 'completado', 'archivado']);
export const ideaStatus = z.enum(['inbox', 'procesada', 'archivada']);
export const taskFilter = z.enum(['hoy', 'semana', 'todas', 'incumplimiento']);

// Paleta fija de colores; la DB guarda la clave (CHECK en projects.color)
export const paletteColor = z.enum(['azul', 'verde', 'ambar', 'rojo', 'violeta', 'rosa', 'cian', 'gris']);

export type Priority = z.infer<typeof priority>;
export type TaskStatus = z.infer<typeof taskStatus>;
export type HabitSlot = z.infer<typeof habitSlot>;

/** Turnos de un hábito: lista ("y") de franjas alternativas ("o"); cada franja una sola vez. Igual que turnos_validos() en la DB. */
export const turnosSchema = z
  .array(z.array(habitSlot).min(1, 'Elige al menos una franja'))
  .min(1, 'Elige al menos una franja')
  .max(3, 'Máximo 3 turnos')
  .refine((t) => new Set(t.flat()).size === t.flat().length, 'Cada franja solo puede usarse una vez');
export type Turnos = HabitSlot[][];
export type TaskFilter = z.infer<typeof taskFilter>;
export type PaletteColor = z.infer<typeof paletteColor>;
export type ProjectStatus = z.infer<typeof projectStatus>;
export type TaskType = z.infer<typeof taskType>;

// ---------- Entradas ----------

// Los esquemas `*Fields` no llevan defaults: así `.partial()` en los PATCH no
// rellena valores por defecto y no pisa datos existentes.
const taskFields = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullish(),
  type: taskType.nullish(),
  projectId: z.uuid().nullish(),
  priority: priority,
  startDate: isoDate.nullish(),
  deadline: isoDate.nullish(),
  notes: z.string().nullish(),
  /** Hábitos vinculados: completar la tarea o uno de sus pasos los marca ese día */
  habitIds: z.array(z.uuid()),
});

// Programación de un paso: fecha de inicio + duración en días (ambos o ninguno; lo garantiza el CHECK de la DB)
const stepFields = z.object({
  title: z.string().trim().min(1),
  startDate: isoDate.nullish(),
  duracionDias: z.number().int().min(1).nullish(),
});

export const createTaskInput = taskFields.extend({
  priority: priority.default('media'),
  habitIds: taskFields.shape.habitIds.default([]),
  steps: z.array(stepFields).default([]),
});
export type CreateTaskInput = z.input<typeof createTaskInput>;

export const updateTaskInput = taskFields.partial().extend({ status: taskStatus.optional() });
export type UpdateTaskInput = z.input<typeof updateTaskInput>;

export const reorderInput = z.object({
  id: z.uuid(),
  beforeId: z.uuid().nullish(),
  afterId: z.uuid().nullish(),
});
export type ReorderInput = z.input<typeof reorderInput>;

export const createStepInput = stepFields;
export type CreateStepInput = z.input<typeof createStepInput>;

const nonEmpty = (o: object) => Object.values(o).some((v) => v !== undefined);

export const updateStepInput = stepFields.partial().refine(nonEmpty, 'Nada que actualizar');
export type UpdateStepInput = z.input<typeof updateStepInput>;

/** Meta de un hábito semanal: N días por semana (1–7); null = hábito diario por turnos. Igual que el CHECK de habits.veces_semana. */
export const vecesSemanaSchema = z.number().int().min(1).max(7).nullable();

const habitFields = z.object({ nombre: z.string().trim().min(1), turnos: turnosSchema, vecesSemana: vecesSemanaSchema });
export const createHabitInput = habitFields.extend({
  turnos: turnosSchema.default(() => [['manana' as const]]),
  vecesSemana: vecesSemanaSchema.default(null),
});
export type CreateHabitInput = z.input<typeof createHabitInput>;
export const updateHabitInput = habitFields.partial().refine(nonEmpty, 'Nada que actualizar');
export type UpdateHabitInput = z.input<typeof updateHabitInput>;
export const toggleHabitInput = z.object({ fecha: isoDate.optional() });

const projectFields = z.object({
  nombre: z.string().trim().min(1),
  estado: projectStatus,
  prioridad: priority,
  nextAction: z.string().nullish(),
  scheduleDays: z.array(z.number().int().min(0).max(6)),
  totalProgress: z.number().int().min(0).max(100),
  color: paletteColor,
});
export const createProjectInput = projectFields.extend({
  estado: projectStatus.default('en_curso'),
  prioridad: priority.default('media'),
  scheduleDays: projectFields.shape.scheduleDays.default([]),
  totalProgress: projectFields.shape.totalProgress.default(0),
  color: paletteColor.default('azul'),
});
export const updateProjectInput = projectFields.partial().refine(nonEmpty, 'Nada que actualizar');
export type ProjectInput = z.input<typeof projectFields>;

export const createIdeaInput = z.object({ texto: z.string().trim().min(1) });
export const updateIdeaInput = z.object({ estado: ideaStatus });

export const archiveReviewInput = z.object({ nota: z.string().nullish() });

// ---------- Salidas ----------

export interface Step {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  startDate: string | null;
  duracionDias: number | null;
  position: number;
}

export interface Task {
  id: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: PaletteColor | null;
  title: string;
  description: string | null;
  type: string | null;
  priority: Priority;
  status: TaskStatus;
  startDate: string | null;
  deadline: string | null;
  position: number;
  notes: string | null;
  completedAt: string | null;
  steps: Step[];
  /** Hábitos vinculados */
  habitIds: string[];
}

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

/** Hábito para el modal de gestión (incluye archivados). */
export interface HabitAdmin {
  id: string;
  nombre: string;
  turnos: Turnos;
  /** Meta semanal (N días por semana); null = diario por turnos */
  vecesSemana: number | null;
  position: number;
  archivedAt: string | null;
}

/** Hábito semanal en Hoy: se marca como mucho una vez al día. */
export interface HabitSemanal {
  id: string;
  nombre: string;
  position: number;
  meta: number;
  /** Días hechos esta semana (incluido hoy) */
  hechas: number;
  /** Hecho hoy */
  hoy: boolean;
}

export interface Project {
  id: string;
  nombre: string;
  estado: string;
  prioridad: string | null;
  nextAction: string | null;
  scheduleDays: number[];
  totalProgress: number;
  color: PaletteColor;
  pctSemana: number;
  hoyToca: boolean;
}

export interface Idea {
  id: string;
  texto: string;
  estado: string;
  createdAt: string;
}

export interface TodayPayload {
  date: string;
  habits: {
    slotActual: HabitSlot;
    porFranja: Record<HabitSlot, HabitChip[]>;
    pctDia: number;
    streak: number;
    /** Hábitos semanales: van aparte, sin contar en el % del día ni en la racha */
    semanales: HabitSemanal[];
  };
  tasks: { hoy: Task[]; semana: Task[]; todas: Task[]; incumplimiento: Task[] };
  projects: Project[];
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  habitsPct: number;
  tasksDone: number;
  tasksTotal: number;
  overdue: number;
  streak: number;
  perProject: WeeklyProject[];
  untouched: { id: string; nombre: string }[];
  /** Hábitos vigentes algún día transcurrido de la semana, ordenados por position */
  perHabit: WeeklyHabit[];
  archived: boolean;
}

/** Seguimiento de un proyecto en curso durante la semana (tareas con deadline en la semana). */
export interface WeeklyProject {
  id: string;
  nombre: string;
  color: PaletteColor;
  pct: number;
  done: number;
  total: number;
  overdue: number;
  /** Tuvo actividad esta semana */
  touched: boolean;
  totalProgress: number;
  nextAction: string | null;
  /** Pasos hechos / total de sus tareas en seguimiento */
  pasosHechos: number;
  pasosTotal: number;
  /** Tareas pendientes, más las hechas que vencían o se completaron esta semana */
  tasks: WeeklyTask[];
}

/** Tarea en el seguimiento semanal de un proyecto, con el progreso de sus pasos. */
export interface WeeklyTask {
  id: string;
  title: string;
  status: TaskStatus;
  startDate: string | null;
  deadline: string | null;
  overdue: boolean;
  pasosHechos: number;
  pasosTotal: number;
  pasos: WeeklyStep[];
}

export interface WeeklyStep {
  id: string;
  title: string;
  done: boolean;
  /** Rango programado (fin inclusivo), o null si no está programado */
  inicio: string | null;
  fin: string | null;
  /** Su rango toca la semana */
  enSemana: boolean;
  fueraDePlazo: boolean;
}

/**
 * Cumplimiento de un hábito en la semana. Diario: en turnos. Semanal (`meta`): `hechos` = días hechos,
 * `turnos` = la meta y `pct` tope 100.
 */
export interface WeeklyHabit {
  id: string;
  nombre: string;
  meta: number | null;
  hechos: number;
  turnos: number;
  pct: number;
  /** Lunes a domingo. `turnos` = 0 si no estaba vigente (semanal: 1 si lo estaba); `futuro` = el día aún no llega */
  dias: { fecha: string; hechos: number; turnos: number; futuro: boolean }[];
}

export interface ApiError {
  error: { code: string; message: string };
}

// ---------- Lógica de dominio (pura, sin acceso a datos) ----------
export * from './domain/dates';
export * from './domain/ordering';
export * from './domain/metrics';
export * from './domain/dashboard';
export * from './domain/calendar';
export * from './domain/pasos';
export * from './domain/gantt';
export * from './colors';
export * from './turnos';
