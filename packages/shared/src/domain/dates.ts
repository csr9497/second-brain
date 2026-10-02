// Fechas como strings ISO 'YYYY-MM-DD'. "Hoy" se calcula con la zona horaria del
// navegador. La aritmética se hace en UTC para evitar saltos por DST.
import type { HabitSlot } from '../index';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayISO = (now = new Date()) => toISO(now);

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

/** mañana <12h, tarde 12–19h, noche ≥19h */
export function slotForHour(hour: number): HabitSlot {
  if (hour < 12) return 'manana';
  if (hour < 19) return 'tarde';
  return 'noche';
}
