import { describe, expect, it } from 'vitest';
import type { Task } from '../index';
import { buildToday, buildWeeklyReport, type DashboardInput, type HabitRow, type ProjectRow } from './dashboard';

// Jueves 2026-10-01, 15:00 hora local → franja "tarde"; semana 28 sep – 4 oct
const now = new Date(2026, 9, 1, 15, 0);
const today = '2026-10-01';

const habits: HabitRow[] = [
  { id: 'h1', nombre: 'Ejercicio', slot: 'manana', position: 1 },
  { id: 'h2', nombre: 'Leer', slot: 'tarde', position: 2 },
];
const project = (id: string, o: Partial<ProjectRow> = {}): ProjectRow => ({
  id,
  nombre: id,
  estado: 'en_curso',
  prioridad: 'media',
  nextAction: null,
  scheduleDays: [],
  totalProgress: 0,
  lastActivityAt: '2026-09-01T10:00:00Z',
  ...o,
});
const task = (id: string, o: Partial<Task> = {}): Task => ({
  id,
  projectId: null,
  projectName: null,
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

const input: DashboardInput = {
  habits,
  doneLogs: [
    { habitId: 'h1', fecha: today },
    { habitId: 'h1', fecha: '2026-09-30' },
    { habitId: 'h2', fecha: '2026-09-30' },
    { habitId: 'h1', fecha: '2026-09-29' },
    { habitId: 'h2', fecha: '2026-09-29' },
    { habitId: 'borrado', fecha: '2026-09-28' }, // hábito inactivo: no cuenta
  ],
  tasks: [
    task('a', { projectId: 'p1', deadline: today, status: 'hecha', completedAt: new Date(2026, 9, 1, 9).toISOString() }),
    task('b', { projectId: 'p1', deadline: '2026-10-03' }),
    task('vencida', { deadline: '2026-09-29' }),
  ],
  projects: [
    project('p1', { scheduleDays: [] }),
    project('p2', { scheduleDays: [4], prioridad: 'baja', lastActivityAt: '2026-09-30T10:00:00Z' }), // jueves
    project('pausado', { estado: 'en_pausa' }),
  ],
  now,
};

describe('buildToday', () => {
  const t = buildToday(input);
  it('fecha, franja y % del día', () => {
    expect(t.date).toBe(today);
    expect(t.habits.slotActual).toBe('tarde');
    expect(t.habits.pctDia).toBe(50);
    expect(t.habits.porFranja.manana[0].done).toBe(true);
  });
  it('racha: hoy incompleto no rompe, 2 días previos completos', () => expect(t.habits.streak).toBe(2));
  it('solo proyectos en curso; hoy toca primero', () => {
    expect(t.projects.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(t.projects[1].pctSemana).toBe(50);
  });
  it('incumplimiento', () => expect(t.tasks.incumplimiento.map((x) => x.id)).toEqual(['vencida']));
});

describe('buildWeeklyReport', () => {
  const r = buildWeeklyReport(input, false);
  it('rango de la semana', () => expect([r.weekStart, r.weekEnd]).toEqual(['2026-09-28', '2026-10-04']));
  it('% hábitos sobre los días transcurridos (lun–jue = 4 días × 2 hábitos)', () => expect(r.habitsPct).toBe(63));
  it('tareas de la semana', () => expect([r.tasksDone, r.tasksTotal, r.overdue]).toEqual([1, 3, 1]));
  it('proyectos sin tocar esta semana', () => expect(r.untouched.map((p) => p.id)).toEqual(['p1']));
});
