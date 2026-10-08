import { describe, expect, it } from 'vitest';
import type { HabitSlot, Task } from '../index';
import { weekRange } from './dates';
import { buildMonthlyReport, buildReport, buildToday, buildWeeklyReport, doneByDate, habitsOn, projectViews, type DashboardInput, type HabitRow, type ProjectRow } from './dashboard';

// Jueves 2026-10-01, 15:00 hora local → franja "tarde"; semana 28 sep – 4 oct
const now = new Date(2026, 9, 1, 15, 0);
const today = '2026-10-01';

// Timestamps a las 10:00 locales del día indicado (mes 1-12)
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).toISOString();
const per = (desde: string, hasta: string | null = null, turnos: HabitSlot[][] = [['manana']], vecesSemana: number | null = null) => ({
  desde,
  hasta,
  turnos,
  vecesSemana,
});
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
  it('seguimiento por proyecto', () => {
    const p1 = r.perProject.find((p) => p.id === 'p1');
    expect(p1).toMatchObject({ pct: 50, done: 1, total: 2, overdue: 0, touched: false, color: 'azul' });
    expect(r.perProject.find((p) => p.id === 'p2')).toMatchObject({ total: 0, touched: true });
  });
  it('tareas en seguimiento con el progreso de sus pasos', () => {
    const step = (id: string, o: Partial<Task['steps'][number]> = {}) => ({ id, taskId: 't', title: id, done: false, startDate: null, duracionDias: null, duracionMin: null, position: 1, ...o });
    const tareas = [
      task('vieja', { projectId: 'p', status: 'hecha', deadline: '2026-09-20', completedAt: at(2026, 9, 20) }),
      task('hecha', { projectId: 'p', status: 'hecha', completedAt: at(2026, 9, 29) }),
      task('pend', {
        projectId: 'p',
        deadline: '2026-10-02',
        steps: [
          step('s2', { position: 2, done: true, startDate: '2026-09-29', duracionDias: 2 }),
          step('s1', { startDate: '2026-10-01', duracionDias: 5 }),
          step('s3', { position: 3 }),
        ],
      }),
      task('vencida', { projectId: 'p', deadline: '2026-09-30' }),
    ];
    const rp = buildWeeklyReport({ ...input, tasks: tareas, projects: [project('p')] }, false).perProject[0];
    expect(rp.tasks.map((t) => t.id)).toEqual(['vencida', 'pend', 'hecha']);
    expect([rp.pasosHechos, rp.pasosTotal]).toEqual([1, 3]);
    const pend = rp.tasks[1];
    expect(pend.pasos.map((s) => [s.id, s.inicio, s.fin, s.enSemana, s.fueraDePlazo])).toEqual([
      ['s1', '2026-10-01', '2026-10-05', true, true],
      ['s2', '2026-09-29', '2026-09-30', true, false],
      ['s3', null, null, false, false],
    ]);
  });
  it('cumplimiento por hábito: días transcurridos y futuros', () => {
    const [ej, leer] = r.perHabit;
    expect([ej.id, ej.hechos, ej.turnos, ej.pct]).toEqual(['h1', 3, 4, 75]);
    expect(leer.dias.map((d) => d.hechos)).toEqual([0, 1, 1, 0, 0, 0, 0]);
    expect(leer.dias.map((d) => d.futuro)).toEqual([false, false, false, false, true, true, true]);
    expect(leer.dias[4].turnos).toBe(0);
  });
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
    expect(r.perHabit[0].dias.slice(0, 2).map((d) => [d.hechos, d.turnos])).toEqual([[2, 2], [1, 2]]);
  });

  it('un hábito sin vigencia en la semana no sale en el reporte', () => {
    const r = buildWeeklyReport({ ...base, habits: [habit('viejo', { periods: [per(at(2026, 9, 1), at(2026, 9, 10))] })], doneLogs: [] }, false);
    expect(r.perHabit).toEqual([]);
  });

  it('dos registros del mismo turno alternativo cuentan una vez', () => {
    const w = conTurnos('w', [['tarde', 'noche']]);
    expect(doneByDate([w], logs([['w', '2026-09-30', 'tarde'], ['w', '2026-09-30', 'noche']])).get('2026-09-30')).toBe(1);
  });
});

