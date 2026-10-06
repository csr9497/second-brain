import { finPaso } from '@sb/shared';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const diff = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);

/** "Sábado · 26 sep" */
export function headerDate(iso: string) {
  const d = parse(iso);
  return `${DIAS_LARGO[d.getUTCDay()]} · ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** "26 sep" */
export const shortDate = (iso: string) => {
  const d = parse(iso);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};

/** Texto del deadline relativo a hoy, y si está vencido. */
export function dueLabel(deadline: string | null, today: string): { text: string; over: boolean } | null {
  if (!deadline) return null;
  const n = diff(today, deadline);
  if (n === 0) return { text: 'vence hoy', over: false };
  if (n === 1) return { text: 'vence mañana', over: false };
  if (n < 0) return { text: `venció hace ${-n} día${n === -1 ? '' : 's'}`, over: true };
  const d = parse(deadline);
  return { text: `vence ${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`, over: false };
}

/** [1,3,6] → "Lun · Mié · Sáb" (empezando en lunes) */
export function scheduleLabel(days: number[]) {
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => days.includes(d))
    .map((d) => DIAS[d][0].toUpperCase() + DIAS[d].slice(1))
    .join(' · ');
}

export function greeting(hour = new Date().getHours()) {
  if (hour < 12) return 'Buenos días. Empieza el día aquí.';
  if (hour < 19) return 'Buenas tardes. Todo a un toque.';
  return 'Buenas noches. Cierra el día aquí.';
}

/** "6 oct → 8 oct" (o "6 oct" si dura un día); null si el paso no está programado. */
export function rangoPaso(p: { startDate: string | null; duracionDias: number | null }) {
  const fin = finPaso(p);
  if (!p.startDate || !fin) return null;
  return fin === p.startDate ? shortDate(p.startDate) : `${shortDate(p.startDate)} → ${shortDate(fin)}`;
}
