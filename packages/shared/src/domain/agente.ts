// Lógica pura para las herramientas de agente (WebMCP): resolver marcas y resumir datos en salidas compactas.
import type { HabitSlot, Task, TodayPayload, WeeklyReport } from '../index';
import type { CalendarMonth } from './calendar';
import { isOverdue } from './metrics';
import { finPaso, fueraDePlazo } from './pasos';

export const FRANJAS: HabitSlot[] = ['manana', 'tarde', 'noche'];

/** Argumentos de `toggleHabit`: `done` es el estado actual del turno (true = desmarcar). */
export interface MarcaHabito {
  id: string;
  slot: HabitSlot;
  turno: HabitSlot[];
  done: boolean;
}
export type ResolucionHabito = { marca: MarcaHabito } | { nada: string } | { error: string };

/**
 * Qué turno (y en qué franja) marcar o desmarcar hoy para que el hábito quede en `hecho`.
 * Diario: al marcar, el turno pendiente que incluye `franja` (o la franja actual), si no el primero pendiente;
 * al desmarcar, el turno hecho (si hay varios, hace falta `franja`). Semanal: una marca por día, como en Hoy.
 * Si ya está como se pide devuelve `nada` (idempotente).
 */
export function resolverMarcaHabito(today: TodayPayload, habitId: string, hecho: boolean, franja?: HabitSlot): ResolucionHabito {
  const { slotActual, porFranja, semanales } = today.habits;
  const semanal = semanales.find((h) => h.id === habitId);
  if (semanal) {
    if (semanal.hoy === hecho) return { nada: `«${semanal.nombre}» ${hecho ? 'ya estaba marcado' : 'no estaba marcado'} hoy` };
    return { marca: { id: habitId, slot: franja ?? slotActual, turno: FRANJAS, done: semanal.hoy } };
  }
  const fichas = FRANJAS.flatMap((f) => porFranja[f].filter((c) => c.id === habitId));
  if (fichas.length === 0) return { error: `No hay un hábito vigente hoy con id ${habitId}. Usa get_today o list_habits para ver los ids.` };
  const nombre = fichas[0].nombre;
  if (franja && !fichas.some((c) => c.slot === franja)) {
    return { error: `«${nombre}» no se hace en la franja ${franja}; franjas posibles: ${[...new Set(fichas.map((c) => c.slot))].join(', ')}` };
  }
  // Un turno por clave (sus fichas comparten turno y estado)
  const turnos = [...new Map(fichas.map((c) => [c.turno.join('|'), c])).values()];

  if (hecho) {
    const pendientes = turnos.filter((t) => !t.done);
    if (pendientes.length === 0) return { nada: `«${nombre}» ya tiene todos sus turnos de hoy hechos` };
    const f = franja ?? slotActual;
    const t = pendientes.find((x) => x.turno.includes(f)) ?? (franja ? null : pendientes[0]);
    if (!t) return { nada: `El turno de «${nombre}» que incluye ${franja} ya está hecho hoy` };
    return { marca: { id: habitId, slot: t.turno.includes(f) ? f : t.turno[0], turno: t.turno, done: false } };
  }

  const hechos = turnos.filter((t) => t.done);
  if (hechos.length === 0) return { nada: `«${nombre}» no tiene turnos marcados hoy` };
  const t = franja ? hechos.find((x) => x.turno.includes(franja)) : hechos.length === 1 ? hechos[0] : null;
  if (!t) {
    return franja
      ? { nada: `El turno de «${nombre}» que incluye ${franja} no está marcado hoy` }
      : { error: `«${nombre}» tiene varios turnos hechos hoy (${hechos.map((x) => x.doneIn).join(', ')}); indica la franja a desmarcar` };
  }
  return { marca: { id: habitId, slot: t.doneIn ?? t.turno[0], turno: t.turno, done: true } };
}

