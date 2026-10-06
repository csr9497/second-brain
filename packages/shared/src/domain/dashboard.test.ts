import { describe, expect, it } from 'vitest';
import type { HabitSlot, Task } from '../index';
import { buildToday, buildWeeklyReport, doneByDate, habitsOn, projectViews, type DashboardInput, type HabitRow, type ProjectRow } from './dashboard';

// Jueves 2026-10-01, 15:00 hora local → franja "tarde"; semana 28 sep – 4 oct
const now = new Date(2026, 9, 1, 15, 0);
const today = '2026-10-01';

// Timestamps a las 10:00 locales del día indicado (mes 1-12)
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).toISOString();
const per = (desde: string, hasta: string | null = null, turnos: HabitSlot[][] = [['manana']]) => ({ desde, hasta, turnos });
const habit = (id: string, o: Partial<HabitRow> = {}): HabitRow => ({
  id,
  nombre: id,
  position: 1,
  periods: [per(at(2026, 9, 1))],
  ...o,
});
const habits: HabitRow[] = [
  habit('h1', { nombre: 'Ejercicio' }),
  habit('h2', { nombre: 'Leer', position: 2, periods: [per(at(2026, 9, 1), null, [['tarde']])] }),
];
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
    { habitId: 'h1', fecha: today, slot: 'manana' },
    { habitId: 'h1', fecha: '2026-09-30', slot: 'manana' },
    { habitId: 'h2', fecha: '2026-09-30', slot: 'tarde' },
    { habitId: 'h1', fecha: '2026-09-29', slot: 'manana' },
    { habitId: 'h2', fecha: '2026-09-29', slot: 'tarde' },
    { habitId: 'borrado', fecha: '2026-09-28', slot: 'manana' }, // hábito inactivo: no cuenta
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
  const logs = (rows: [string, string, HabitSlot?][]) => rows.map(([habitId, fecha, slot = 'manana']) => ({ habitId, fecha, slot }));
  const base = { tasks: [], projects: [], now }; // jueves 2026-10-01

  it('con dos periodos el hábito no es vigente en el hueco', () => {
    const x = habit('x', { periods: [per(at(2026, 9, 1), at(2026, 9, 10)), per(at(2026, 9, 20))] });
    expect(habitsOn([x], '2026-09-09')).toEqual([x]);
    expect(habitsOn([x], '2026-09-15')).toEqual([]);
    expect(habitsOn([x], '2026-09-20')).toEqual([x]);
  });

  it('archivar y reactivar el mismo día no infla la racha', () => {
    // ayer solo se hizo "a"; "b" se archivó y reactivó hoy → ayer sigue incompleto
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('b', { periods: [per(at(2026, 9, 1), at(2026, 10, 1)), per(at(2026, 10, 1))] })],
      doneLogs: logs([['a', '2026-09-30']]),
    });
    expect(t.habits.streak).toBe(0);
    expect(Object.values(t.habits.porFranja).flat().map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('habitsOn incluye el día de creación y excluye desde el de archivado', () => {
    const x = habit('x', { periods: [per(at(2026, 9, 28), at(2026, 9, 30))] });
    expect(habitsOn([x], '2026-09-27')).toEqual([]);
    expect(habitsOn([x], '2026-09-28')).toEqual([x]);
    expect(habitsOn([x], '2026-09-29')).toEqual([x]);
    expect(habitsOn([x], '2026-09-30')).toEqual([]);
  });

  it('crear hoy un hábito no rompe la racha', () => {
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('nuevo', { periods: [per(at(2026, 10, 1))] })],
      doneLogs: logs([['a', '2026-10-01'], ['a', '2026-09-30'], ['a', '2026-09-29']]),
    });
    expect(t.habits.streak).toBe(2);
    expect(t.habits.pctDia).toBe(50);
  });

  it('archivar un hábito no reescribe los días pasados y lo saca de Hoy', () => {
    // ayer solo se hizo "a"; archivar hoy "b" no convierte ayer en un día completo
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('b', { periods: [per(at(2026, 9, 1), at(2026, 10, 1))] })],
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
        habit('viejo', { periods: [per(at(2026, 9, 1), at(2026, 9, 29))] }),
        habit('nuevo', { periods: [per(at(2026, 9, 30))] }),
      ],
      doneLogs: logs([['viejo', '2026-09-27'], ['viejo', '2026-09-28'], ['nuevo', '2026-09-30']]),
    });
    expect(t.habits.streak).toBe(1);
  });

  it('pctDia ignora el registro de hoy de un hábito archivado hoy', () => {
    const t = buildToday({
      ...base,
      habits: [habit('a'), habit('b', { periods: [per(at(2026, 9, 1), at(2026, 10, 1))] })],
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
        habits: [habit('a'), habit('nuevo', { periods: [per(at(2026, 9, 30))] })],
        doneLogs: logs([['a', '2026-09-28'], ['a', '2026-09-29'], ['nuevo', '2026-09-30']]),
      },
      false,
    );
    expect(r.habitsPct).toBe(50);
  });
});

