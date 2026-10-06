import { describe, expect, it } from 'vitest';
import type { Task } from '../index';
import { buildToday, buildWeeklyReport, habitsOn, projectViews, type DashboardInput, type HabitRow, type ProjectRow } from './dashboard';

// Jueves 2026-10-01, 15:00 hora local → franja "tarde"; semana 28 sep – 4 oct
const now = new Date(2026, 9, 1, 15, 0);
const today = '2026-10-01';

// Timestamps a las 10:00 locales del día indicado (mes 1-12)
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).toISOString();
const habit = (id: string, o: Partial<HabitRow> = {}): HabitRow => ({
  id,
  nombre: id,
  slot: 'manana',
  position: 1,
  createdAt: at(2026, 9, 1),
  archivedAt: null,
  ...o,
});
const habits: HabitRow[] = [habit('h1', { nombre: 'Ejercicio' }), habit('h2', { nombre: 'Leer', slot: 'tarde', position: 2 })];
const project = (id: string, o: Partial<ProjectRow> = {}): ProjectRow => ({
  id,
  nombre: id,
  estado: 'en_curso',
  prioridad: 'media',
  nextAction: null,
  scheduleDays: [],
  totalProgress: 0,
  color: 'azul',
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

describe('projectViews', () => {
  it('projectViews propaga el color del proyecto', () => {
    const [p] = projectViews([project('p1', { color: 'violeta' })], [], '2026-10-05');
    expect(p.color).toBe('violeta');
  });
});

describe('vigencia de hábitos', () => {
  const logs = (pairs: [string, string][]) => pairs.map(([habitId, fecha]) => ({ habitId, fecha }));
  const base = { tasks: [], projects: [], now }; // jueves 2026-10-01

  it('habitsOn incluye el día de creación y excluye desde el de archivado', () => {
    const x = habit('x', { createdAt: at(2026, 9, 28), archivedAt: at(2026, 9, 30) });
    expect(habitsOn([x], '2026-09-27')).toEqual([]);
    expect(habitsOn([x], '2026-09-28')).toEqual([x]);
    expect(habitsOn([x], '2026-09-29')).toEqual([x]);
    expect(habitsOn([x], '2026-09-30')).toEqual([]);
  });

  it('crear hoy un hábito no rompe la racha', () => {
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('nuevo', { createdAt: at(2026, 10, 1) })],
      doneLogs: logs([['a', '2026-10-01'], ['a', '2026-09-30'], ['a', '2026-09-29']]),
    });
    expect(t.habits.streak).toBe(2);
    expect(t.habits.pctDia).toBe(50);
  });

  it('archivar un hábito no reescribe los días pasados y lo saca de Hoy', () => {
    // ayer solo se hizo "a"; archivar hoy "b" no convierte ayer en un día completo
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('b', { archivedAt: at(2026, 10, 1) })],
      doneLogs: logs([['a', '2026-09-30']]),
    });
    expect(t.habits.streak).toBe(0);
    expect(Object.values(t.habits.porFranja).flat().map((h) => h.id)).toEqual(['a']);
  });

  it('un día sin hábitos vigentes corta la racha', () => {
    // el 29 no hay hábitos vigentes: "viejo" se archivó ese día y "nuevo" nace el 30
    const t = buildToday({
      ...base,
      habits: [
        habit('viejo', { archivedAt: at(2026, 9, 29) }),
        habit('nuevo', { createdAt: at(2026, 9, 30) }),
      ],
      doneLogs: logs([['viejo', '2026-09-27'], ['viejo', '2026-09-28'], ['nuevo', '2026-09-30']]),
    });
    expect(t.habits.streak).toBe(1);
  });

  it('pctDia ignora el registro de hoy de un hábito archivado hoy', () => {
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('b', { archivedAt: at(2026, 10, 1) })],
      doneLogs: logs([['a', '2026-10-01'], ['b', '2026-10-01']]),
    });
    expect(t.habits.pctDia).toBe(100);
    expect(Object.values(t.habits.porFranja).flat().map((h) => h.id)).toEqual(['a']);
  });

  it('habitsPct semanal suma los hábitos vigentes de cada día', () => {
    // lun 28 – jue 1: "a" vigente 4 días; "nuevo" desde el miércoles 30 → 6 hábito-día, 3 hechos
    const r = buildWeeklyReport(
      {
        ...base,
        habits: [habit('a'), habit('nuevo', { createdAt: at(2026, 9, 30) })],
        doneLogs: logs([['a', '2026-09-28'], ['a', '2026-09-29'], ['nuevo', '2026-09-30']]),
      },
      false,
    );
    expect(r.habitsPct).toBe(50);
  });
});
