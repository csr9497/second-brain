// Programación de los pasos de una tarea (días locales, fechas ISO 'YYYY-MM-DD').
import { addDays, daysBetween } from './dates';

type Programable = { startDate: string | null; duracionDias: number | null };

/** Último día del paso (inicio + días − 1), o null si no está programado. */
export const finPaso = (p: Programable) => (p.startDate && p.duracionDias ? addDays(p.startDate, p.duracionDias - 1) : null);

/** El paso empieza antes del inicio de la tarea o termina después de su deadline (lados sin fecha no cuentan). */
export function fueraDePlazo(p: Programable, tarea: { startDate: string | null; deadline: string | null }) {
  const fin = finPaso(p);
  if (!p.startDate || !fin) return false;
  return (tarea.startDate != null && p.startDate < tarea.startDate) || (tarea.deadline != null && fin > tarea.deadline);
}

/** Fechas seguidas desde `desde`: cada paso empieza el día siguiente al fin del anterior (duración 1 si no tiene). */
export function encadenar<T extends Programable>(pasos: T[], desde: string): T[] {
  let inicio = desde;
  return pasos.map((p) => {
    const duracionDias = p.duracionDias ?? 1;
    const r = { ...p, startDate: inicio, duracionDias };
    inicio = addDays(inicio, duracionDias);
    return r;
  });
}

/** Rango marcado entre dos días (en cualquier orden), inclusivo, con su duración en días. */
export function rangoSeleccion(a: string, b: string) {
  const [inicio, fin] = a <= b ? [a, b] : [b, a];
  return { inicio, fin, dias: daysBetween(inicio, fin) + 1 };
}
