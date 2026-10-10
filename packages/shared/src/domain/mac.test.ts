import { describe, expect, it } from 'vitest';
import type { HabitChip, HabitSlot, Project, Step, Task, TodayPayload } from '../index';
import { avisoPendientes, extraMac } from './mac';

const HOY = '2026-10-01';
const J = { finDia: '00:00', horaTarde: '12:00', horaNoche: '19:00' };
const chip = (id: string, slot: HabitSlot, o: Partial<HabitChip> = {}): HabitChip => ({ id, nombre: id, position: 1, slot, turno: [slot], done: false, doneIn: null, ...o });
const step = (id: string, o: Partial<Step> = {}): Step => ({ id, taskId: 't', title: id, done: false, startDate: HOY, duracionDias: 1, duracionMin: null, position: 1, ...o });
const task = (id: string, o: Partial<Task> = {}): Task => ({
  id, projectId: null, projectName: null, projectColor: null, title: id, description: null, type: null, priority: 'media',
  status: 'por_hacer', startDate: null, deadline: HOY, minutosDia: null, position: 1, notes: null, completedAt: null, steps: [], habitIds: [], ...o,
});
const proyecto = (nombre: string, estado: string, lastActivityAt: string): Project => ({
  id: nombre, nombre, estado, prioridad: null, nextAction: null, scheduleDays: [], totalProgress: 0, color: 'azul', pctSemana: 0, hoyToca: false, lastActivityAt,
});
const today = (o: { porFranja?: Partial<Record<HabitSlot, HabitChip[]>>; hoy?: Task[]; inc?: Task[]; projects?: Project[] } = {}): TodayPayload => ({
  date: HOY,
  habits: {
    slotActual: 'tarde',
    porFranja: { manana: [], tarde: [], noche: [], ...o.porFranja },
    pctDia: 40,
    streak: 3,
    semanales: [{ id: 'w', nombre: 'Correr', position: 1, meta: 3, hechas: 1, hoy: false }],
  },
  tasks: { hoy: o.hoy ?? [], semana: [], todas: [], incumplimiento: o.inc ?? [] },
  projects: o.projects ?? [],
});
const horas = (manana: string | null) => ({ activo: true, horas: { manana, tarde: null, noche: null } });
const local = (d: number, h: number) => new Date(2026, 9, d, h);

describe('extraMac', () => {
  it('las tres franjas, semanales, racha y todos los pendientes', () => {
    const t = today({
      porFranja: { manana: [chip('a', 'manana', { done: true })], noche: [chip('x', 'noche'), chip('x', 'noche')] },
      hoy: [task('t1', { steps: [step('s1', { done: true }), step('s2')], projectName: 'Tesis' }), task('t2'), task('t3', { status: 'hecha' })],
    });
    const e = extraMac(t);
    expect(e.franjas.manana).toEqual([{ id: 'a', nombre: 'a', inicial: 'a', slot: 'manana', hecho: true }]);
    expect(e.franjas.noche.map((h) => h.id)).toEqual(['x']);
    expect(e.semanales[0]).toMatchObject({ nombre: 'Correr', inicial: 'C', meta: 3, hechas: 1, hoy: false });
    expect(e.racha).toBe(3);
    expect(e.franjaActual).toBe('tarde');
    expect(e.pasos).toEqual([
      { id: 's2', titulo: 's2', tipo: 'paso', proyecto: 'Tesis' },
      { id: 't2', titulo: 't2', tipo: 'tarea', proyecto: null },
    ]);
    expect(e.totalPasos).toBe(2);
  });

  it('tope de 8 pasos con el total', () => {
    const e = extraMac(today({ hoy: Array.from({ length: 10 }, (_, i) => task(`t${i}`)) }));
    expect(e.pasos).toHaveLength(8);
    expect(e.totalPasos).toBe(10);
  });
});

describe('avisoPendientes', () => {
  it('vence hoy, vencidas y proyectos parados en un aviso a la hora de la mañana', () => {
    const t = today({
      hoy: [task('Informe'), task('Otra', { deadline: '2026-10-05' })],
      inc: [task('Vieja', { deadline: '2026-09-20' })],
      projects: [proyecto('Tesis', 'en_curso', '2026-09-20T15:00:00Z'), proyecto('Web', 'en_curso', '2026-09-30T15:00:00Z'), proyecto('Pausa', 'en_pausa', '2026-08-01T15:00:00Z')],
    });
    const a = avisoPendientes(t, horas('08:30'), local(1, 7), J)!;
    expect(a.cuando).toBe(new Date(2026, 9, 1, 8, 30).toISOString());
    expect(a.titulo).toBe('Mañana · 2 tareas por cerrar');
    expect(a.cuerpo).toBe('Vence hoy: Informe · 1 vencida · Sin avance hace 7+ días: Tesis');
    expect(a.habitos).toEqual([]);
  });

  it('sin hora de la mañana, a las 09:00; pasada la hora o sin nada, no hay aviso', () => {
    const t = today({ hoy: [task('Informe')] });
    expect(avisoPendientes(t, horas(null), local(1, 7), J)!.cuando).toBe(new Date(2026, 9, 1, 9).toISOString());
    expect(avisoPendientes(t, horas(null), local(1, 10), J)).toBeNull();
    expect(avisoPendientes(today(), horas(null), local(1, 7), J)).toBeNull();
    expect(avisoPendientes(t, { ...horas(null), activo: false }, local(1, 7), J)).toBeNull();
  });

  it('solo proyectos parados', () => {
    const t = today({ projects: [proyecto('Tesis', 'en_curso', '2026-09-01T15:00:00Z')] });
    expect(avisoPendientes(t, horas('09:00'), local(1, 7), J)).toMatchObject({ titulo: 'Proyectos parados', cuerpo: 'Sin avance hace 7+ días: Tesis' });
  });
});
