import { describe, expect, it } from 'vitest';
import { updateProjectInput, updateTaskInput } from './index';

// Un PATCH parcial no debe rellenar defaults (pisaría prioridad, estado, días…)
describe('esquemas de actualización', () => {
  it('updateTaskInput no añade defaults', () => expect(updateTaskInput.parse({ title: 'x' })).toEqual({ title: 'x' }));
  it('updateProjectInput no añade defaults', () => expect(updateProjectInput.parse({ nombre: 'x' })).toEqual({ nombre: 'x' }));
  it('rechaza updates vacíos', () => expect(() => updateProjectInput.parse({})).toThrow());
});
