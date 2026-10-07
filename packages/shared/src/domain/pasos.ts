// Programación de los pasos de una tarea (días locales, fechas ISO 'YYYY-MM-DD').
import { addDays, daysBetween } from './dates';

type Programable = { startDate: string | null; duracionDias: number | null; duracionMin?: number | null };

/**
 * Jornada de un día para encadenar pasos por tiempo (8 h): si el siguiente no cabe, pasa al día siguiente.
 * También es la escala con la que el Gantt con zoom dibuja los pasos por tiempo dentro de un día.
 */
export const JORNADA_MIN = 8 * 60;
/** Salto al estirar un paso por tiempo, en minutos. */
export const PASO_MINUTOS = 15;
export const MIN_DIA = 1440;

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
 * minuto de inicio y fin dentro de la jornada (puede pasar de JORNADA_MIN si se cargó de más).
 */
export function tramosDelDia<T extends Programable>(pasos: T[]): { paso: T; desde: number; hasta: number }[] {
  let cursor = 0;
  return pasos.filter(esPorTiempo).map((paso) => {
    const r = { paso, desde: cursor, hasta: cursor + paso.duracionMin! };
    cursor = r.hasta;
    return r;
  });
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
 * Por tiempo: se encadenan en el mismo día mientras quepan en la jornada (JORNADA_MIN); el que no cabe pasa al día
 * siguiente. Un paso más largo que la jornada ocupa un día para él solo.
 */
export function encadenar<T extends Programable>(pasos: T[], desde: string): T[] {
  let dia = desde;
  let usado: number | null = null; // minutos ya ocupados en `dia` por pasos por tiempo
  return pasos.map((p) => {
    if (p.duracionMin != null) {
      const dur = Math.min(p.duracionMin, MIN_DIA);
      if (usado != null && usado + dur > JORNADA_MIN) {
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
