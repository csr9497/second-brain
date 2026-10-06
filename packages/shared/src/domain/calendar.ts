// Calendario mensual: rejilla lunes→domingo con tareas, pasos y hábitos de cada día.
import type { HabitChip, HabitSlot, Step, Task } from '../index';
import { fichasDelDia, type DashboardInput, type HabitRow } from './dashboard';
import { addDays, weekday } from './dates';
import { pct } from './metrics';
import { finPaso } from './pasos';

/** Lo que se ve en una celda: tareas con rango, pasos y tareas que solo vencen. */
export interface ItemDia {
  key: string;
  tipo: 'tarea' | 'paso' | 'vence';
  titulo: string;
  tarea: Task;
  /** primer / último día del item */
  inicio: boolean;
  fin: boolean;
  /** mostrar el título: primer día o lunes (la barra continúa de la semana anterior) */
  etiqueta: boolean;
}

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
  /** Items legibles del día: por inicio del item, luego tipo (tarea, paso, vence) y key */
  items: ItemDia[];
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
  const ORDEN = { tarea: 0, paso: 1, vence: 2 } as const;
  const rangos: { key: string; tipo: ItemDia['tipo']; titulo: string; tarea: Task; desde: string; hasta: string }[] = [];
  for (const t of tasks) {
    if (t.startDate && (!t.deadline || t.startDate <= t.deadline)) {
      rangos.push({ key: `t-${t.id}`, tipo: 'tarea', titulo: t.title, tarea: t, desde: t.startDate, hasta: t.deadline ?? t.startDate });
    } else if (t.deadline) {
      rangos.push({ key: `v-${t.id}`, tipo: 'vence', titulo: t.title, tarea: t, desde: t.deadline, hasta: t.deadline });
    }
    for (const s of t.steps) {
      const fin = finPaso(s);
      if (s.startDate && fin) rangos.push({ key: `p-${s.id}`, tipo: 'paso', titulo: `↳ ${s.title}`, tarea: t, desde: s.startDate, hasta: fin });
    }
  }
  rangos.sort((a, b) => a.desde.localeCompare(b.desde) || ORDEN[a.tipo] - ORDEN[b.tipo] || a.key.localeCompare(b.key));

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
      items: rangos
        .filter((r) => r.desde <= fecha && fecha <= r.hasta)
        .map((r) => ({
          key: r.key,
          tipo: r.tipo,
          titulo: r.titulo,
          tarea: r.tarea,
          inicio: fecha === r.desde,
          fin: fecha === r.hasta,
          etiqueta: fecha === r.desde || weekday(fecha) === 1,
        })),
    });
  }
  const semanas: CalendarDay[][] = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return { mes, semanas };
}
