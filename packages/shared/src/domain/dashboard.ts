// Agregados de la pantalla Hoy y de la revisión semanal, calculados a partir de
// filas ya cargadas (sin acceso a datos). Nada de esto se almacena salvo al
// archivar una semana.
import type { Habit, HabitSlot, PaletteColor, Project, Task, TodayPayload, WeeklyReport } from '../index';
import { addDays, slotForHour, toISO, todayISO, weekRange, weekday } from './dates';
import { bucketTasks, computeStreak, isOverdue, pct } from './metrics';

export interface HabitRow {
  id: string;
  nombre: string;
  slot: HabitSlot;
  position: number;
  /** ISO timestamp: cuenta desde su día local de creación */
  createdAt: string;
  /** ISO timestamp o null: deja de contar desde su día local de archivado */
  archivedAt: string | null;
}

export interface ProjectRow {
  id: string;
  nombre: string;
  estado: string;
  prioridad: string | null;
  nextAction: string | null;
  scheduleDays: number[];
  totalProgress: number;
  color: PaletteColor;
  lastActivityAt: string;
}

export interface DashboardInput {
  /** Todos los hábitos (también archivados, para el historial), ordenados por position */
  habits: HabitRow[];
  /** Registros hechos (done = true) */
  doneLogs: { habitId: string; fecha: string }[];
  /** Tareas ordenadas por position */
  tasks: Task[];
  projects: ProjectRow[];
  now: Date;
}

const PRIORITY_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

const vigente = (h: HabitRow, fecha: string) =>
  toISO(new Date(h.createdAt)) <= fecha && (h.archivedAt == null || toISO(new Date(h.archivedAt)) > fecha);

/** Hábitos vigentes en `fecha` (día local): creados hasta ese día y aún no archivados. */
export const habitsOn = (habits: HabitRow[], fecha: string) => habits.filter((h) => vigente(h, fecha));

/** Hábitos hechos por fecha, contando solo los vigentes ese día. */
export function doneByDate(habits: HabitRow[], doneLogs: DashboardInput['doneLogs']) {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const map = new Map<string, number>();
  for (const l of doneLogs) {
    const h = byId.get(l.habitId);
    if (h && vigente(h, l.fecha)) map.set(l.fecha, (map.get(l.fecha) ?? 0) + 1);
  }
  return map;
}

/** % semana y "hoy toca". Orden: hoy toca → prioridad → nombre. */
export function projectViews(projects: ProjectRow[], tasks: Pick<Task, 'projectId' | 'status' | 'deadline'>[], today: string): Project[] {
  const { start, end } = weekRange(today);
  const dow = weekday(today);
  return projects
    .map((p): Project => {
      const week = tasks.filter((t) => t.projectId === p.id && t.deadline != null && t.deadline >= start && t.deadline <= end);
      return {
        id: p.id,
        nombre: p.nombre,
        estado: p.estado,
        prioridad: p.prioridad,
        nextAction: p.nextAction,
        scheduleDays: p.scheduleDays,
        totalProgress: p.totalProgress,
        color: p.color,
        pctSemana: pct(week.filter((t) => t.status === 'hecha').length, week.length),
        hoyToca: p.scheduleDays.includes(dow),
      };
    })
    .sort(
      (a, b) =>
        Number(b.hoyToca) - Number(a.hoyToca) ||
        (PRIORITY_RANK[a.prioridad ?? 'media'] ?? 1) - (PRIORITY_RANK[b.prioridad ?? 'media'] ?? 1) ||
        a.nombre.localeCompare(b.nombre),
    );
}

export function buildToday({ habits, doneLogs, tasks, projects, now }: DashboardInput): TodayPayload {
  const today = todayISO(now);
  const doneToday = new Set(doneLogs.filter((l) => l.fecha === today).map((l) => l.habitId));
  const habitList: Habit[] = habitsOn(habits, today).map((h) => ({
    id: h.id,
    nombre: h.nombre,
    slot: h.slot,
    position: h.position,
    done: doneToday.has(h.id),
  }));

  const porFranja: Record<HabitSlot, Habit[]> = { manana: [], tarde: [], noche: [] };
  for (const h of habitList) porFranja[h.slot].push(h);

  const completedToday = (t: Task) => t.completedAt != null && toISO(new Date(t.completedAt)) === today;

  return {
    date: today,
    habits: {
      slotActual: slotForHour(now.getHours()),
      porFranja,
      pctDia: pct(habitList.filter((h) => h.done).length, habitList.length),
      streak: computeStreak(doneByDate(habits, doneLogs), today, (d) => habitsOn(habits, d).length),
    },
    tasks: bucketTasks(tasks, today, weekRange(today).end, completedToday),
    projects: projectViews(projects.filter((p) => p.estado === 'en_curso'), tasks, today),
  };
}

export function buildWeeklyReport({ habits, doneLogs, tasks, projects, now }: DashboardInput, archived: boolean): WeeklyReport {
  const today = todayISO(now);
  const { start, end } = weekRange(today);
  // Solo cuentan los días ya transcurridos de la semana
  const lastDay = today < end ? today : end;
  const byDate = doneByDate(habits, doneLogs);
  const totalOn = (d: string) => habitsOn(habits, d).length;
  let habitsDone = 0;
  let habitsTotal = 0;
  for (let d = start; d <= lastDay; d = addDays(d, 1)) {
    habitsDone += byDate.get(d) ?? 0;
    habitsTotal += totalOn(d);
  }

  const weekTasks = tasks.filter((t) => t.deadline != null && t.deadline >= start && t.deadline <= end);
  const inProgress = projectViews(projects.filter((p) => p.estado === 'en_curso'), tasks, today);
  const touched = new Set(projects.filter((p) => toISO(new Date(p.lastActivityAt)) >= start).map((p) => p.id));

  return {
    weekStart: start,
    weekEnd: end,
    habitsPct: pct(habitsDone, habitsTotal),
    tasksDone: weekTasks.filter((t) => t.status === 'hecha').length,
    tasksTotal: weekTasks.length,
    overdue: weekTasks.filter((t) => isOverdue(t, today)).length,
    streak: computeStreak(byDate, today, totalOn),
    perProject: inProgress.map((p) => ({ id: p.id, nombre: p.nombre, pct: p.pctSemana })),
    untouched: inProgress.filter((p) => !touched.has(p.id)).map((p) => ({ id: p.id, nombre: p.nombre })),
    archived,
  };
}
