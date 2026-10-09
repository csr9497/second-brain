// Agregados de la pantalla Hoy y de la revisión semanal, calculados a partir de
// filas ya cargadas (sin acceso a datos). Nada de esto se almacena salvo al
// archivar una semana.
import type { HabitChip, HabitSemanal, HabitSlot, PaletteColor, Project, Task, TodayPayload, MonthlyReport, WeeklyHabit, WeeklyProject, WeeklyReport, WeeklyTask } from '../index';
import { addDays, daysBetween, diaDe, franjaDe, todayISO, weekRange, weekday } from './dates';
import { bucketTasks, computeStreak, isOverdue, pct } from './metrics';
import { finPaso, fueraDePlazo } from './pasos';

/** Periodo de vigencia (timestamps ISO). `hasta` null = sigue activo. */
export interface HabitPeriod {
  desde: string;
  hasta: string | null;
  /** Programación vigente en el periodo */
  turnos: HabitSlot[][];
  /** Meta semanal vigente; null = diario por turnos */
  vecesSemana: number | null;
}

export interface HabitRow {
  id: string;
  nombre: string;
  position: number;
  /** Cuenta los días locales cubiertos por algún periodo. Vienen ordenados por `desde`. */
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
  diaDe(new Date(p.desde)) <= fecha && (p.hasta == null || diaDe(new Date(p.hasta)) > fecha);

/**
 * Periodo que cubre `fecha` (día local); si varios lo cubren (desfase de reloj), gana el más reciente.
 * Requiere periods ordenados por `desde`.
 */
export function periodoEn(h: HabitRow, fecha: string) {
  for (let i = h.periods.length - 1; i >= 0; i--) if (cubre(h.periods[i], fecha)) return h.periods[i];
  return undefined;
}

/** Hábitos vigentes en `fecha` (día local): algún periodo cubre ese día. */
export const habitsOn = (habits: HabitRow[], fecha: string) => habits.filter((h) => periodoEn(h, fecha) != null);

/** Hábitos diarios vigentes en `fecha` con los turnos de su programación de ese día (los semanales no tienen turnos). */
export function turnosEn(habits: HabitRow[], fecha: string) {
  return habits.flatMap((h) => {
    const p = periodoEn(h, fecha);
    return p && p.vecesSemana == null ? [{ habit: h, turnos: p.turnos }] : [];
  });
}

/** Meta semanal de `h` en la semana [start, lastDay]: la del último día vigente; null si fue diario o no estuvo vigente. */
function metaSemanal(h: HabitRow, start: string, lastDay: string) {
  for (let d = lastDay; d >= start; d = addDays(d, -1)) {
    const p = periodoEn(h, d);
    if (p) return p.vecesSemana;
  }
  return null;
}

/** Días de [start, lastDay] con algún registro hecho de `habitId`, en que estuvo vigente como semanal. */
function diasHechos(h: HabitRow, doneLogs: DashboardInput['doneLogs'], start: string, lastDay: string) {
  return new Set(
    doneLogs
      .filter((l) => l.habitId === h.id && l.fecha >= start && l.fecha <= lastDay && periodoEn(h, l.fecha)?.vecesSemana != null)
      .map((l) => l.fecha),
  );
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
    const i = p && p.vecesSemana == null ? p.turnos.findIndex((t) => t.includes(l.slot)) : -1;
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

/** Fichas por franja de un día y su conteo de turnos (la misma regla en Hoy y en el calendario). */
export function fichasDelDia(habits: HabitRow[], doneLogs: DashboardInput['doneLogs'], fecha: string) {
  const delDia = doneLogs.filter((l) => l.fecha === fecha);
  const porFranja: Record<HabitSlot, HabitChip[]> = { manana: [], tarde: [], noche: [] };
  let turnos = 0;
  let hechos = 0;
  for (const { habit, turnos: lista } of turnosEn(habits, fecha)) {
    for (const turno of lista) {
      turnos++;
      const doneIn = turno.find((f) => delDia.some((l) => l.habitId === habit.id && l.slot === f)) ?? null;
      if (doneIn) hechos++;
      for (const slot of turno) {
        porFranja[slot].push({ id: habit.id, nombre: habit.nombre, position: habit.position, slot, turno, done: doneIn != null, doneIn });
      }
    }
  }
  return { porFranja, turnos, hechos };
}

export function buildToday({ habits, doneLogs, tasks, projects, now }: DashboardInput): TodayPayload {
  const today = todayISO(now);
  const { porFranja, turnos: turnosHoy, hechos: hechosHoy } = fichasDelDia(habits, doneLogs, today);

  const completedToday = (t: Task) => t.completedAt != null && diaDe(new Date(t.completedAt)) === today;

  return {
    date: today,
    habits: {
      slotActual: franjaDe(now),
      porFranja,
      pctDia: pct(hechosHoy, turnosHoy),
      streak: computeStreak(doneByDate(habits, doneLogs), today, (d) => totalTurnos(habits, d)),
      semanales: habitosSemanales(habits, doneLogs, today),
    },
    tasks: bucketTasks(tasks, today, weekRange(today).end, completedToday),
    projects: projectViews(projects.filter((p) => p.estado === 'en_curso'), tasks, today),
  };
}

/** Hábitos semanales vigentes hoy, con los días hechos de esta semana. */
export function habitosSemanales(habits: HabitRow[], doneLogs: DashboardInput['doneLogs'], today: string): HabitSemanal[] {
  const { start } = weekRange(today);
  return habits.flatMap((h) => {
    const meta = periodoEn(h, today)?.vecesSemana;
    if (meta == null) return [];
    const dias = diasHechos(h, doneLogs, start, today);
    return [{ id: h.id, nombre: h.nombre, position: h.position, meta, hechas: dias.size, hoy: dias.has(today) }];
  });
}

/**
 * Semanas (lunes–domingo) que tocan [start, lastDay] con la meta de `h` en cada una y sus días hechos.
 * `tope` limita la meta a los días de la semana que caen dentro de [start, end] (en una semana
 * completa no cambia nada; en las semanas partidas de un mes evita metas imposibles de cumplir).
 * Las semanas en que el hábito fue diario o no estuvo vigente no entran.
 */
function semanasDe(h: HabitRow, doneLogs: DashboardInput['doneLogs'], start: string, end: string, lastDay: string) {
  const semanas: { meta: number; hechos: number }[] = [];
  for (let ws = weekRange(start).start; ws <= lastDay; ws = addDays(ws, 7)) {
    const desde = ws < start ? start : ws;
    const hasta = addDays(ws, 6) < lastDay ? addDays(ws, 6) : lastDay;
    const meta = metaSemanal(h, desde, hasta);
    if (meta == null) continue;
    const finVentana = addDays(ws, 6) < end ? addDays(ws, 6) : end;
    semanas.push({ meta: Math.min(meta, daysBetween(desde, finVentana) + 1), hechos: diasHechos(h, doneLogs, desde, hasta).size });
  }
  return semanas;
}

export const buildWeeklyReport = (input: DashboardInput, archived: boolean): WeeklyReport =>
  buildReport(input, weekRange(todayISO(input.now)), archived);

/** Último día del mes de `iso`. */
function finDeMes(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return addDays(`${y}-${String(m).padStart(2, '0')}-01`, new Date(Date.UTC(y, m, 0)).getUTCDate() - 1);
}

/**
 * Reporte de un rango de días [start, end] (semana o mes). Solo cuentan los días ya transcurridos.
 * Hábitos semanales: suman su meta por cada semana (lun–dom) que toca el rango, con la meta
 * topada a los días de esa semana dentro del rango; en una semana sola es la regla de siempre.
 */
export function buildReport({ habits, doneLogs, tasks, projects, now }: DashboardInput, rango: { start: string; end: string }, archived: boolean): WeeklyReport {
  const today = todayISO(now);
  const { start, end } = rango;
  // Solo cuentan los días ya transcurridos del rango
  const lastDay = today < end ? today : end;
  const byDate = doneByDate(habits, doneLogs);
  const totalOn = (d: string) => totalTurnos(habits, d);
  let habitsDone = 0;
  let habitsTotal = 0;
  for (let d = start; d <= lastDay; d = addDays(d, 1)) {
    habitsDone += byDate.get(d) ?? 0;
    habitsTotal += totalOn(d);
  }
  // Los semanales suman su meta completa por semana (tope en la meta)
  for (const h of habits) {
    for (const { meta, hechos } of semanasDe(h, doneLogs, start, end, lastDay)) {
      habitsDone += Math.min(hechos, meta);
      habitsTotal += meta;
    }
  }

  const weekTasks = tasks.filter((t) => t.deadline != null && t.deadline >= start && t.deadline <= end);
  const inProgress = projectViews(projects.filter((p) => p.estado === 'en_curso'), tasks, today);
  const touched = new Set(projects.filter((p) => diaDe(new Date(p.lastActivityAt)) >= start).map((p) => p.id));

  const perProject = inProgress.map((p): WeeklyProject => {
    const own = weekTasks.filter((t) => t.projectId === p.id);
    const done = own.filter((t) => t.status === 'hecha').length;
    const seguidas = weeklyTasks(tasks.filter((t) => t.projectId === p.id), today, start, end);
    return {
      id: p.id,
      nombre: p.nombre,
      color: p.color,
      pct: pct(done, own.length), // del rango (no `pctSemana`, que es siempre el de la semana actual)
      done,
      total: own.length,
      overdue: own.filter((t) => isOverdue(t, today)).length,
      touched: touched.has(p.id),
      totalProgress: p.totalProgress,
      nextAction: p.nextAction,
      pasosHechos: seguidas.reduce((n, t) => n + t.pasosHechos, 0),
      pasosTotal: seguidas.reduce((n, t) => n + t.pasosTotal, 0),
      tasks: seguidas,
    };
  });

  return {
    weekStart: start,
    weekEnd: end,
    habitsPct: pct(habitsDone, habitsTotal),
    tasksDone: weekTasks.filter((t) => t.status === 'hecha').length,
    tasksTotal: weekTasks.length,
    overdue: weekTasks.filter((t) => isOverdue(t, today)).length,
    streak: computeStreak(byDate, today, totalOn),
    perProject,
    untouched: perProject.filter((p) => !p.touched).map((p) => ({ id: p.id, nombre: p.nombre })),
    perHabit: weeklyHabits(habits, doneLogs, start, lastDay, end),
    archived,
  };
}

/** Reporte del mes de `now`, con el % de hábitos diarios de cada día para el mapa de calor. */
export function buildMonthlyReport(input: DashboardInput): MonthlyReport {
  const hoy = todayISO(input.now);
  const monthStart = `${hoy.slice(0, 7)}-01`;
  const monthEnd = finDeMes(hoy);
  const { weekStart: _s, weekEnd: _e, archived: _ar, ...r } = buildReport(input, { start: monthStart, end: monthEnd }, false);
  const dias: MonthlyReport['dias'] = [];
  for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) {
    const futuro = d > hoy;
    // Misma regla que el % del día en Hoy y el calendario; null sin diarios vigentes
    const { turnos, hechos } = fichasDelDia(input.habits, input.doneLogs, d);
    dias.push({ fecha: d, pct: futuro || turnos === 0 ? null : pct(hechos, turnos), futuro });
  }
  return { ...r, monthStart, monthEnd, dias };
}

/**
 * Cumplimiento por hábito de lunes a domingo, en turnos (misma regla que `fichasDelDia`).
 * Solo cuentan los días hasta `lastDay`; entran los hábitos vigentes en alguno de ellos.
 */
export function weeklyHabits(habits: HabitRow[], doneLogs: DashboardInput['doneLogs'], start: string, lastDay: string, end = addDays(start, 6)): WeeklyHabit[] {
  const fechas = Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => addDays(start, i));
  return [...habits]
    .sort((a, b) => a.position - b.position)
    .map((h): WeeklyHabit => {
      const meta = metaSemanal(h, start, lastDay);
      if (meta != null) {
        const hechosEn = diasHechos(h, doneLogs, start, lastDay);
        // Semana: hechos = días hechos, turnos = la meta. Mes: se suma por semana, con tope en cada meta
        const semanas = semanasDe(h, doneLogs, start, end, lastDay);
        const hechosTot = semanas.reduce((n, w) => n + Math.min(w.hechos, w.meta), 0);
        const metaTot = semanas.reduce((n, w) => n + w.meta, 0);
        const dias = fechas.map((fecha) => {
          const futuro = fecha > lastDay;
          const vigente = !futuro && periodoEn(h, fecha)?.vecesSemana != null;
          return { fecha, hechos: hechosEn.has(fecha) ? 1 : 0, turnos: vigente ? 1 : 0, futuro };
        });
        return fechas.length === 7
          ? { id: h.id, nombre: h.nombre, meta, hechos: hechosEn.size, turnos: meta, pct: pct(Math.min(hechosEn.size, meta), meta), dias }
          : { id: h.id, nombre: h.nombre, meta, hechos: hechosTot, turnos: metaTot, pct: pct(hechosTot, metaTot), dias };
      }
      const dias = fechas.map((fecha) => {
        const futuro = fecha > lastDay;
        const p = futuro ? undefined : periodoEn(h, fecha);
        if (!p || p.vecesSemana != null) return { fecha, hechos: 0, turnos: 0, futuro };
        const slots = new Set(doneLogs.filter((l) => l.habitId === h.id && l.fecha === fecha).map((l) => l.slot));
        return { fecha, hechos: p.turnos.filter((t) => t.some((f) => slots.has(f))).length, turnos: p.turnos.length, futuro };
      });
      const hechos = dias.reduce((n, d) => n + d.hechos, 0);
      const turnos = dias.reduce((n, d) => n + d.turnos, 0);
      return { id: h.id, nombre: h.nombre, meta: null, hechos, turnos, pct: pct(hechos, turnos), dias };
    })
    .filter((h) => h.turnos > 0);
}

