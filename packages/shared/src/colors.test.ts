import { describe, expect, it } from 'vitest';
import { habitSlot, paletteColor, priority, projectStatus, taskStatus, taskType } from './index';
import { PRIORITY_COLOR, PROJECT_STATUS_COLOR, SLOT_COLOR, TASK_STATUS_COLOR, TASK_TYPE_COLOR } from './colors';

// Cada valor de cada enum tiene un color de la paleta (y nada sobra)
const cases = [
  ['priority', priority.options, PRIORITY_COLOR],
  ['taskStatus', taskStatus.options, TASK_STATUS_COLOR],
  ['projectStatus', projectStatus.options, PROJECT_STATUS_COLOR],
  ['taskType', taskType.options, TASK_TYPE_COLOR],
  ['habitSlot', habitSlot.options, SLOT_COLOR],
] as const;

describe('colores de enums', () => {
  it.each(cases)('%s cubre todas sus opciones con colores de la paleta', (_, options, map) => {
    expect(Object.keys(map).sort()).toEqual([...options].sort());
    for (const c of Object.values(map)) expect(paletteColor.options).toContain(c);
  });
});
