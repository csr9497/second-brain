import { describe, expect, it } from 'vitest';
import type { HabitChip, HabitSlot, Step, Task, TodayPayload } from '../index';
import { estadoLiveActivity } from './liveActivity';

const AHORA = '2026-10-01T20:00:00.000Z';
const HOY = '2026-10-01';

const chip = (id: string, o: Partial<HabitChip> = {}): HabitChip => ({
  id,
  nombre: id,
  position: 1,
  slot: 'tarde',
  turno: ['tarde'],
  done: false,
  doneIn: null,
  ...o,
});
const step = (id: string, o: Partial<Step> = {}): Step => ({
  id,
  taskId: 't',
  title: id,
  done: false,
  startDate: HOY,
  duracionDias: 1,
  duracionMin: null,
  position: 1,
  ...o,
});
const task = (id: string, steps: Step[] = [], o: Partial<Task> = {}): Task => ({
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
  deadline: HOY,
  minutosDia: null,
  position: 1,
  notes: null,
  completedAt: null,
  steps,
  habitIds: [],
  ...o,
});
const today = (tarde: HabitChip[], hoy: Task[] = [], pctDia = 50, extra: Partial<Record<HabitSlot, HabitChip[]>> = {}): TodayPayload => ({
  date: HOY,
  habits: { slotActual: 'tarde', porFranja: { manana: [], tarde, noche: [], ...extra }, pctDia, streak: 0, semanales: [] },
  tasks: { hoy, semana: [], todas: [], incumplimiento: [] },
  projects: [],
});

describe('estadoLiveActivity', () => {
  it('franja con pendientes: solo las fichas sin hacer', () => {
    const e = estadoLiveActivity(today([chip('a'), chip('b', { done: true, doneIn: 'tarde' })], [], 40), AHORA)!;
    expect(e.franja).toBe('tarde');
    expect(e.franjaCompleta).toBe(false);
    expect(e.pctDia).toBe(40);
    expect(e.habitos.map((h) => h.id)).toEqual(['a']);
    expect(e.habitos[0]).toMatchObject({ nombre: 'a', inicial: 'a', slot: 'tarde', turno: ['tarde'], hecho: false });
    expect(e.actualizado).toBe(AHORA);
  });

  it('franja completa con pasos pendientes', () => {
    const e = estadoLiveActivity(today([chip('a', { done: true, doneIn: 'tarde' })], [task('t1', [step('s1')])], 80), AHORA)!;
    expect(e.franjaCompleta).toBe(true);
    expect(e.habitos).toEqual([]);
    expect(e.pasos).toEqual([{ id: 's1', titulo: 's1', tipo: 'paso' }]);
  });

  it('nada pendiente devuelve null', () => {
    expect(estadoLiveActivity(today([chip('a', { done: true })], [task('t1', [step('s1', { done: true })])]), AHORA)).toBeNull();
    expect(estadoLiveActivity(today([]), AHORA)).toBeNull();
  });

  it('tope de 4 hábitos y de 5 pasos, con masPasos', () => {
    const chips = ['a', 'b', 'c', 'd', 'e'].map((id) => chip(id));
    const tareas = ['1', '2', '3', '4', '5', '6', '7'].map((n) => task(`t${n}`, [step(`s${n}`)]));
    const e = estadoLiveActivity(today(chips, tareas), AHORA)!;
    expect(e.habitos).toHaveLength(4);
    expect(e.pasos.map((p) => p.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(e.masPasos).toBe(5); // 7 pendientes en total, la card muestra 2
  });

  it('masPasos es 0 con 2 pasos o menos', () => {
    expect(estadoLiveActivity(today([], [task('t1', [step('s1')])]), AHORA)!.masPasos).toBe(0);
  });

  it('solo el primer paso pendiente de cada tarea', () => {
    const e = estadoLiveActivity(today([], [task('t1', [step('s0', { done: true }), step('s1'), step('s2')])]), AHORA)!;
    expect(e.pasos.map((p) => p.id)).toEqual(['s1']);
  });

  it('tarea sin pasos cuenta como tarea', () => {
    const e = estadoLiveActivity(today([], [task('t1')]), AHORA)!;
    expect(e.pasos).toEqual([{ id: 't1', titulo: 't1', tipo: 'tarea' }]);
  });

  it('pasos fuera de hoy no cuentan: la tarea misma', () => {
    const e = estadoLiveActivity(today([], [task('t1', [step('s1', { startDate: '2026-10-05' })])]), AHORA)!;
    expect(e.pasos).toEqual([{ id: 't1', titulo: 't1', tipo: 'tarea' }]);
  });

  it('excluye tareas hechas', () => {
    expect(estadoLiveActivity(today([], [task('t1', [], { status: 'hecha' })]), AHORA)).toBeNull();
  });

  it('inicial con emoji', () => {
    const e = estadoLiveActivity(today([chip('a', { nombre: '🏃 Correr' })]), AHORA)!;
    expect(e.habitos[0].inicial).toBe('🏃');
  });

  it('un turno con alternativas en la franja cuenta una vez', () => {
    const e = estadoLiveActivity(today([chip('a', { turno: ['tarde', 'noche'] }), chip('a', { turno: ['tarde', 'noche'] })]), AHORA)!;
    expect(e.habitos).toHaveLength(1);
  });
});
