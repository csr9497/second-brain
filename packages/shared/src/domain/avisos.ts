import type { HabitSlot, Jornada, TodayPayload } from '../index';
import { SLOT_NOMBRE } from '../turnos';
import { jornadaActual } from './dates';

/** Horas de aviso por franja (`recordatorios_config`); null = sin aviso en esa franja. */
export interface ConfigAvisos {
  activo: boolean;
  horas: Record<HabitSlot, string | null>;
}

/** Aviso local de la app de Mac: lo programa Swift (UNUserNotificationCenter) en `cuando`. */
export interface AvisoProgramado {
  /** `${fecha}-${franja}`: reprogramar con el mismo id reemplaza el aviso. */
  id: string;
  franja: HabitSlot;
  /** ISO */
  cuando: string;
  titulo: string;
  cuerpo: string;
  /** Hábitos de la franja que faltan: el botón «Marcar todos» del aviso los marca en `fecha`. Vacío en otros avisos. */
  habitos: { id: string; slot: HabitSlot }[];
  /** Día de la jornada al que se refiere (para marcar). */
  fecha: string;
}

const ORDEN: HabitSlot[] = ['manana', 'tarde', 'noche'];
const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** «Tarde · te faltan 2» / «Agua, Leer»; hasta 4 nombres y luego +n. Mismo texto que la Edge Function `recordatorios`. */
export function textoAviso(franja: HabitSlot, habitos: string[]): { titulo: string; cuerpo: string } {
  const n = habitos.length;
  const cuerpo = n > 4 ? `${habitos.slice(0, 4).join(', ')} +${n - 4}` : habitos.join(', ');
  return { titulo: `${SLOT_NOMBRE[franja]} · te falta${n === 1 ? '' : 'n'} ${n}`, cuerpo };
}

/**
 * Avisos que quedan hoy: uno por franja con hora configurada y hábitos pendientes, a esa hora del día de Hoy
 * (`today.date`, el día de la jornada). Una hora anterior a `finDia` cae en la madrugada siguiente, como en
 * `recordatorios_por_enviar`. Los hábitos semanales no avisan (no están en `porFranja`).
 */
export function avisosDelDia(today: TodayPayload, config: ConfigAvisos | null, ahora: Date, j: Jornada = jornadaActual()): AvisoProgramado[] {
  if (!config?.activo) return [];
  const [y, m, d] = today.date.split('-').map(Number);
  const avisos: AvisoProgramado[] = [];
  for (const franja of ORDEN) {
    const hora = config.horas[franja];
    if (!hora) continue;
    const [h, min] = hora.split(':').map(Number);
    const cuando = new Date(y, m - 1, d + (minutos(hora) < minutos(j.finDia) ? 1 : 0), h, min);
    if (cuando <= ahora) continue;
    // Un turno «o» puede aparecer más de una vez en la franja: un nombre por hábito
    const fichas = [...new Map(today.habits.porFranja[franja].filter((c) => !c.done).map((c) => [c.id, c])).values()];
    if (fichas.length === 0) continue;
    avisos.push({
      id: `${today.date}-${franja}`,
      franja,
      cuando: cuando.toISOString(),
      ...textoAviso(franja, fichas.map((c) => c.nombre)),
      habitos: fichas.map((c) => ({ id: c.id, slot: c.slot })),
      fecha: today.date,
    });
  }
  return avisos;
}
