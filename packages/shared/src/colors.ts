import type { HabitSlot, PaletteColor, Priority, ProjectStatus, TaskStatus, TaskType } from './index';

// Colores de los enums fijos. `Record` obliga a asignar color a cada valor nuevo.
export const PRIORITY_COLOR: Record<Priority, PaletteColor> = { alta: 'rojo', media: 'ambar', baja: 'gris' };

export const TASK_STATUS_COLOR: Record<TaskStatus, PaletteColor> = { por_hacer: 'gris', en_curso: 'azul', hecha: 'verde' };

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, PaletteColor> = {
  idea: 'violeta',
  en_curso: 'azul',
  en_pausa: 'ambar',
  completado: 'verde',
  archivado: 'gris',
};

export const TASK_TYPE_COLOR: Record<TaskType, PaletteColor> = {
  Estudio: 'azul',
  Trabajo: 'ambar',
  Tesis: 'violeta',
  Personal: 'verde',
  Revisión: 'cian',
};

export const SLOT_COLOR: Record<HabitSlot, PaletteColor> = { manana: 'ambar', tarde: 'rojo', noche: 'violeta' };
