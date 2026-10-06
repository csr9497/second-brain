import {
  PRIORITY_COLOR,
  PROJECT_STATUS_COLOR,
  TASK_STATUS_COLOR,
  TASK_TYPE_COLOR,
  priority,
  projectStatus,
  taskStatus,
  taskType,
  type PaletteColor,
} from '@sb/shared';
import type { SelectOption } from '../components/ui/Select';

const PRIORITY_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' } as const;
const TASK_STATUS_LABEL = { por_hacer: 'Por hacer', en_curso: 'En curso', hecha: 'Hecha' } as const;
export const PROJECT_STATUS_LABEL = { idea: 'Idea', en_curso: 'En curso', en_pausa: 'En pausa', completado: 'Completado', archivado: 'Archivado' } as const;

export const COLOR_LABEL: Record<PaletteColor, string> = {
  azul: 'Azul',
  verde: 'Verde',
  ambar: 'Ámbar',
  rojo: 'Rojo',
  violeta: 'Violeta',
  rosa: 'Rosa',
  cian: 'Cian',
  gris: 'Gris',
};

export const PRIORITY_OPTIONS = priority.options.map((v) => ({ value: v, label: PRIORITY_LABEL[v], color: PRIORITY_COLOR[v] }));
export const TASK_STATUS_OPTIONS = taskStatus.options.map((v) => ({ value: v, label: TASK_STATUS_LABEL[v], color: TASK_STATUS_COLOR[v] }));
export const PROJECT_STATUS_OPTIONS = projectStatus.options.map((v) => ({ value: v, label: PROJECT_STATUS_LABEL[v], color: PROJECT_STATUS_COLOR[v] }));
/** Tipo de tarea, con la opción vacía "—" (la tarea puede no tener tipo). */
export const TASK_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: '—' },
  ...taskType.options.map((v) => ({ value: v, label: v, color: TASK_TYPE_COLOR[v] })),
];
