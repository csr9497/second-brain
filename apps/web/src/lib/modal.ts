import type { HabitAdmin, Project, Task } from '@sb/shared';

export type ModalState =
  | { kind: 'tarea'; task?: Task; inicial?: { startDate: string; deadline: string } }
  | { kind: 'proyecto'; project?: Project }
  | { kind: 'revision' }
  | { kind: 'idea' }
  | { kind: 'habitos' }
  | { kind: 'habito'; habit?: HabitAdmin }
  | { kind: 'avisos' }
  | null;
