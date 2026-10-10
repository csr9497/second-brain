// Programación de los pasos de una tarea (días locales, fechas ISO 'YYYY-MM-DD').
import { addDays, daysBetween } from './dates';

type Programable = { startDate: string | null; duracionDias: number | null; duracionMin?: number | null };

/**
 * Día de trabajo por defecto de una tarea (8 h), si no tiene `minutosDia`: es lo que cabe en un día al encadenar
 * pasos por tiempo y la escala con la que el Gantt con zoom los dibuja dentro de un día.
 */
export const JORNADA_MIN = 8 * 60;
/** Salto al estirar un paso por tiempo, en minutos. */
export const PASO_MINUTOS = 15;
export const MIN_DIA = 1440;

/** Plazo de una tarea para programar y medir sus pasos. `minutosDia`: lo que se le dedica al día (null = JORNADA_MIN). */
export type PlazoTarea = { startDate: string | null; deadline: string | null; minutosDia?: number | null };

/** Minutos del día de trabajo de la tarea. */
export const minutosDia = (t?: { minutosDia?: number | null } | null) => t?.minutosDia ?? JORNADA_MIN;

/** Días de la tarea (inicio–deadline, inclusivo), o null si le falta un lado o el fin es antes del inicio. */
export function diasTarea(t: PlazoTarea) {
  if (!t.startDate || !t.deadline || t.deadline < t.startDate) return null;
  return daysBetween(t.startDate, t.deadline) + 1;
}

/** El paso es por tiempo estimado (minutos en un solo día). */
export const esPorTiempo = (p: Programable): p is Programable & { duracionMin: number } => p.duracionMin != null;

/** "1 h 30 min", "45 min", "2 h". */
export function duracionHoras(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
}

/** "3 días", "1 día" o "1 h 30 min": la duración de un paso programado, o null. */
export function duracionPaso(p: Programable) {
  if (!p.startDate) return null;
  if (esPorTiempo(p)) return duracionHoras(p.duracionMin);
  const d = p.duracionDias ?? 1;
  return `${d} ${d === 1 ? 'día' : 'días'}`;
}

/**
 * Pasos por tiempo de un mismo día, en el orden recibido (el de la lista), uno detrás de otro:
 * minuto de inicio y fin dentro del día (puede pasar del día de trabajo de la tarea si se cargó de más).
 */
export function tramosDelDia<T extends Programable>(pasos: T[]): { paso: T; desde: number; hasta: number }[] {
  let cursor = 0;
  return pasos.filter(esPorTiempo).map((paso) => {
    const r = { paso, desde: cursor, hasta: cursor + paso.duracionMin! };
    cursor = r.hasta;
    return r;
  });
}

/**
 * Completa la programación de un paso con la de su tarea:
 * - por tiempo y sin fecha → empieza el día de inicio de la tarea (si la tarea no tiene inicio, queda sin fecha);
 * - con fecha y sin días → dura hasta el deadline de la tarea (1 día si no hay deadline o empieza después).
 */
export function completarPaso<T extends Programable>(p: T, t: PlazoTarea): T {
  if (!p.startDate && p.duracionMin != null && t.startDate) return { ...p, startDate: t.startDate, duracionDias: 1 };
  if (p.startDate && p.duracionDias == null && p.duracionMin == null) {
    const hasta = t.deadline && t.deadline >= p.startDate ? daysBetween(p.startDate, t.deadline) + 1 : 1;
    return { ...p, duracionDias: hasta };
  }
  return p;
}

/** Minutos de trabajo de un paso: por tiempo, sus minutos; por días, días × día de trabajo de la tarea; sin fecha, 0. */
export function minutosPaso(p: Programable, t: PlazoTarea) {
  if (!p.startDate) return 0;
  return esPorTiempo(p) ? p.duracionMin : (p.duracionDias ?? 1) * minutosDia(t);
}

