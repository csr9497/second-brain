// Calendario mensual: rejilla lunes→domingo con tareas, pasos y hábitos de cada día.
import type { HabitChip, HabitSlot, Step, Task } from '../index';
import { fichasDelDia, type DashboardInput, type HabitRow } from './dashboard';
import { addDays, weekday } from './dates';
import { pct } from './metrics';
import { finPaso } from './pasos';

export interface CalendarDay {
  fecha: string;
  enMes: boolean;
  esHoy: boolean;
  esFuturo: boolean;
  /** Tareas con deadline ese día, por position */
  vencen: Task[];
  /** Pasos programados que cubren ese día */
  pasos: { paso: Step; tarea: Task }[];
  /** Fichas de hábitos del día; pct null en días futuros o sin turnos */
  habitos: { porFranja: Record<HabitSlot, HabitChip[]>; turnos: number; hechos: number; pct: number | null };
}

export interface CalendarMonth {
  mes: string;
  semanas: CalendarDay[][];
}

/** 'YYYY-MM' de una fecha ISO. */
export const mesDe = (iso: string) => iso.slice(0, 7);

/** Suma n meses a 'YYYY-MM' (cruza años). */
export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Rejilla del mes: del lunes en o antes del día 1 al domingo en o después del último día. */
export function calendarGrid(mes: string): { start: string; end: string } {
  const primero = `${mes}-01`;
  const ultimo = addDays(`${sumarMeses(mes, 1)}-01`, -1);
  return { start: addDays(primero, -((weekday(primero) + 6) % 7)), end: addDays(ultimo, (7 - weekday(ultimo)) % 7) };
}

export function buildCalendar({
  mes,
  hoy,
  tasks,
  habits,
  doneLogs,
}: {
  mes: string;
  hoy: string;
  tasks: Task[];
  habits: HabitRow[];
  doneLogs: DashboardInput['doneLogs'];
}): CalendarMonth {
  const { start, end } = calendarGrid(mes);
  const dias: CalendarDay[] = [];
  for (let fecha = start; fecha <= end; fecha = addDays(fecha, 1)) {
    const { porFranja, turnos, hechos } = fichasDelDia(habits, doneLogs, fecha);
    const esFuturo = fecha > hoy;
    dias.push({
      fecha,
      enMes: mesDe(fecha) === mes,
      esHoy: fecha === hoy,
      esFuturo,
      vencen: tasks.filter((t) => t.deadline === fecha).sort((a, b) => a.position - b.position),
      pasos: tasks.flatMap((tarea) =>
        tarea.steps
          .filter((s) => s.startDate != null && s.startDate <= fecha && fecha <= (finPaso(s) ?? ''))
          .map((paso) => ({ paso, tarea })),
      ),
      habitos: { porFranja, turnos, hechos, pct: esFuturo || turnos === 0 ? null : pct(hechos, turnos) },
    });
  }
  const semanas: CalendarDay[][] = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return { mes, semanas };
}
