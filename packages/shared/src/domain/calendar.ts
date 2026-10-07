// Calendario mensual: rejilla lunes→domingo con tareas, pasos y hábitos de cada día.
import type { HabitChip, HabitSlot, Step, Task } from '../index';
import { fichasDelDia, type DashboardInput, type HabitRow } from './dashboard';
import { addDays, daysBetween, weekday } from './dates';
import { pct } from './metrics';
import { finPaso } from './pasos';

/** Orden de los pasos dentro de un día: por tarea y, dentro de ella, el de su lista. */
const ordenPaso = (a: { paso: Step; tarea: Task }, b: { paso: Step; tarea: Task }) =>
  a.tarea.position - b.tarea.position || a.tarea.id.localeCompare(b.tarea.id) || a.paso.position - b.paso.position;

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
  /** fila fija de la barra dentro de su semana (para que se vea continua) */
  carril: number;
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
  /** Items legibles del día, por carril */
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

/**
 * Carril de cada rango en cada semana de la rejilla (`start` es lunes): el más bajo libre, en el
 * orden recibido, y el mismo todos los días de la semana. -1 si el rango no toca esa semana.
 */
export function carriles(rangos: { desde: string; hasta: string }[], start: string, end: string): number[][] {
  const semanas: number[][] = [];
  for (let ini = start; ini <= end; ini = addDays(ini, 7)) {
    const fin = addDays(ini, 6);
    const ocupado: string[] = []; // último día ocupado de cada carril
    semanas.push(
      rangos.map((r) => {
        if (r.hasta < ini || r.desde > fin) return -1;
        const desde = r.desde < ini ? ini : r.desde;
        let c = ocupado.findIndex((h) => h < desde);
        if (c === -1) c = ocupado.length;
        ocupado[c] = r.hasta;
        return c;
      }),
    );
  }
  return semanas;
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
  const rangos: { key: string; tipo: ItemDia['tipo']; titulo: string; tarea: Task; desde: string; hasta: string; orden?: number }[] = [];
  for (const t of tasks) {
    if (t.startDate && (!t.deadline || t.startDate <= t.deadline)) {
      rangos.push({ key: `t-${t.id}`, tipo: 'tarea', titulo: t.title, tarea: t, desde: t.startDate, hasta: t.deadline ?? t.startDate });
    } else if (t.deadline) {
      rangos.push({ key: `v-${t.id}`, tipo: 'vence', titulo: t.title, tarea: t, desde: t.deadline, hasta: t.deadline });
    }
    for (const s of t.steps) {
      const fin = finPaso(s);
      if (s.startDate && fin) {
        rangos.push({ key: `p-${s.id}`, tipo: 'paso', titulo: `↳ ${s.title}`, tarea: t, desde: s.startDate, hasta: fin, orden: s.position });
      }
    }
  }
  rangos.sort(
    (a, b) => a.desde.localeCompare(b.desde) || ORDEN[a.tipo] - ORDEN[b.tipo] || (a.tarea.position - b.tarea.position) || (a.orden ?? 0) - (b.orden ?? 0) || a.key.localeCompare(b.key),
  );
  const porSemana = carriles(rangos, start, end);

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
      ).sort(ordenPaso),
      habitos: { porFranja, turnos, hechos, pct: esFuturo || turnos === 0 ? null : pct(hechos, turnos) },
      items: rangos
        .map((r, i) => ({ r, carril: porSemana[Math.floor(daysBetween(start, fecha) / 7)][i] }))
        .filter(({ r }) => r.desde <= fecha && fecha <= r.hasta)
        .sort((a, b) => a.carril - b.carril)
        .map(({ r, carril }) => ({
          key: r.key,
          tipo: r.tipo,
          titulo: r.titulo,
          tarea: r.tarea,
          inicio: fecha === r.desde,
          fin: fecha === r.hasta,
          etiqueta: fecha === r.desde || weekday(fecha) === 1,
          carril,
        })),
    });
  }
  const semanas: CalendarDay[][] = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return { mes, semanas };
}
