import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, slotForHour, weekRange, weekday } from './dates';
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

  it('franja por hora', () => {
    expect(slotForHour(0)).toBe('manana');
    expect(slotForHour(11)).toBe('manana');
    expect(slotForHour(12)).toBe('tarde');
    expect(slotForHour(18)).toBe('tarde');
    expect(slotForHour(19)).toBe('noche');
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
