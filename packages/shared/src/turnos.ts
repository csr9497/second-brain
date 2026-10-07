import type { HabitSlot } from './index';

// Textos de las franjas y de las expresiones de turnos ("y" de franjas alternativas "o")
const ORDEN: HabitSlot[] = ['manana', 'tarde', 'noche'];
export const SLOT_NOMBRE: Record<HabitSlot, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
const CON_ARTICULO: Record<HabitSlot, string> = { manana: 'la mañana', tarde: 'la tarde', noche: 'la noche' };

/** Franjas aún no usadas, en orden mañana → noche. */
export function franjasLibres(turnos: HabitSlot[][]): HabitSlot[] {
  const usadas = new Set(turnos.flat());
  return ORDEN.filter((f) => !usadas.has(f));
}

/** "Mañana + (Tarde o Noche)": paréntesis solo en turnos con alternativas cuando hay varios turnos. */
export function formatTurnos(turnos: HabitSlot[][]): string {
  return turnos
    .map((t) => {
      const texto = t.map((f) => SLOT_NOMBRE[f]).join(' o ');
      return turnos.length > 1 && t.length > 1 ? `(${texto})` : texto;
    })
    .join(' + ');
}

/** "Se marca 2 veces al día: por la mañana, y por la tarde o la noche". */
export function resumenTurnos(turnos: HabitSlot[][]): string {
  const partes = turnos.map((t) => `por ${t.map((f) => CON_ARTICULO[f]).join(' o ')}`);
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')}, y ${partes[partes.length - 1]}`;
  const n = turnos.length;
  return `Se marca ${n} ${n === 1 ? 'vez' : 'veces'} al día: ${lista}`;
}

/** "3 veces por semana" o, si es diario, sus turnos ("Mañana + Noche"). */
export function formatFrecuencia(h: { turnos: HabitSlot[][]; vecesSemana: number | null }): string {
  const n = h.vecesSemana;
  return n == null ? formatTurnos(h.turnos) : n === 7 ? 'Todos los días de la semana' : `${n} ${n === 1 ? 'vez' : 'veces'} por semana`;
}