describe('hábitos semanales', () => {
  const logs = (rows: [string, string][]) => rows.map(([habitId, fecha]) => ({ habitId, fecha, slot: 'tarde' as HabitSlot }));
  const base = { tasks: [], projects: [], now }; // jueves 2026-10-01; semana 28 sep – 4 oct
  const semanal = (id: string, meta: number, o: Partial<HabitRow> = {}) => habit(id, { periods: [per(at(2026, 9, 1), null, [['manana']], meta)], ...o });
  const diario = habit('d');

  it('no cuentan en el % del día ni en la racha, y salen aparte con los días de la semana', () => {
    const t = buildToday({
      ...base,
      habits: [diario, semanal('ing', 3, { nombre: 'Inglés', position: 2 })],
      doneLogs: [...logs([['ing', '2026-09-28'], ['ing', '2026-09-29'], ['ing', '2026-09-29'], ['ing', '2026-09-20']]), { habitId: 'd', fecha: '2026-09-30', slot: 'manana' }],
    });
    expect(t.habits.pctDia).toBe(0);
    expect(t.habits.streak).toBe(1);
    expect(Object.values(t.habits.porFranja).flat().map((c) => c.id)).toEqual(['d']);
    expect(t.habits.semanales).toEqual([{ id: 'ing', nombre: 'Inglés', position: 2, meta: 3, hechas: 2, hoy: false }]);
  });

  it('un semanal sin diarios no sostiene la racha', () => {
    const t = buildToday({ ...base, habits: [semanal('ing', 3)], doneLogs: logs([['ing', '2026-09-30'], ['ing', today]]) });
    expect(t.habits.streak).toBe(0);
    expect(t.habits.semanales[0].hoy).toBe(true);
  });

  it('en la revisión: % con tope en la meta y días marcados', () => {
    const r = buildWeeklyReport(
      { ...base, habits: [semanal('ing', 2)], doneLogs: logs([['ing', '2026-09-28'], ['ing', '2026-09-29'], ['ing', '2026-09-30']]) },
      false,
    );
    expect(r.habitsPct).toBe(100);
    expect(r.perHabit[0]).toMatchObject({ meta: 2, hechos: 3, turnos: 2, pct: 100 });
    expect(r.perHabit[0].dias.map((d) => [d.hechos, d.turnos])).toEqual([[1, 1], [1, 1], [1, 1], [0, 1], [0, 0], [0, 0], [0, 0]]);
  });

  it('el % semanal suma diarios en turnos y semanales con su meta completa', () => {
    // diario: 4 turnos (lun–jue), 2 hechos; semanal 3/sem: 1 hecho → (2 + 1) / (4 + 3)
    const r = buildWeeklyReport(
      {
        ...base,
        habits: [diario, semanal('ing', 3)],
        doneLogs: [...logs([['ing', '2026-09-28']]), ...['2026-09-28', '2026-09-29'].map((fecha) => ({ habitId: 'd', fecha, slot: 'manana' as HabitSlot }))],
      },
      false,
    );
    expect(r.habitsPct).toBe(43);
  });

  it('pasar de diario a semanal no reescribe los días anteriores', () => {
    const x = habit('x', { periods: [per(at(2026, 9, 1), at(2026, 9, 30)), per(at(2026, 9, 30), null, [['manana']], 4)] });
    const t = buildToday({ ...base, habits: [x], doneLogs: [{ habitId: 'x', fecha: '2026-09-29', slot: 'manana' }] });
    expect(t.habits.streak).toBe(0); // desde el miércoles no hay diarios vigentes: la racha se corta
    expect(t.habits.semanales[0]).toMatchObject({ meta: 4, hechas: 0 });
    const r = buildWeeklyReport({ ...base, habits: [x], doneLogs: [{ habitId: 'x', fecha: '2026-09-29', slot: 'manana' }] }, false);
    expect(r.perHabit[0]).toMatchObject({ meta: 4, hechos: 0 });
  });
});