/**
 * Presupuesto de la tarea: lo que suman sus pasos programados frente a su duración (días × día de trabajo).
 * `total` es null si la tarea no tiene inicio y deadline válidos.
 */
export function presupuestoTarea(pasos: Programable[], t: PlazoTarea) {
  const usado = pasos.reduce((n, p) => n + minutosPaso(p, t), 0);
  const dias = diasTarea(t);
  const total = dias == null ? null : dias * minutosDia(t);
  return { usado, total, excede: total != null && usado > total };
}

/** "2 días 3 h", "5 h 30 min": minutos expresados en días de trabajo de `dia` minutos. */
export function duracionEnDias(min: number, dia = JORNADA_MIN) {
  const d = Math.floor(min / dia);
  const resto = min - d * dia;
  return [d ? `${d} ${d === 1 ? 'día' : 'días'}` : '', resto || !d ? duracionHoras(resto) : ''].filter(Boolean).join(' ');
}

/** Último día del paso (inicio + días − 1), o null si no está programado. */
export const finPaso = (p: Programable) => (p.startDate && p.duracionDias ? addDays(p.startDate, p.duracionDias - 1) : null);

/** El paso está programado y su rango toca [desde, hasta] (días inclusivos). */
export function pasoEnRango(p: Programable, desde: string, hasta: string) {
  const fin = finPaso(p);
  return p.startDate != null && fin != null && p.startDate <= hasta && fin >= desde;
}

/** Pasos de una tarea que caen en el periodo (los de hoy, los de la semana…), y cuántos quedan fuera. */
export function pasosDelPeriodo<T extends Programable>(pasos: T[], desde: string, hasta: string) {
  const visibles = pasos.filter((p) => pasoEnRango(p, desde, hasta));
  return { visibles, ocultos: pasos.length - visibles.length };
}

/** El paso empieza antes del inicio de la tarea o termina después de su deadline (lados sin fecha no cuentan). */
export function fueraDePlazo(p: Programable, tarea: { startDate: string | null; deadline: string | null }) {
  const fin = finPaso(p);
  if (!p.startDate || !fin) return false;
  return (tarea.startDate != null && p.startDate < tarea.startDate) || (tarea.deadline != null && fin > tarea.deadline);
}

/**
 * Pasos seguidos desde `desde`. Por días: cada uno empieza el día siguiente al fin del anterior (1 día si no tiene).
 * Por tiempo: se encadenan en el mismo día mientras quepan en el día de trabajo (`diaTrabajo`, por defecto JORNADA_MIN; el
 * de la tarea); el que no cabe pasa al día siguiente. Un paso más largo que el día ocupa un día para él solo.
 * Los que terminan después del deadline de la tarea los marca `fueraDePlazo`.
 */
export function encadenar<T extends Programable>(pasos: T[], desde: string, diaTrabajo = JORNADA_MIN): T[] {
  let dia = desde;
  let usado: number | null = null; // minutos ya ocupados en `dia` por pasos por tiempo
  return pasos.map((p) => {
    if (p.duracionMin != null) {
      const dur = Math.min(p.duracionMin, MIN_DIA);
      if (usado != null && usado + dur > diaTrabajo) {
        dia = addDays(dia, 1);
        usado = 0;
      }
      usado = (usado ?? 0) + dur;
      return { ...p, startDate: dia, duracionDias: 1, duracionMin: dur };
    }
    if (usado != null) {
      dia = addDays(dia, 1);
      usado = null;
    }
    const duracionDias = p.duracionDias ?? 1;
    const r = { ...p, startDate: dia, duracionDias };
    dia = addDays(dia, duracionDias);
    return r;
  });
}

/** Rango marcado entre dos días (en cualquier orden), inclusivo, con su duración en días. */
export function rangoSeleccion(a: string, b: string) {
  const [inicio, fin] = a <= b ? [a, b] : [b, a];
  return { inicio, fin, dias: daysBetween(inicio, fin) + 1 };
}
