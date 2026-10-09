import type { HabitSlot, TodayPayload } from '../index';
import { pasosDelPeriodo } from './pasos';

export interface EstadoLiveActivity {
  /** Día (de la jornada) al que se refiere la card: los botones marcan los hábitos en esa fecha. */
  fecha: string;
  franja: HabitSlot;
  franjaCompleta: boolean;
  pctDia: number;
  habitos: { id: string; nombre: string; inicial: string; slot: HabitSlot; turno: HabitSlot[]; hecho: boolean }[];
  pasos: { id: string; titulo: string; tipo: 'paso' | 'tarea' }[];
  masPasos: number;
  actualizado: string;
}

const MAX_HABITOS = 4;
const MAX_PASOS = 5;
/** La card muestra 2 pasos; el resto va en «Ver N más» */
const VISIBLES = 2;

/** Estado de la Live Activity a partir de Hoy; null si no queda nada pendiente (la actividad se termina). */
export function estadoLiveActivity(today: TodayPayload, ahoraISO: string): EstadoLiveActivity | null {
  const franja = today.habits.slotActual;
  const fichas = today.habits.porFranja[franja];

  const vistos = new Set<string>();
  const habitos: EstadoLiveActivity['habitos'] = [];
  for (const f of fichas) {
    if (f.done) continue;
    // Un turno "o" puede repetirse como ficha; se identifica por hábito + franjas del turno
    const clave = `${f.id}|${f.turno.join(',')}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    habitos.push({ id: f.id, nombre: f.nombre, inicial: Array.from(f.nombre)[0] ?? '', slot: f.slot, turno: f.turno, hecho: false });
  }

  // Pasos del periodo "hoy", igual que las cards de Hoy (pasosDelPeriodo)
  const pasosTodos: EstadoLiveActivity['pasos'] = [];
  for (const t of today.tasks.hoy) {
    if (t.status === 'hecha') continue;
    const { visibles } = pasosDelPeriodo(t.steps, today.date, today.date);
    if (visibles.length === 0) {
      pasosTodos.push({ id: t.id, titulo: t.title, tipo: 'tarea' });
      continue;
    }
    const s = visibles.find((p) => !p.done);
    if (s) pasosTodos.push({ id: s.id, titulo: s.title, tipo: 'paso' });
  }

  if (habitos.length === 0 && pasosTodos.length === 0) return null;
  return {
    fecha: today.date,
    franja,
    franjaCompleta: fichas.length > 0 && habitos.length === 0,
    pctDia: today.habits.pctDia,
    habitos: habitos.slice(0, MAX_HABITOS),
    pasos: pasosTodos.slice(0, MAX_PASOS),
    masPasos: pasosTodos.length - Math.min(pasosTodos.length, VISIBLES),
    actualizado: ahoraISO,
  };
}
