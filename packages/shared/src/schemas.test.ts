import { describe, expect, it } from 'vitest';
import { createProjectInput, updateProjectInput, updateTaskInput } from './index';

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