describe('buildReport / buildMonthlyReport', () => {
  it('buildReport con el rango de la semana equivale a buildWeeklyReport', () => {
    expect(buildReport(input, weekRange(today), false)).toEqual(buildWeeklyReport(input, false));
    expect(buildReport(input, weekRange(today), true)).toEqual(buildWeeklyReport(input, true));
  });

  // Jueves 2026-10-15; mes 1–31 oct; transcurridos: 1–15
  const mitad = new Date(2026, 9, 15, 15, 0);
  const diario = habit('d');
  const semanal = habit('w', { position: 2, periods: [per(at(2026, 9, 1), null, [['manana']], 3)] });
  const dl = (id: string, fechas: string[]) => fechas.map((fecha) => ({ habitId: id, fecha, slot: 'manana' as HabitSlot }));
  const mes = { tasks: [], projects: [], now: mitad };

  it('límites del mes de now', () => {
    const r = buildMonthlyReport({ ...mes, habits: [diario], doneLogs: [] });
    expect([r.monthStart, r.monthEnd]).toEqual(['2026-10-01', '2026-10-31']);
    expect(r).not.toHaveProperty('weekStart');
    expect(r).not.toHaveProperty('archived');
  });

  it('habitsPct cuenta solo los días transcurridos', () => {
    const r = buildMonthlyReport({ ...mes, habits: [diario], doneLogs: dl('d', ['2026-10-01', '2026-10-02', '2026-10-03']) });
    expect(r.habitsPct).toBe(20); // 3 de 15
    expect(r.perHabit[0]).toMatchObject({ hechos: 3, turnos: 15 });
  });

  it('dias: uno por día del mes, pct null sin hábitos vigentes o en el futuro', () => {
    const nuevo = habit('n', { periods: [per(at(2026, 10, 10))] });
    const r = buildMonthlyReport({ ...mes, habits: [nuevo], doneLogs: dl('n', ['2026-10-10']) });
    expect(r.dias).toHaveLength(31);
    expect(r.dias[0]).toEqual({ fecha: '2026-10-01', pct: null, futuro: false }); // aún sin hábitos
    expect(r.dias[9]).toEqual({ fecha: '2026-10-10', pct: 100, futuro: false });
    expect(r.dias[10]).toEqual({ fecha: '2026-10-11', pct: 0, futuro: false });
    expect(r.dias[14]).toMatchObject({ fecha: '2026-10-15', futuro: false });
    expect(r.dias[15]).toEqual({ fecha: '2026-10-16', pct: null, futuro: true });
  });

  it('dias: pct redondeado sobre turnos de los diarios (semanales fuera)', () => {
    const dos = habit('t', { periods: [per(at(2026, 9, 1), null, [['manana'], ['tarde'], ['noche']])] });
    const r = buildMonthlyReport({ ...mes, habits: [dos, semanal], doneLogs: [...dl('t', ['2026-10-02']), ...dl('w', ['2026-10-02'])] });
    expect(r.dias[1].pct).toBe(33); // 1 de 3
  });

  it('semanal: suma la meta de cada semana del mes (tope en la meta y en los días de la ventana)', () => {
    // Semanas: 28 sep–4 oct (ventana 1–4 oct), 5–11, 12–18 (hasta el 15). Hechos: 2 + 1 + 0
    const r = buildMonthlyReport({ ...mes, habits: [semanal], doneLogs: dl('w', ['2026-10-01', '2026-10-02', '2026-10-06', '2026-09-30']) });
    expect(r.perHabit[0]).toMatchObject({ meta: 3, hechos: 3, turnos: 9 });
    expect(r.habitsPct).toBe(33);
  });

  it('perProject y perHabit cubren el mes', () => {
    const r = buildMonthlyReport({
      habits: [diario],
      doneLogs: [],
      projects: [project('p1')],
      tasks: [
        task('a', { projectId: 'p1', deadline: '2026-10-03', status: 'hecha' }),
        task('b', { projectId: 'p1', deadline: '2026-10-28' }),
        task('c', { projectId: 'p1', deadline: '2026-10-05' }), // vencida
        task('fuera', { projectId: 'p1', deadline: '2026-11-02' }),
      ],
      now: mitad,
    });
    expect(r.tasksTotal).toBe(3);
    expect(r.tasksDone).toBe(1);
    expect(r.overdue).toBe(1);
    expect(r.perProject[0]).toMatchObject({ total: 3, done: 1, overdue: 1, pct: 33 });
    expect(r.perHabit[0].dias).toHaveLength(31);
    expect(r.perHabit[0].dias[30].futuro).toBe(true);
  });
});
