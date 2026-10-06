import { describe, expect, it } from 'vitest';
import type { HabitSlot, Task } from '../index';
import { buildCalendar, calendarGrid, mesDe, sumarMeses } from './calendar';
import type { HabitRow } from './dashboard';

const task = (id: string, o: Partial<Task> = {}): Task => ({
  id,
  projectId: null,
  projectName: null,
  projectColor: null,
  title: id,
  description: null,
  type: null,
  priority: 'media',
  status: 'por_hacer',
  startDate: null,
  deadline: null,
  position: 1000,
  notes: null,
  completedAt: null,
  steps: [],
  ...o,
});
const step = (id: string, startDate: string, duracionDias: number) => ({ id, taskId: 't', title: id, done: false, position: 1, startDate, duracionDias });
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).toISOString();
const habit = (id: string, turnos: HabitSlot[][], desde = at(2026, 10, 1)): HabitRow => ({
  id,
  nombre: id,
  position: 1,
  periods: [{ desde, hasta: null, turnos }],
});

describe('meses', () => {
  it('mesDe y sumarMeses (cruza años)', () => {
    expect(mesDe('2026-10-06')).toBe('2026-10');
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
  });
  it('rejilla de octubre 2026: lun 28 sep → dom 1 nov', () => expect(calendarGrid('2026-10')).toEqual({ start: '2026-09-28', end: '2026-11-01' }));
});

describe('buildCalendar', () => {
  const c = buildCalendar({
    mes: '2026-10',
    hoy: '2026-10-06',
    tasks: [task('vence', { deadline: '2026-10-06' }), task('larga', { steps: [step('p1', '2026-09-30', 3)] })],
    habits: [habit('a', [['manana'], ['noche']])],
    doneLogs: [{ habitId: 'a', fecha: '2026-10-05', slot: 'manana' }],
  });
  const dia = (f: string) => c.semanas.flat().find((d) => d.fecha === f)!;

  it('5 semanas de 7 días con relleno de otros meses', () => {
    expect(c.semanas).toHaveLength(5);
    expect(c.semanas.every((s) => s.length === 7)).toBe(true);
    expect(dia('2026-09-28').enMes).toBe(false);
    expect(dia('2026-10-06').esHoy).toBe(true);
  });
  it('tareas por deadline', () => expect(dia('2026-10-06').vencen.map((t) => t.id)).toEqual(['vence']));
  it('un paso que cruza de mes cubre cada día de su rango', () => {
    expect(dia('2026-09-30').pasos.map((p) => p.paso.id)).toEqual(['p1']);
    expect(dia('2026-10-02').pasos.map((p) => p.tarea.id)).toEqual(['larga']);
    expect(dia('2026-10-03').pasos).toHaveLength(0);
  });
  it('% por turnos en un día pasado; null en el futuro y en días sin hábitos', () => {
    expect(dia('2026-10-05').habitos.pct).toBe(50);
    expect(dia('2026-10-07').habitos.pct).toBeNull();
    expect(dia('2026-10-07').habitos.porFranja.noche.map((h) => h.id)).toEqual(['a']);
    expect(dia('2026-09-28').habitos.pct).toBeNull();
  });
});
