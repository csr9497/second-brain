import { describe, expect, it } from 'vitest';
import { accionDeTecla, siguienteIndice, type Tecla } from './atajos';

const t = (key: string, o: Partial<Tecla> = {}): Tecla => ({ key, metaKey: false, ctrlKey: false, altKey: false, enCampo: false, hayModal: false, ...o });

describe('accionDeTecla', () => {
  it('letras y números', () => {
    expect(accionDeTecla(t('n'))).toEqual({ tipo: 'nueva-tarea' });
    expect(accionDeTecla(t('c'))).toEqual({ tipo: 'crear' });
    expect(accionDeTecla(t('3'))).toEqual({ tipo: 'vista', indice: 2 });
    expect(accionDeTecla(t('j'))).toEqual({ tipo: 'mover', paso: 1 });
    expect(accionDeTecla(t('k'))).toEqual({ tipo: 'mover', paso: -1 });
    expect(accionDeTecla(t('x'))).toEqual({ tipo: 'marcar' });
    expect(accionDeTecla(t('e'))).toEqual({ tipo: 'editar' });
    expect(accionDeTecla(t('?'))).toEqual({ tipo: 'ayuda' });
    expect(accionDeTecla(t('5'))).toBeNull();
    expect(accionDeTecla(t('z'))).toBeNull();
  });
  it('no pisa modificadores, campos de texto ni modales', () => {
    expect(accionDeTecla(t('n', { metaKey: true }))).toBeNull();
    expect(accionDeTecla(t('1', { ctrlKey: true }))).toBeNull();
    expect(accionDeTecla(t('n', { enCampo: true }))).toBeNull();
    expect(accionDeTecla(t('j', { hayModal: true }))).toBeNull();
  });
});

describe('siguienteIndice', () => {
  it('empieza por el primero o el último y no da la vuelta', () => {
    expect(siguienteIndice(-1, 3, 1)).toBe(0);
    expect(siguienteIndice(-1, 3, -1)).toBe(2);
    expect(siguienteIndice(2, 3, 1)).toBe(2);
    expect(siguienteIndice(0, 3, -1)).toBe(0);
    expect(siguienteIndice(1, 3, 1)).toBe(2);
    expect(siguienteIndice(0, 0, 1)).toBe(-1);
  });
});
