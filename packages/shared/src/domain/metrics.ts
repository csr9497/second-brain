import { addDays } from './dates';

export const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100));

export const STREAK_THRESHOLD = 100;

/**
 * Días consecutivos con % de turnos de hábitos ≥ umbral, contando hacia atrás.
 * Hoy suma si ya está completo; si no, no rompe la racha (el día no ha cerrado).
 * Un día sin hábitos vigentes corta la racha.
 * @param doneByDate nº de turnos hechos por fecha
 * @param totalOn nº de turnos vigentes en cada fecha
 */
export function computeStreak(
  doneByDate: Map<string, number>,
  today: string,
  totalOn: (fecha: string) => number,
  threshold = STREAK_THRESHOLD,
): number {
  const ok = (d: string) => {
    const total = totalOn(d);
    return total > 0 && pct(doneByDate.get(d) ?? 0, total) >= threshold;
  };
  let streak = ok(today) ? 1 : 0;
  for (let d = addDays(today, -1); ok(d); d = addDays(d, -1)) streak++;
  return streak;
}

export interface TaskLike {
  status: string;
  deadline: string | null;
  startDate: string | null;
  completedAt: string | null;
}

export const isOverdue = (t: TaskLike, today: string) =>
  t.status !== 'hecha' && t.deadline != null && t.deadline < today;

/**
 * Reparte tareas en las listas de la pantalla Hoy.
 * - Las tareas hechas solo se ven el día en que se completaron (para poder desmarcarlas).
 * - Las vencidas sin terminar van SOLO a incumplimiento.
 * - hoy: deadline = hoy, o sin deadline y con fecha de inicio hoy.
 * - semana: hoy ≤ deadline ≤ fin de semana, más las de "hoy".
 */
export function bucketTasks<T extends TaskLike>(
  tasks: T[],
  today: string,
  weekEnd: string,
  completedToday: (t: T) => boolean,
) {
  const visible = tasks.filter((t) => t.status !== 'hecha' || completedToday(t));
  const incumplimiento = visible.filter((t) => isOverdue(t, today));
  const current = visible.filter((t) => !isOverdue(t, today));
  const isHoy = (t: T) => t.deadline === today || (t.deadline == null && t.startDate === today);
  const hoy = current.filter(isHoy);
  const semana = current.filter((t) => isHoy(t) || (t.deadline != null && t.deadline >= today && t.deadline <= weekEnd));
  return { hoy, semana, todas: current, incumplimiento };
}
