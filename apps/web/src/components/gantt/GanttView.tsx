import type { Task } from '@sb/shared';

export function GanttView(_: { onEditTask: (t: Task) => void }) {
  return <section className="mt-6 text-sm text-muted">Gantt en construcción</section>;
}
