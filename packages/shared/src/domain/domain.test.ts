import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, diaDe, franjaDe, todayISO, weekRange, weekday } from './dates';
import { positionBetween } from './ordering';
import { bucketTasks, computeStreak, pct } from './metrics';

describe('dates', () => {
  it('semana de lunes a domingo', () => {
    // 2026-09-26 es sábado
    expect(weekday('2026-09-26')).toBe(6);
    expect(weekRange('2026-09-26')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    // domingo pertenece a la semana que empezó el lunes anterior
    expect(weekRange('2026-09-27')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    expect(weekRange('2026-09-28').start).toBe('2026-09-28');
  });

  it('aritmética cruza meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-09-24', '2026-09-26')).toBe(2);
  });

  const a = (hhmm: string, dia = 9) => new Date(2026, 9, dia, ...hhmm.split(':').map(Number));

  it('franja por hora con la jornada por defecto', () => {
    expect(franjaDe(a('00:00'))).toBe('manana');
    expect(franjaDe(a('11:59'))).toBe('manana');
    expect(franjaDe(a('12:00'))).toBe('tarde');
    expect(franjaDe(a('18:59'))).toBe('tarde');
    expect(franjaDe(a('19:00'))).toBe('noche');
    expect(diaDe(a('00:00'))).toBe('2026-10-09');
  });

  it('jornada que termina pasada la medianoche', () => {
    const j = { finDia: '03:00', horaTarde: '13:30', horaNoche: '20:00' };
    // 01:30 del día 10 sigue siendo la noche del 9
    expect(diaDe(a('01:30', 10), j)).toBe('2026-10-09');
    expect(franjaDe(a('01:30', 10), j)).toBe('noche');
    expect(diaDe(a('03:00', 10), j)).toBe('2026-10-10');
    expect(franjaDe(a('03:00', 10), j)).toBe('manana');
    expect(franjaDe(a('13:29'), j)).toBe('manana');
    expect(franjaDe(a('13:30'), j)).toBe('tarde');
    expect(franjaDe(a('20:00'), j)).toBe('noche');
    expect(franjaDe(a('23:59'), j)).toBe('noche');
    // el 1 de enero a la 1:00 aún es 31 de diciembre
    expect(diaDe(new Date(2027, 0, 1, 1, 0), j)).toBe('2026-12-31');
  });

  it('todayISO usa la jornada fijada', async () => {
    const { fijarJornada, JORNADA_POR_DEFECTO } = await import('./dates');
    fijarJornada({ finDia: '02:00', horaTarde: '12:00', horaNoche: '19:00' });
    try {
      expect(todayISO(a('01:00', 10))).toBe('2026-10-09');
    } finally {
      fijarJornada(JORNADA_POR_DEFECTO);
    }
  });
});

describe('positionBetween', () => {
  it('punto medio entre vecinos', () => expect(positionBetween(1000, 2000)).toBe(1500));
  it('al final', () => expect(positionBetween(3000, null)).toBe(4000));
  it('al inicio', () => expect(positionBetween(null, 1000)).toBe(0));
  it('lista vacía', () => expect(positionBetween()).toBe(1000));
});

describe('computeStreak', () => {
  const today = '2026-09-26';
  const logs = (entries: Record<string, number>) => new Map(Object.entries(entries));

  it('cuenta días completos consecutivos hacia atrás', () => {
    expect(computeStreak(logs({ '2026-09-25': 4, '2026-09-24': 4, '2026-09-22': 4 }), today, () => 4)).toBe(2);
  });
  it('hoy completo suma', () => {
    expect(computeStreak(logs({ '2026-09-26': 4, '2026-09-25': 4 }), today, () => 4)).toBe(2);
  });
  it('hoy incompleto no rompe la racha', () => {
    expect(computeStreak(logs({ '2026-09-26': 1, '2026-09-25': 4 }), today, () => 4)).toBe(1);
  });
  it('día parcial rompe', () => {
    expect(computeStreak(logs({ '2026-09-25': 3, '2026-09-24': 4 }), today, () => 4)).toBe(0);
  });
  it('sin hábitos no hay racha', () => expect(computeStreak(logs({}), today, () => 0)).toBe(0));
  it('un día sin hábitos vigentes corta la racha', () => {
    const totalOn = (d: string) => (d >= '2026-09-25' ? 1 : 0); // el hábito existe desde el 25
    expect(computeStreak(logs({ '2026-09-25': 1, '2026-09-24': 1 }), today, totalOn)).toBe(1);
  });
});

