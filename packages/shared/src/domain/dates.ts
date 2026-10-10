// Fechas como strings ISO 'YYYY-MM-DD'. "Hoy" se calcula con la zona horaria del
// navegador y la jornada del usuario. La aritmética se hace en UTC para evitar saltos por DST.
import type { HabitSlot, Jornada } from '../index';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const JORNADA_POR_DEFECTO: Jornada = { finDia: '00:00', horaTarde: '12:00', horaNoche: '19:00' };

// Jornada vigente. La app la fija al cargar la sesión (`fijarJornada`); hasta entonces, y en los tests, la de
// por defecto. Es estado global para que todo lo que pregunta «qué día es hoy» use la misma sin pasarla a mano.
let jornada: Jornada = JORNADA_POR_DEFECTO;
export const fijarJornada = (j: Jornada) => {
  jornada = j;
};
export const jornadaActual = () => jornada;

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Día al que pertenece un instante: antes de `finDia` todavía es el día anterior (su noche).
 * Misma regla que public.dia_y_franja(). Se compara la hora de reloj, no se restan milisegundos, por el DST.
 */
export function diaDe(d: Date, j: Jornada = jornada): string {
  const iso = toISO(d);
  return d.getHours() * 60 + d.getMinutes() < minutos(j.finDia) ? addDays(iso, -1) : iso;
}

export const todayISO = (now = new Date()) => diaDe(now);

/** Franja de un instante: mañana desde `finDia`, tarde desde `horaTarde`, noche desde `horaNoche` hasta `finDia`. */
export function franjaDe(d: Date, j: Jornada = jornada): HabitSlot {
  const fin = minutos(j.finDia);
  const desplazado = (d.getHours() * 60 + d.getMinutes() - fin + 1440) % 1440;
  if (desplazado < minutos(j.horaTarde) - fin) return 'manana';
  if (desplazado < minutos(j.horaNoche) - fin) return 'tarde';
  return 'noche';
}

/** Próximo instante en que cambia la franja (o el día): la primera de `finDia`, `horaTarde`, `horaNoche` después de `ahora`. */
export function proximaFrontera(ahora: Date, j: Jornada = jornada): Date {
  let proxima: Date | null = null;
  for (const dias of [0, 1]) {
    for (const hhmm of [j.finDia, j.horaTarde, j.horaNoche]) {
      const [h, m] = hhmm.split(':').map(Number);
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + dias, h, m);
      if (d > ahora && (!proxima || d < proxima)) proxima = d;
    }
  }
  return proxima!;
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** 0 = domingo … 6 = sábado (igual que schedule_days). */
export const weekday = (iso: string) => parse(iso).getUTCDay();

/** Semana de lunes a domingo que contiene `iso`. */
export function weekRange(iso: string): { start: string; end: string } {
  const offset = (weekday(iso) + 6) % 7; // días desde el lunes
  const start = addDays(iso, -offset);
  return { start, end: addDays(start, 6) };
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}
