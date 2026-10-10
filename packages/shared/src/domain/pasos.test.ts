import { describe, expect, it } from 'vitest';
import { completarPaso, diasTarea, duracionEnDias, duracionHoras, duracionPaso, encadenar, finPaso, minutosDia, minutosPaso, presupuestoTarea, fueraDePlazo, pasoEnRango, pasosDelPeriodo, rangoSeleccion, tramosDelDia } from './pasos';

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

describe('pasosDelPeriodo', () => {
  const pasos = [
    { id: 'hoy', ...p('2026-10-07', 1) },
    { id: 'cruza', ...p('2026-10-05', 3) },
    { id: 'manana', ...p('2026-10-08', 1) },
    { id: 'sin', ...p(null, null) },
  ];
  it('solo los que tocan el día', () => {
    const r = pasosDelPeriodo(pasos, '2026-10-07', '2026-10-07');
    expect(r.visibles.map((x) => x.id)).toEqual(['hoy', 'cruza']);
    expect(r.ocultos).toBe(2);
  });
  it('en la semana entran todos los programados que la tocan', () =>
    expect(pasosDelPeriodo(pasos, '2026-10-05', '2026-10-11').visibles.map((x) => x.id)).toEqual(['hoy', 'cruza', 'manana']));
  it('un paso sin programar nunca está en el rango', () => expect(pasoEnRango(p(null, null), '2026-01-01', '2026-12-31')).toBe(false));
});

describe('duración de la tarea', () => {
  const tarea = { startDate: '2026-10-05', deadline: '2026-10-09', minutosDia: 240 };
  it('días de la tarea', () => {
    expect(diasTarea(tarea)).toBe(5);
    expect(diasTarea({ startDate: '2026-10-05', deadline: null })).toBeNull();
    expect(diasTarea({ startDate: '2026-10-09', deadline: '2026-10-05' })).toBeNull();
  });
  it('día de trabajo: el de la tarea o 8 h', () => {
    expect(minutosDia(tarea)).toBe(240);
    expect(minutosDia({ minutosDia: null })).toBe(480);
  });
  it('un paso por tiempo sin fecha empieza el día de inicio de la tarea', () => {
    expect(completarPaso({ startDate: null, duracionDias: null, duracionMin: 45 }, tarea)).toEqual({ startDate: '2026-10-05', duracionDias: 1, duracionMin: 45 });
    // sin inicio de la tarea queda sin fecha
    expect(completarPaso({ startDate: null, duracionDias: null, duracionMin: 45 }, { startDate: null, deadline: null })).toMatchObject({ startDate: null });
  });
  it('un paso con fecha y sin días dura hasta el deadline de la tarea', () => {
    expect(completarPaso({ startDate: '2026-10-07', duracionDias: null, duracionMin: null }, tarea)).toMatchObject({ duracionDias: 3 });
    expect(completarPaso({ startDate: '2026-10-12', duracionDias: null, duracionMin: null }, tarea)).toMatchObject({ duracionDias: 1 });
    expect(completarPaso({ startDate: '2026-10-07', duracionDias: null, duracionMin: null }, { startDate: null, deadline: null })).toMatchObject({ duracionDias: 1 });
  });
  it('lo ya programado no cambia', () => {
    const x = { startDate: '2026-10-06', duracionDias: 2, duracionMin: null };
    expect(completarPaso(x, tarea)).toBe(x);
  });
  it('minutos de un paso según el día de trabajo de la tarea', () => {
    expect(minutosPaso({ startDate: '2026-10-06', duracionDias: 2, duracionMin: null }, tarea)).toBe(480);
    expect(minutosPaso({ startDate: '2026-10-06', duracionDias: 1, duracionMin: 90 }, tarea)).toBe(90);
    expect(minutosPaso({ startDate: null, duracionDias: null, duracionMin: null }, tarea)).toBe(0);
  });
  it('presupuesto: pasos frente a días × día de trabajo', () => {
    const pasos = [{ startDate: '2026-10-05', duracionDias: 4, duracionMin: null }, { startDate: '2026-10-09', duracionDias: 1, duracionMin: 300 }];
    expect(presupuestoTarea(pasos, tarea)).toEqual({ usado: 1260, total: 1200, excede: true });
    expect(presupuestoTarea(pasos, { startDate: null, deadline: null })).toMatchObject({ total: null, excede: false });
  });
  it('duración en días de trabajo', () => {
    expect(duracionEnDias(1260, 240)).toBe('5 días 1 h');
    expect(duracionEnDias(240, 240)).toBe('1 día');
    expect(duracionEnDias(90, 240)).toBe('1 h 30 min');
    expect(duracionEnDias(0)).toBe('0 min');
  });
  it('encadenar usa el día de trabajo de la tarea', () => {
    const tp = (t: string, duracionMin: number) => ({ t, startDate: null, duracionDias: null, duracionMin });
    const r = encadenar([tp('a', 180), tp('b', 120)], '2026-10-05', 240);
    expect(r.map((x) => [x.t, x.startDate])).toEqual([
      ['a', '2026-10-05'],
      ['b', '2026-10-06'],
    ]);
  });
});
