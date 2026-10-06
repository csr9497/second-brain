import { describe, expect, it } from 'vitest';
import { createHabitInput, createProjectInput, createTaskInput, updateHabitInput, updateProjectInput, updateStepInput, updateTaskInput } from './index';

// Un PATCH parcial no debe rellenar defaults (pisaría prioridad, estado, días…)
describe('esquemas de actualización', () => {
  it('updateTaskInput no añade defaults', () => expect(updateTaskInput.parse({ title: 'x' })).toEqual({ title: 'x' }));
  it('updateProjectInput no añade defaults', () => expect(updateProjectInput.parse({ nombre: 'x' })).toEqual({ nombre: 'x' }));
  it('rechaza updates vacíos', () => expect(() => updateProjectInput.parse({})).toThrow());
});

describe('color de proyecto', () => {
  it('createProjectInput usa azul por defecto', () => expect(createProjectInput.parse({ nombre: 'x' }).color).toBe('azul'));
  it('rechaza colores fuera de la paleta', () => expect(() => createProjectInput.parse({ nombre: 'x', color: 'fucsia' })).toThrow());
  it('updateProjectInput no rellena color', () => expect(updateProjectInput.parse({ nombre: 'x' })).not.toHaveProperty('color'));
});

describe('hábitos', () => {
  it('updateHabitInput ignora active (archivar tiene acción propia)', () =>
    expect(updateHabitInput.parse({ nombre: 'x', active: false })).toEqual({ nombre: 'x' }));
  it('updateHabitInput sin campos editables falla', () => expect(() => updateHabitInput.parse({ active: false })).toThrow());
  it('createHabitInput usa la mañana por defecto', () =>
    expect(createHabitInput.parse({ nombre: 'x' })).toEqual({ nombre: 'x', turnos: [['manana']] }));
  it('updateHabitInput valida los turnos', () => expect(() => updateHabitInput.parse({ turnos: [['manana'], ['manana']] })).toThrow());
});

describe('pasos programados', () => {
  it('createTaskInput acepta pasos con fecha y días', () =>
    expect(createTaskInput.parse({ title: 't', steps: [{ title: 'p', startDate: '2026-10-06', duracionDias: 2 }] }).steps[0]).toEqual({
      title: 'p',
      startDate: '2026-10-06',
      duracionDias: 2,
    }));
  it('createTaskInput rechaza duración 0', () =>
    expect(() => createTaskInput.parse({ title: 't', steps: [{ title: 'p', startDate: '2026-10-06', duracionDias: 0 }] })).toThrow());
  it('updateStepInput vacío falla', () => expect(() => updateStepInput.parse({})).toThrow());
  it('updateStepInput permite desprogramar', () =>
    expect(updateStepInput.parse({ startDate: null, duracionDias: null })).toEqual({ startDate: null, duracionDias: null }));
});