const STATUS_RANK: Record<string, number> = { en_curso: 0, por_hacer: 1, hecha: 2 };

/**
 * Tareas de un proyecto en seguimiento: pendientes, más las hechas que vencían o se completaron
 * en la semana. Orden: vencidas → en curso → por hacer → hechas; luego deadline (sin deadline al final).
 */
export function weeklyTasks(tasks: Task[], today: string, start: string, end: string): WeeklyTask[] {
  const enSemana = (d: string | null) => d != null && d >= start && d <= end;
  return tasks
    .filter((t) => t.status !== 'hecha' || enSemana(t.deadline) || (t.completedAt != null && enSemana(diaDe(new Date(t.completedAt)))))
    .map((t): WeeklyTask => {
      const pasos = [...t.steps]
        .sort((a, b) => a.position - b.position)
        .map((s) => {
          const fin = finPaso(s);
          return {
            id: s.id,
            title: s.title,
            done: s.done,
            inicio: fin ? s.startDate : null,
            fin,
            enSemana: fin != null && s.startDate! <= end && fin >= start,
            fueraDePlazo: fueraDePlazo(s, t),
          };
        });
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        startDate: t.startDate,
        deadline: t.deadline,
        overdue: isOverdue(t, today),
        pasosHechos: pasos.filter((s) => s.done).length,
        pasosTotal: pasos.length,
        pasos,
      };
    })
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'),
    );
}
