import { describe, expect, it } from 'vitest';
import { encadenar, finPaso, fueraDePlazo } from './pasos';

const p = (startDate: string | null, duracionDias: number | null) => ({ startDate, duracionDias });

describe('finPaso', () => {
  it('un día termina el mismo día', () => expect(finPaso(p('2026-10-06', 1))).toBe('2026-10-06'));
  it('varios días', () => expect(finPaso(p('2026-10-06', 3))).toBe('2026-10-08'));
  it('sin programar', () => expect(finPaso(p(null, null))).toBeNull());
});

describe('fueraDePlazo', () => {
  const tarea = { startDate: '2026-10-05', deadline: '2026-10-09' };
  it('dentro del plazo', () => expect(fueraDePlazo(p('2026-10-06', 3), tarea)).toBe(false));
  it('termina después del deadline', () => expect(fueraDePlazo(p('2026-10-08', 3), tarea)).toBe(true));
  it('empieza antes del inicio', () => expect(fueraDePlazo(p('2026-10-04', 1), tarea)).toBe(true));
  it('tarea sin fechas', () => expect(fueraDePlazo(p('2026-01-01', 99), { startDate: null, deadline: null })).toBe(false));
  it('paso sin programar', () => expect(fueraDePlazo(p(null, null), tarea)).toBe(false));
});

describe('encadenar', () => {
  it('cada paso empieza el día siguiente al fin del anterior (duración 1 por defecto)', () => {
    const r = encadenar([{ t: 'a', ...p(null, 2) }, { t: 'b', ...p(null, null) }, { t: 'c', ...p('2026-01-01', 3) }], '2026-10-06');
    expect(r.map((x) => [x.t, x.startDate, x.duracionDias])).toEqual([
      ['a', '2026-10-06', 2],
      ['b', '2026-10-08', 1],
      ['c', '2026-10-09', 3],
    ]);
  });
});
