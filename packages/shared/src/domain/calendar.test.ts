import { describe, expect, it } from 'vitest';
import type { HabitSlot, Task } from '../index';
import { buildCalendar, calendarGrid, carriles, mesDe, sumarMeses } from './calendar';
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
  habitIds: [],
  ...o,
});
const step = (id: string, startDate: string, duracionDias: number) => ({ id, taskId: 't', title: id, done: false, position: 1, startDate, duracionDias, duracionMin: null });
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).toISOString();
const habit = (id: string, turnos: HabitSlot[][], desde = at(2026, 10, 1)): HabitRow => ({
  id,
  nombre: id,
  position: 1,
  periods: [{ desde, hasta: null, turnos, vecesSemana: null }],
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

describe('items por día', () => {
  const c = buildCalendar({
    mes: '2026-10',
    hoy: '2026-10-06',
    tasks: [
      // jue 8 → mar 13: cruza el lunes 12
      task('rango', { title: 'Rango', startDate: '2026-10-08', deadline: '2026-10-13', steps: [step('p', '2026-10-09', 2)] }),
      task('soloDeadline', { title: 'Solo deadline', deadline: '2026-10-09' }),
    ],
    habits: [],
    doneLogs: [],
  });
  const items = (f: string) => c.semanas.flat().find((d) => d.fecha === f)!.items;

  it('la tarea con rango ocupa sus días y se etiqueta al inicio y cada lunes', () => {
    expect(items('2026-10-08').find((i) => i.key === 't-rango')).toMatchObject({ tipo: 'tarea', inicio: true, etiqueta: true });
    expect(items('2026-10-10').find((i) => i.key === 't-rango')).toMatchObject({ inicio: false, etiqueta: false });
    expect(items('2026-10-12').find((i) => i.key === 't-rango')).toMatchObject({ etiqueta: true });
    expect(items('2026-10-13').find((i) => i.key === 't-rango')).toMatchObject({ fin: true });
    expect(items('2026-10-14').find((i) => i.key === 't-rango')).toBeUndefined();
  });
  it('solo deadline → vence; los pasos son items de paso', () => {
    expect(items('2026-10-09').map((i) => [i.tipo, i.titulo])).toEqual([
      ['tarea', 'Rango'],
      ['paso', '↳ p'],
      ['vence', 'Solo deadline'],
    ]);
  });
});

describe('tareas que cruzan el mes o solo tienen inicio', () => {
  const c = buildCalendar({
    mes: '2026-10',
    hoy: '2026-10-06',
    tasks: [
      task('larga', { startDate: '2026-09-25', deadline: '2026-11-20' }),
      task('soloInicio', { startDate: '2026-10-15' }),
    ],
    habits: [],
    doneLogs: [],
  });
  const dias = c.semanas.flat();

  it('una tarea del 25 sep al 20 nov aparece en todos los días de la rejilla de octubre', () => {
    expect(dias.every((d) => d.items.some((i) => i.key === 't-larga' && i.tipo === 'tarea'))).toBe(true);
    // ni su inicio ni su fin caen en la rejilla (28 sep → 1 nov)
    expect(dias.some((d) => d.items.some((i) => i.key === 't-larga' && (i.inicio || i.fin)))).toBe(false);
  });
  it('una tarea con solo inicio ocupa ese día', () => {
    const con = dias.filter((d) => d.items.some((i) => i.key === 't-soloInicio'));
    expect(con.map((d) => d.fecha)).toEqual(['2026-10-15']);
    expect(con[0].items.find((i) => i.key === 't-soloInicio')).toMatchObject({ tipo: 'tarea', inicio: true, fin: true, etiqueta: true });
  });
});

describe('carriles: cada barra conserva su altura dentro de la semana', () => {
  it('reutiliza el carril libre más bajo y no cambia de carril día a día', () => {
    // semana lun 5 → dom 11 de octubre
    const r = [
      { desde: '2026-10-05', hasta: '2026-10-06' }, // A: carril 0
      { desde: '2026-10-06', hasta: '2026-10-09' }, // B: carril 1 (A ocupa el 0 el día 6)
      { desde: '2026-10-08', hasta: '2026-10-10' }, // C: carril 0 (A ya terminó)
      { desde: '2026-10-12', hasta: '2026-10-12' }, // fuera de la semana
    ];
    expect(carriles(r, '2026-10-05', '2026-10-11')).toEqual([[0, 1, 0, -1]]);
  });
  it('se recalcula por semana', () => {
    const r = [
      { desde: '2026-10-05', hasta: '2026-10-06' },
      { desde: '2026-10-06', hasta: '2026-10-13' },
    ];
    expect(carriles(r, '2026-10-05', '2026-10-18')).toEqual([
      [0, 1],
      [-1, 0],
    ]);
  });
  it('buildCalendar expone el carril de cada item', () => {
    const c = buildCalendar({
      mes: '2026-10',
      hoy: '2026-10-06',
      tasks: [task('a', { startDate: '2026-10-05', deadline: '2026-10-06' }), task('b', { startDate: '2026-10-06', deadline: '2026-10-09' })],
      habits: [],
      doneLogs: [],
    });
    const b = (f: string) => c.semanas.flat().find((d) => d.fecha === f)!.items.find((i) => i.key === 't-b')!.carril;
    expect([b('2026-10-06'), b('2026-10-07'), b('2026-10-09')]).toEqual([1, 1, 1]);
  });
});
