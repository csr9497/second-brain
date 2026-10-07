import { describe, expect, it } from 'vitest';
import { duracionHoras, duracionPaso, encadenar, finPaso, fueraDePlazo, rangoSeleccion, tramosDelDia } from './pasos';

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

  const tp = (t: string, duracionMin: number) => ({ t, startDate: null, duracionDias: null, duracionMin });
  const ver = (r: { t: string; startDate: string | null }[]) => r.map((x) => [x.t, x.startDate]);

  it('los pasos por tiempo se encadenan en el mismo día mientras quepan en la jornada de 8 h', () => {
    const r = encadenar([tp('a', 240), tp('b', 180), tp('c', 60), tp('d', 30)], '2026-10-06');
    expect(ver(r)).toEqual([
      ['a', '2026-10-06'],
      ['b', '2026-10-06'],
      ['c', '2026-10-06'],
      ['d', '2026-10-07'],
    ]);
    expect(r.every((x) => x.duracionDias === 1)).toBe(true);
  });

  it('un paso más largo que la jornada ocupa su propio día', () => {
    expect(ver(encadenar([tp('a', 60), tp('largo', 600), tp('b', 30)], '2026-10-06'))).toEqual([
      ['a', '2026-10-06'],
      ['largo', '2026-10-07'],
      ['b', '2026-10-08'],
    ]);
  });

  it('mezcla días y tiempo: tras pasos por tiempo, el de días empieza al día siguiente', () => {
    const r = encadenar([{ t: 'd', ...p(null, 2), duracionMin: null }, tp('h1', 60), tp('h2', 60), { t: 'e', ...p(null, 1), duracionMin: null }], '2026-10-06');
    expect(ver(r)).toEqual([
      ['d', '2026-10-06'],
      ['h1', '2026-10-08'],
      ['h2', '2026-10-08'],
      ['e', '2026-10-09'],
    ]);
  });
});

describe('tiempo', () => {
  it('duración legible', () => {
    expect(duracionHoras(90)).toBe('1 h 30 min');
    expect(duracionHoras(45)).toBe('45 min');
    expect(duracionHoras(120)).toBe('2 h');
    expect(duracionPaso({ startDate: '2026-10-06', duracionDias: 3 })).toBe('3 días');
    expect(duracionPaso({ startDate: '2026-10-06', duracionDias: 1, duracionMin: 75 })).toBe('1 h 15 min');
    expect(duracionPaso(p(null, null))).toBeNull();
  });
  it('tramos del día: uno detrás de otro en el orden de la lista, ignorando los de días', () => {
    const r = tramosDelDia([{ id: 'a', ...p('2026-10-06', 1), duracionMin: 60 }, { id: 'x', ...p('2026-10-06', 2) }, { id: 'b', ...p('2026-10-06', 1), duracionMin: 90 }]);
    expect(r.map((t) => [t.paso.id, t.desde, t.hasta])).toEqual([
      ['a', 0, 60],
      ['b', 60, 150],
    ]);
  });
});

describe('rangoSeleccion', () => {
  it('ordena e incluye ambos extremos', () => expect(rangoSeleccion('2026-10-09', '2026-10-06')).toEqual({ inicio: '2026-10-06', fin: '2026-10-09', dias: 4 }));
  it('un mismo día dura 1', () => expect(rangoSeleccion('2026-10-06', '2026-10-06')).toEqual({ inicio: '2026-10-06', fin: '2026-10-06', dias: 1 }));
});
