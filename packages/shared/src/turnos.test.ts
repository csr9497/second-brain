import { describe, expect, it } from 'vitest';
import { turnosSchema } from './index';
import { formatTurnos, franjasLibres, resumenTurnos } from './turnos';

describe('turnosSchema', () => {
  it.each([[[['manana'], ['noche']]], [[['manana', 'tarde']]], [[['manana'], ['tarde', 'noche']]]])('acepta %j', (t) =>
    expect(turnosSchema.parse(t)).toEqual(t),
  );
  it.each([[[]], [[[]]], [[['manana'], ['manana']]], [[['manana', 'manana']]], [[['madrugada']]]])('rechaza %j', (t) =>
    expect(() => turnosSchema.parse(t)).toThrow(),
  );
});

describe('textos de turnos', () => {
  it('franjasLibres', () => expect(franjasLibres([['tarde']])).toEqual(['manana', 'noche']));
  it('formatTurnos', () => {
    expect(formatTurnos([['manana'], ['tarde', 'noche']])).toBe('Mañana + (Tarde o Noche)');
    expect(formatTurnos([['manana', 'tarde']])).toBe('Mañana o Tarde');
    expect(formatTurnos([['manana'], ['noche']])).toBe('Mañana + Noche');
  });
  it('resumenTurnos', () => {
    expect(resumenTurnos([['manana'], ['tarde', 'noche']])).toBe('Se marca 2 veces al día: por la mañana, y por la tarde o la noche');
    expect(resumenTurnos([['manana', 'tarde']])).toBe('Se marca 1 vez al día: por la mañana o la tarde');
    expect(resumenTurnos([['manana'], ['tarde'], ['noche']])).toBe('Se marca 3 veces al día: por la mañana, por la tarde, y por la noche');
  });
});
