// Agregados de la pantalla Hoy y de la revisión semanal, calculados a partir de
// filas ya cargadas (sin acceso a datos). Nada de esto se almacena salvo al
// archivar una semana.
import type { Habit, HabitSlot, Project, Task, TodayPayload, WeeklyReport } from '../index';
import { daysBetween, slotForHour, toISO, todayISO, weekRange, weekday } from './dates';
import { bucketTasks, computeStreak, isOverdue, pct } from './metrics';

export interface HabitRow {
  id: string;
  nombre: string;
  slot: HabitSlot;
  position: number;
}

export interface ProjectRow {
  id: string;
  nombre: string;
  estado: string;
  prioridad: string | null;
  nextAction: string | null;
  scheduleDays: number[];
  totalProgress: number;
  lastActivityAt: string;
}

export interface DashboardInput {
  /** Hábitos activos, ordenados por position */
  habits: HabitRow[];
  /** Registros hechos (done = true) */
  doneLogs: { habitId: string; fecha: string }[];
  /** Tareas ordenadas por position */
  tasks: Task[];
  projects: ProjectRow[];
  now: Date;
}

const PRIORITY_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

/** Hábitos activos hechos por fecha. */
export function doneByDate(habits: HabitRow[], doneLogs: DashboardInput['doneLogs']) {
  const active = new Set(habits.map((h) => h.id));
  const map = new Map<string, number>();
  for (const l of doneLogs) if (active.has(l.habitId)) map.set(l.fecha, (map.get(l.fecha) ?? 0) + 1);
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
  const habitList: Habit[] = habits.map((h) => ({ ...h, done: doneToday.has(h.id) }));

  const porFranja: Record<HabitSlot, Habit[]> = { manana: [], tarde: [], noche: [] };
  for (const h of habitList) porFranja[h.slot].push(h);

  const completedToday = (t: Task) => t.completedAt != null && toISO(new Date(t.completedAt)) === today;

  return {
    date: today,
    habits: {
      slotActual: slotForHour(now.getHours()),
      porFranja,
      pctDia: pct(doneToday.size, habits.length),
      streak: computeStreak(doneByDate(habits, doneLogs), today, habits.length),
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
  const days = daysBetween(start, lastDay) + 1;

  const byDate = doneByDate(habits, doneLogs);
  let habitsDone = 0;
  for (const [fecha, n] of byDate) if (fecha >= start && fecha <= lastDay) habitsDone += n;

  const weekTasks = tasks.filter((t) => t.deadline != null && t.deadline >= start && t.deadline <= end);
  const inProgress = projectViews(projects.filter((p) => p.estado === 'en_curso'), tasks, today);
  const touched = new Set(projects.filter((p) => toISO(new Date(p.lastActivityAt)) >= start).map((p) => p.id));

  return {
    weekStart: start,
    weekEnd: end,
    habitsPct: pct(habitsDone, habits.length * days),
    tasksDone: weekTasks.filter((t) => t.status === 'hecha').length,
    tasksTotal: weekTasks.length,
    overdue: weekTasks.filter((t) => isOverdue(t, today)).length,
    streak: computeStreak(byDate, today, habits.length),
    perProject: inProgress.map((p) => ({ id: p.id, nombre: p.nombre, pct: p.pctSemana })),
    untouched: inProgress.filter((p) => !touched.has(p.id)).map((p) => ({ id: p.id, nombre: p.nombre })),
    archived,
  };
}
