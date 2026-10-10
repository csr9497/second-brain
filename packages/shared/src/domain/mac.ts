import type { HabitSlot, Jornada, TodayPayload } from '../index';
import { SLOT_NOMBRE } from '../turnos';
import type { AvisoProgramado, ConfigAvisos } from './avisos';
import { daysBetween, diaDe, jornadaActual } from './dates';
import { pasosDelPeriodo } from './pasos';

/**
 * Lo que la app de Mac necesita además del estado de la card (`estadoLiveActivity`), que sigue siendo pequeño para
 * iOS (ActivityKit limita el tamaño): el día completo para la barra y los widgets grandes.
 */
export interface ExtraMac {
  /** Día de la jornada (`today.date`) */
  fecha: string;
  franjaActual: HabitSlot;
  pctDia: number;
  racha: number;
  /** Las tres franjas con sus hábitos (un turno «o» repetido cuenta una vez por franja) */
  franjas: Record<HabitSlot, { id: string; nombre: string; inicial: string; slot: HabitSlot; hecho: boolean }[]>;
  semanales: { id: string; nombre: string; inicial: string; meta: number; hechas: number; hoy: boolean }[];
  /** Todos los pendientes de hoy (paso siguiente de cada tarea, o la tarea sin pasos), hasta 8 */
  pasos: { id: string; titulo: string; tipo: 'paso' | 'tarea'; proyecto: string | null }[];
  totalPasos: number;
}

const MAX_PASOS = 8;
const ORDEN: HabitSlot[] = ['manana', 'tarde', 'noche'];
const inicial = (n: string) => Array.from(n)[0] ?? '';

export function extraMac(today: TodayPayload): ExtraMac {
  const franjas = Object.fromEntries(
    ORDEN.map((f) => [
      f,
      [...new Map(today.habits.porFranja[f].map((c) => [c.id, c])).values()].map((c) => ({
        id: c.id,
        nombre: c.nombre,
        inicial: inicial(c.nombre),
        slot: c.slot,
        hecho: c.done,
      })),
    ]),
  ) as ExtraMac['franjas'];

  const pasos: ExtraMac['pasos'] = [];
  for (const t of today.tasks.hoy) {
    if (t.status === 'hecha') continue;
    const { visibles } = pasosDelPeriodo(t.steps, today.date, today.date);
    if (visibles.length === 0) {
      pasos.push({ id: t.id, titulo: t.title, tipo: 'tarea', proyecto: t.projectName });
      continue;
    }
    const s = visibles.find((p) => !p.done);
    if (s) pasos.push({ id: s.id, titulo: s.title, tipo: 'paso', proyecto: t.projectName });
  }

  return {
    fecha: today.date,
    franjaActual: today.habits.slotActual,
    pctDia: today.habits.pctDia,
    racha: today.habits.streak,
    franjas,
    semanales: today.habits.semanales.map((h) => ({ id: h.id, nombre: h.nombre, inicial: inicial(h.nombre), meta: h.meta, hechas: h.hechas, hoy: h.hoy })),
    pasos: pasos.slice(0, MAX_PASOS),
    totalPasos: pasos.length,
  };
}

/** Días sin actividad para avisar de un proyecto en curso parado. */
export const DIAS_PROYECTO_PARADO = 7;

/**
 * Aviso de tareas y proyectos (app de Mac): uno al día, a la hora de la mañana de 🔔 Avisos (09:00 si no hay), con lo
 * que vence hoy, lo vencido y los proyectos en curso sin actividad hace `DIAS_PROYECTO_PARADO` días o más.
 */
export function avisoPendientes(today: TodayPayload, config: ConfigAvisos | null, ahora: Date, j: Jornada = jornadaActual()): AvisoProgramado | null {
  if (!config?.activo) return null;
  const hora = config.horas.manana ?? '09:00';
  const [y, m, d] = today.date.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const finDia = j.finDia.split(':').map(Number);
  const cuando = new Date(y, m - 1, d + (h * 60 + min < finDia[0] * 60 + finDia[1] ? 1 : 0), h, min);
  if (cuando <= ahora) return null;

  const vencenHoy = today.tasks.hoy.filter((t) => t.status !== 'hecha' && t.deadline === today.date).map((t) => t.title);
  const vencidas = today.tasks.incumplimiento.length;
  const parados = today.projects
    .filter((p) => p.estado === 'en_curso' && daysBetween(diaDe(new Date(p.lastActivityAt), j), today.date) >= DIAS_PROYECTO_PARADO)
    .map((p) => p.nombre);
  if (vencenHoy.length === 0 && vencidas === 0 && parados.length === 0) return null;

  const partes: string[] = [];
  if (vencenHoy.length) partes.push(`Vence hoy: ${lista(vencenHoy)}`);
  if (vencidas) partes.push(`${vencidas} vencida${vencidas === 1 ? '' : 's'}`);
  if (parados.length) partes.push(`Sin avance hace ${DIAS_PROYECTO_PARADO}+ días: ${lista(parados)}`);
  const n = vencenHoy.length + vencidas;
  return {
    id: `${today.date}-pendientes`,
    franja: 'manana',
    cuando: cuando.toISOString(),
    titulo: n > 0 ? `${SLOT_NOMBRE.manana} · ${n} tarea${n === 1 ? '' : 's'} por cerrar` : 'Proyectos parados',
    cuerpo: partes.join(' · '),
    habitos: [],
    fecha: today.date,
  };
}

const lista = (xs: string[]) => (xs.length > 3 ? `${xs.slice(0, 3).join(', ')} +${xs.length - 3}` : xs.join(', '));