/** Tarea en una línea de datos: lo justo para listar y elegir por id. */
export function resumirTarea(t: Task, hoy: string) {
  return {
    id: t.id,
    titulo: t.title,
    estado: t.status,
    prioridad: t.priority,
    proyecto: t.projectName,
    inicio: t.startDate,
    deadline: t.deadline,
    vencida: isOverdue(t, hoy),
    pasos: t.steps.length ? `${t.steps.filter((s) => s.done).length}/${t.steps.length}` : null,
    habitIds: t.habitIds,
  };
}

/** Tarea completa con sus pasos programados y los nombres de sus hábitos vinculados. */
export function detallarTarea(t: Task, hoy: string, habitos: { id: string; nombre: string }[]) {
  const plazo = { startDate: t.startDate, deadline: t.deadline };
  return {
    ...resumirTarea(t, hoy),
    descripcion: t.description,
    notas: t.notes,
    completada: t.completedAt,
    habitos: t.habitIds.map((id) => ({ id, nombre: habitos.find((h) => h.id === id)?.nombre ?? null })),
    pasos: t.steps.map((s) => ({
      id: s.id,
      titulo: s.title,
      hecho: s.done,
      inicio: s.startDate,
      dias: s.duracionDias,
      fin: finPaso(s),
      fueraDePlazo: fueraDePlazo(s, plazo),
    })),
  };
}

/** La pantalla Hoy, compacta: hábitos por franja (con ids y turnos), semanales y tareas por lista. */
export function resumirHoy(today: TodayPayload) {
  const { habits, tasks } = today;
  const lista = (ts: Task[]) => ts.slice(0, 50).map((t) => resumirTarea(t, today.date));
  return {
    franjaActual: habits.slotActual,
    pctHabitosDia: habits.pctDia,
    racha: habits.streak,
    habitosPorFranja: Object.fromEntries(
      FRANJAS.map((f) => [f, habits.porFranja[f].map((c) => ({ id: c.id, nombre: c.nombre, turno: c.turno, hecho: c.done, hechoEn: c.doneIn }))]),
    ),
    habitosSemanales: habits.semanales.map((h) => ({ id: h.id, nombre: h.nombre, meta: h.meta, hechas: h.hechas, hoy: h.hoy })),
    tareas: { hoy: lista(tasks.hoy), semana: lista(tasks.semana), incumplimiento: lista(tasks.incumplimiento) },
  };
}

/** Días del mes con algo: items legibles (tarea, paso, vence) y % de hábitos. */
export function resumirCalendario(cal: CalendarMonth) {
  return {
    mes: cal.mes,
    dias: cal.semanas
      .flat()
      .filter((d) => d.enMes && (d.items.length > 0 || d.habitos.pct != null))
      .map((d) => ({
        fecha: d.fecha,
        items: d.items.map((it) => ({ tipo: it.tipo, titulo: it.titulo, tareaId: it.tarea.id })),
        pctHabitos: d.habitos.pct,
      })),
  };
}

/** Revisión semanal: totales, proyectos con sus tareas y pasos, y la fila lun–dom de cada hábito. */
export function resumirRevision(r: WeeklyReport) {
  return {
    semana: { inicio: r.weekStart, fin: r.weekEnd },
    archivada: r.archived,
    pctHabitos: r.habitsPct,
    tareas: { hechas: r.tasksDone, total: r.tasksTotal, vencidas: r.overdue },
    racha: r.streak,
    proyectos: r.perProject.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      pctSemana: p.pct,
      pasos: `${p.pasosHechos}/${p.pasosTotal}`,
      avance: p.totalProgress,
      proximaAccion: p.nextAction,
      tareas: p.tasks.map((t) => ({ id: t.id, titulo: t.title, estado: t.status, vencida: t.overdue, pasos: `${t.pasosHechos}/${t.pasosTotal}` })),
    })),
    sinTocar: r.untouched.map((p) => p.nombre),
    habitos: r.perHabit.map((h) => ({
      id: h.id,
      nombre: h.nombre,
      meta: h.meta,
      pct: h.pct,
      dias: h.dias.filter((d) => !d.futuro).map((d) => ({ fecha: d.fecha, hechos: d.hechos, turnos: d.turnos })),
    })),
  };
}