describe('bucketTasks', () => {
  const today = '2026-09-26';
  const weekEnd = '2026-09-27';
  const t = (id: string, o: Partial<{ status: string; deadline: string; startDate: string; completedAt: string }>) => ({
    id,
    status: 'por_hacer',
    deadline: null,
    startDate: null,
    completedAt: null,
    ...o,
  });
  const tasks = [
    t('hoy', { deadline: today }),
    t('inicioHoy', { startDate: today }),
    t('domingo', { deadline: weekEnd }),
    t('proxima', { deadline: '2026-10-05' }),
    t('vencida', { deadline: '2026-09-24' }),
    t('hechaVencida', { deadline: '2026-09-24', status: 'hecha', completedAt: '2026-09-25' }),
    t('hechaHoy', { deadline: today, status: 'hecha', completedAt: today }),
    t('sinFecha', {}),
  ];
  const b = bucketTasks(tasks, today, weekEnd, (x) => x.completedAt === today);
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it('hoy', () => expect(ids(b.hoy)).toEqual(['hoy', 'inicioHoy', 'hechaHoy']));
  it('semana incluye hoy', () => expect(ids(b.semana)).toEqual(['hoy', 'inicioHoy', 'domingo', 'hechaHoy']));
  it('incumplimiento solo vencidas sin terminar', () => expect(ids(b.incumplimiento)).toEqual(['vencida']));
  it('las hechas de otros días se ocultan', () => expect(ids(b.todas)).not.toContain('hechaVencida'));
  it('todas excluye vencidas', () => expect(ids(b.todas)).toEqual(['hoy', 'inicioHoy', 'domingo', 'proxima', 'hechaHoy', 'sinFecha']));
});

describe('pct', () => {
  it('redondea y evita división por cero', () => {
    expect(pct(2, 3)).toBe(67);
    expect(pct(0, 0)).toBe(0);
  });
});

describe('bucketTasks con pasos programados', () => {
  // miércoles 7 oct 2026; semana del lunes 5 al domingo 11
  const today = '2026-10-07';
  const weekEnd = '2026-10-11';
  const paso = (startDate: string, duracionDias: number, done = false) => ({ startDate, duracionDias, done });
  const t = (id: string, o: Partial<{ deadline: string; startDate: string; steps: ReturnType<typeof paso>[] }> = {}) => ({
    id,
    status: 'por_hacer',
    deadline: null,
    startDate: null,
    completedAt: null,
    steps: [] as ReturnType<typeof paso>[],
    ...o,
  });
  const tasks = [
    t('sinDeadlinePasoSemana', { steps: [paso('2026-10-09', 2)] }),
    t('deadlineProximaPasoSemana', { deadline: '2026-10-20', steps: [paso('2026-10-08', 1)] }),
    t('pasoHoy', { deadline: '2026-10-30', steps: [paso('2026-10-06', 3)] }),
    t('pasoHecho', { deadline: '2026-10-30', steps: [paso('2026-10-08', 1, true)] }),
    t('inicioSemana', { startDate: '2026-10-10' }),
    t('pasoProxima', { steps: [paso('2026-10-12', 2)] }),
  ];
  const b = bucketTasks(tasks, today, weekEnd, () => false);
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it('semana incluye tareas con un paso pendiente en la semana o que empiezan en ella', () =>
    expect(ids(b.semana)).toEqual(['sinDeadlinePasoSemana', 'deadlineProximaPasoSemana', 'pasoHoy', 'inicioSemana']));
  it('hoy incluye tareas con un paso pendiente que cubre hoy', () => expect(ids(b.hoy)).toEqual(['pasoHoy']));
});

describe('bucketTasks: tareas con rango', () => {
  const today = '2026-10-07';
  const weekEnd = '2026-10-11';
  const t = (id: string, startDate: string | null, deadline: string | null) => ({ id, status: 'por_hacer', startDate, deadline, completedAt: null, steps: [] });
  const b = bucketTasks(
    [
      t('empiezaHoyVenceViernes', today, '2026-10-09'),
      t('empezoAyerVenceViernes', '2026-10-06', '2026-10-09'),
      t('empiezaManana', '2026-10-08', '2026-10-09'),
      t('sinFinEmpezoAyer', '2026-10-06', null),
    ],
    today,
    weekEnd,
    () => false,
  );
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  it('sale en hoy todos los días de su rango inicio–deadline', () => expect(ids(b.hoy)).toEqual(['empiezaHoyVenceViernes', 'empezoAyerVenceViernes']));
  it('no antes de empezar; sin deadline, solo el día que empieza', () => {
    expect(ids(b.hoy)).not.toContain('empiezaManana');
    expect(ids(b.hoy)).not.toContain('sinFinEmpezoAyer');
  });
  it('del mismo rango, mañana y pasado también', () => {
    for (const dia of ['2026-10-08', '2026-10-09']) {
      expect(ids(bucketTasks([t('r', today, '2026-10-09')], dia, weekEnd, () => false).hoy)).toEqual(['r']);
    }
    expect(ids(bucketTasks([t('r', today, '2026-10-09')], '2026-10-10', weekEnd, () => false).hoy)).toEqual([]);
  });
});
