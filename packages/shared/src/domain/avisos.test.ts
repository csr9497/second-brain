import { describe, expect, it } from 'vitest';
import type { HabitChip, HabitSlot, TodayPayload } from '../index';
import { avisosDelDia, textoAviso } from './avisos';

const chip = (id: string, slot: HabitSlot, o: Partial<HabitChip> = {}): HabitChip => ({
  id, nombre: id, position: 1, slot, turno: [slot], done: false, doneIn: null, ...o,
});
const today = (porFranja: Partial<Record<HabitSlot, HabitChip[]>>, date = '2026-10-01'): TodayPayload => ({
  date,
  habits: { slotActual: 'manana', porFranja: { manana: [], tarde: [], noche: [], ...porFranja }, pctDia: 0, streak: 0, semanales: [] },
  tasks: { hoy: [], semana: [], todas: [], incumplimiento: [] },
  projects: [],
});
const horas = (manana: string | null, tarde: string | null, noche: string | null) => ({ activo: true, horas: { manana, tarde, noche } });
const J = { finDia: '00:00', horaTarde: '12:00', horaNoche: '19:00' };
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);

describe('textoAviso', () => {
  it('igual que la Edge Function: título con cuántos faltan y hasta 4 nombres', () => {
    expect(textoAviso('tarde', ['Agua'])).toEqual({ titulo: 'Tarde · te falta 1', cuerpo: 'Agua' });
    expect(textoAviso('noche', ['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ titulo: 'Noche · te faltan 6', cuerpo: 'a, b, c, d +2' });
  });
});

describe('avisosDelDia', () => {
  it('una por franja con hora y pendientes, solo las que no pasaron', () => {
    const t = today({ manana: [chip('a', 'manana')], tarde: [chip('b', 'tarde'), chip('c', 'tarde')], noche: [chip('d', 'noche')] });
    const r = avisosDelDia(t, horas('09:00', '17:00', '21:30'), local(1, 10), J);
    expect(r.map((a) => [a.franja, a.cuando])).toEqual([
      ['tarde', local(1, 17).toISOString()],
      ['noche', local(1, 21, 30).toISOString()],
    ]);
    expect(r[0]).toMatchObject({ id: '2026-10-01-tarde', titulo: 'Tarde · te faltan 2', cuerpo: 'b, c' });
  });

  it('sin pendientes en la franja o sin hora, no hay aviso', () => {
    const t = today({ tarde: [chip('b', 'tarde', { done: true, doneIn: 'tarde' })], noche: [chip('d', 'noche')] });
    expect(avisosDelDia(t, horas('09:00', '17:00', null), local(1, 8), J)).toEqual([]);
  });

  it('desactivado o sin configuración, nada', () => {
    const t = today({ tarde: [chip('b', 'tarde')] });
    expect(avisosDelDia(t, { ...horas(null, '17:00', null), activo: false }, local(1, 8), J)).toEqual([]);
    expect(avisosDelDia(t, null, local(1, 8), J)).toEqual([]);
  });

  it('un turno «o» repetido en la franja avisa una vez', () => {
    const t = today({ noche: [chip('x', 'noche', { turno: ['tarde', 'noche'] }), chip('x', 'noche', { turno: ['tarde', 'noche'] })] });
    expect(avisosDelDia(t, horas(null, null, '21:00'), local(1, 8), J)[0].cuerpo).toBe('x');
  });

  it('con fin_dia, una hora antes del fin cae en la madrugada siguiente', () => {
    const t = today({ noche: [chip('d', 'noche')] });
    const r = avisosDelDia(t, horas(null, null, '01:00'), local(1, 23), { ...J, finDia: '02:00' });
    expect(r.map((a) => a.cuando)).toEqual([local(2, 1).toISOString()]);
  });
});
