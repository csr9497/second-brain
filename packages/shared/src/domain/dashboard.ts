// Agregados de la pantalla Hoy y de la revisión semanal, calculados a partir de
// filas ya cargadas (sin acceso a datos). Nada de esto se almacena salvo al
// archivar una semana.
import type { HabitChip, HabitSlot, PaletteColor, Project, Task, TodayPayload, WeeklyReport } from '../index';
import { addDays, slotForHour, toISO, todayISO, weekRange, weekday } from './dates';
import { bucketTasks, computeStreak, isOverdue, pct } from './metrics';

/** Periodo de vigencia (timestamps ISO). `hasta` null = sigue activo. */
export interface HabitPeriod {
  desde: string;
  hasta: string | null;
  /** Programación vigente en el periodo */
  turnos: HabitSlot[][];
}

export interface HabitRow {
  id: string;
  nombre: string;
  position: number;
  /** Cuenta los días locales cubiertos por algún periodo */
  periods: HabitPeriod[];
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
  doneLogs: { habitId: string; fecha: string; slot: HabitSlot }[];
  /** Tareas ordenadas por position */
  tasks: Task[];
  projects: ProjectRow[];
  now: Date;
}

const PRIORITY_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

const cubre = (p: HabitPeriod, fecha: string) =>
  toISO(new Date(p.desde)) <= fecha && (p.hasta == null || toISO(new Date(p.hasta)) > fecha);

/** Periodo que cubre `fecha` (día local), si el hábito estaba vigente ese día. */
export const periodoEn = (h: HabitRow, fecha: string) => h.periods.find((p) => cubre(p, fecha));

/** Hábitos vigentes en `fecha` (día local): algún periodo cubre ese día. */
export const habitsOn = (habits: HabitRow[], fecha: string) => habits.filter((h) => periodoEn(h, fecha) != null);

/** Hábitos vigentes en `fecha` con los turnos de su programación de ese día. */
export function turnosEn(habits: HabitRow[], fecha: string) {
  return habits.flatMap((h) => {
    const p = periodoEn(h, fecha);
    return p ? [{ habit: h, turnos: p.turnos }] : [];
  });
}

/** Nº de turnos vigentes en `fecha`. */
const totalTurnos = (habits: HabitRow[], fecha: string) => turnosEn(habits, fecha).reduce((n, x) => n + x.turnos.length, 0);

/** Turnos hechos por fecha, según la programación vigente de cada hábito ese día. */
export function doneByDate(habits: HabitRow[], doneLogs: DashboardInput['doneLogs']) {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const hechos = new Map<string, Set<string>>(); // fecha → "hábito|índice de turno"
  for (const l of doneLogs) {
    const h = byId.get(l.habitId);
    const p = h && periodoEn(h, l.fecha);
    const i = p ? p.turnos.findIndex((t) => t.includes(l.slot)) : -1;
    if (i < 0) continue;
    const set = hechos.get(l.fecha) ?? new Set<string>();
    set.add(`${l.habitId}|${i}`);
    hechos.set(l.fecha, set);
  }
  return new Map([...hechos].map(([fecha, set]) => [fecha, set.size]));
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
  const logsHoy = doneLogs.filter((l) => l.fecha === today);
  const porFranja: Record<HabitSlot, HabitChip[]> = { manana: [], tarde: [], noche: [] };
  let turnosHoy = 0;
  let hechosHoy = 0;
  for (const { habit, turnos } of turnosEn(habits, today)) {
    for (const turno of turnos) {
      turnosHoy++;
      const doneIn = turno.find((f) => logsHoy.some((l) => l.habitId === habit.id && l.slot === f)) ?? null;
      if (doneIn) hechosHoy++;
      for (const slot of turno) {
        porFranja[slot].push({ id: habit.id, nombre: habit.nombre, position: habit.position, slot, turno, done: doneIn != null, doneIn });
      }
    }
  }

  const completedToday = (t: Task) => t.completedAt != null && toISO(new Date(t.completedAt)) === today;

  return {
    date: today,
    habits: {
      slotActual: slotForHour(now.getHours()),
      porFranja,
      pctDia: pct(hechosHoy, turnosHoy),
      streak: computeStreak(doneByDate(habits, doneLogs), today, (d) => totalTurnos(habits, d)),
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
  const totalOn = (d: string) => totalTurnos(habits, d);
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