describe('turnos', () => {
  const logs = (rows: [string, string, HabitSlot][]) => rows.map(([habitId, fecha, slot]) => ({ habitId, fecha, slot }));
  const base = { tasks: [], projects: [], now };
  const conTurnos = (id: string, turnos: HabitSlot[][]) => habit(id, { periods: [per(at(2026, 9, 1), null, turnos)] });

  it('Mañana + Noche con solo la mañana hecha: 50% y ficha en ambas pestañas', () => {
    const t = buildToday({ ...base, habits: [conTurnos('d', [['manana'], ['noche']])], doneLogs: logs([['d', '2026-10-01', 'manana']]) });
    expect(t.habits.pctDia).toBe(50);
    expect(t.habits.porFranja.manana.map((c) => [c.id, c.done])).toEqual([['d', true]]);
    expect(t.habits.porFranja.noche.map((c) => [c.id, c.done])).toEqual([['d', false]]);
  });

  it('Tarde o Noche hecho por la tarde: la ficha de noche sale hecha con doneIn tarde', () => {
    const t = buildToday({ ...base, habits: [conTurnos('w', [['tarde', 'noche']])], doneLogs: logs([['w', '2026-10-01', 'tarde']]) });
    expect(t.habits.pctDia).toBe(100);
    expect(t.habits.porFranja.noche[0]).toMatchObject({ id: 'w', done: true, doneIn: 'tarde', turno: ['tarde', 'noche'] });
  });

  it('un día con dos turnos exige los dos para la racha', () => {
    const t = buildToday({
      ...base,
      habits: [conTurnos('d', [['manana'], ['noche']])],
      doneLogs: logs([['d', '2026-09-30', 'manana'], ['d', '2026-09-30', 'noche'], ['d', '2026-09-29', 'manana']]),
    });
    expect(t.habits.streak).toBe(1);
  });

  it('cambiar los turnos hoy no reescribe los días pasados', () => {
    // hasta ayer era solo Mañana (hecho); desde hoy es Mañana + Noche
    const x = habit('x', { periods: [per(at(2026, 9, 1), at(2026, 10, 1)), per(at(2026, 10, 1), null, [['manana'], ['noche']])] });
    const t = buildToday({ ...base, habits: [x], doneLogs: logs([['x', '2026-09-30', 'manana'], ['x', '2026-09-29', 'manana']]) });
    expect(t.habits.streak).toBe(2);
    expect(t.habits.porFranja.noche.map((c) => c.id)).toEqual(['x']);
  });

  it('dos periodos que cubren el mismo día: gana el más reciente', () => {
    const x = habit('x', { periods: [per(at(2026, 9, 1), null, [['manana']]), per(at(2026, 9, 2), null, [['noche']])] });
    const t = buildToday({ ...base, habits: [x], doneLogs: [] });
    expect(t.habits.porFranja.manana).toEqual([]);
    expect(t.habits.porFranja.noche.map((c) => c.id)).toEqual(['x']);
  });

  it('habitsPct semanal cuenta turnos', () => {
    // lun 28 – jue 1, "d" = Mañana + Noche → 8 turnos; 3 hechos
    const r = buildWeeklyReport(
      {
        ...base,
        habits: [conTurnos('d', [['manana'], ['noche']])],
        doneLogs: logs([['d', '2026-09-28', 'manana'], ['d', '2026-09-28', 'noche'], ['d', '2026-09-29', 'manana']]),
      },
      false,
    );
    expect(r.habitsPct).toBe(38);
  });

  it('dos registros del mismo turno alternativo cuentan una vez', () => {
    const w = conTurnos('w', [['tarde', 'noche']]);
    expect(doneByDate([w], logs([['w', '2026-09-30', 'tarde'], ['w', '2026-09-30', 'noche']])).get('2026-09-30')).toBe(1);
  });
});
