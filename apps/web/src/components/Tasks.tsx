import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fueraDePlazo, type Task, type TaskFilter, type TodayPayload } from '@sb/shared';
import { api } from '../lib/api';
import { useTodayMutation } from '../lib/useToday';
import { dueLabel, rangoPaso } from '../lib/format';

type ListFilter = Exclude<TaskFilter, 'incumplimiento'>;
const FILTERS: { f: ListFilter; label: string }[] = [
  { f: 'hoy', label: 'Hoy' },
  { f: 'semana', label: 'Semana' },
  { f: 'todas', label: 'Todas' },
];

/** Aplica `fn` a la tarea `id` en todas las listas de /today. */
function patchTask(data: TodayPayload, id: string, fn: (t: Task) => Task): TodayPayload {
  const map = (list: Task[]) => list.map((t) => (t.id === id ? fn(t) : t));
  const { hoy, semana, todas, incumplimiento } = data.tasks;
  return { ...data, tasks: { hoy: map(hoy), semana: map(semana), todas: map(todas), incumplimiento: map(incumplimiento) } };
}

export function Tasks({ data, onEdit }: { data: TodayPayload; onEdit: (t: Task) => void }) {
  const [filter, setFilter] = useState<ListFilter>('hoy');
  const list = data.tasks[filter];

  const reorder = useTodayMutation(
    (v: { id: string; beforeId: string | null; afterId: string | null; ordered: Task[] }) =>
      api.reorderTask({ id: v.id, beforeId: v.beforeId, afterId: v.afterId }),
    (d, v) => ({ ...d, tasks: { ...d.tasks, [filter]: v.ordered } }),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ordered = arrayMove(list, list.findIndex((t) => t.id === active.id), list.findIndex((t) => t.id === over.id));
    const i = ordered.findIndex((t) => t.id === active.id);
    reorder.mutate({ id: String(active.id), beforeId: ordered[i - 1]?.id ?? null, afterId: ordered[i + 1]?.id ?? null, ordered });
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-2.5">
        <h2 className="m-0 font-display text-lg font-semibold">Pendientes</h2>
        <div className="flex gap-1.5">
          {FILTERS.map(({ f, label }) => (
            <button
              key={f}
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted transition aria-selected:border-accent aria-selected:bg-accent aria-selected:text-white"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-3.5 py-1.5">
        {list.length === 0 ? (
          <p className="my-2.5 text-[13px] text-faint">Nada pendiente aquí. 🎉</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {list.map((t) => (
                <TaskItem key={t.id} task={t} today={data.date} onEdit={onEdit} sortable />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {data.tasks.incumplimiento.length > 0 && (
        <div className="card border-[color-mix(in_srgb,var(--hot)_45%,var(--line))] py-3">
          <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-hot">⚠ En incumplimiento</div>
          {data.tasks.incumplimiento.map((t) => (
            <TaskItem key={t.id} task={t} today={data.date} onEdit={onEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

const PRIORITY_CHIP: Record<string, string> = {
  alta: 'bg-hot/20 text-hot',
  media: 'bg-warn/25 text-warn',
  baja: 'bg-surface2 text-muted',
};

function TaskItem({ task, today, onEdit, sortable = false }: { task: Task; today: string; onEdit: (t: Task) => void; sortable?: boolean }) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !sortable });
  const done = task.status === 'hecha';
  const stepsDone = task.steps.filter((s) => s.done).length;
  const due = dueLabel(task.deadline, today);

  const toggle = useTodayMutation(
    (id: string) => api.toggleTask(id),
    (d, id) => patchTask(d, id, (t) => ({ ...t, status: t.status === 'hecha' ? 'por_hacer' : 'hecha' })),
  );
  const toggleStep = useTodayMutation(
    (stepId: string) => api.toggleStep(stepId),
    (d, stepId) =>
      patchTask(d, task.id, (t) => {
        const steps = t.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
        return { ...t, steps, status: steps.every((s) => s.done) ? 'hecha' : t.status === 'hecha' ? 'por_hacer' : t.status };
      }),
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-[9px] border-t border-line py-[11px] first:border-t-0 ${isDragging ? 'relative z-10 opacity-50' : ''}`}
    >
      {sortable ? (
        <span
          {...attributes}
          {...listeners}
          aria-label="Arrastrar para reordenar"
          className="flex-none cursor-grab touch-none select-none text-[15px] leading-[1.4] text-faint active:cursor-grabbing"
        >
          ⠿
        </span>
      ) : (
        <span className="w-[13px] flex-none" />
      )}
      <button
        aria-pressed={done}
        aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        onClick={() => toggle.mutate(task.id)}
        className="mt-px grid size-5 flex-none place-items-center rounded-md border-[1.5px] border-faint text-xs text-transparent transition aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white"
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(task)}
            title="Editar tarea"
            className={`min-w-0 truncate text-left text-sm hover:underline hover:decoration-faint hover:underline-offset-2 ${done ? 'text-faint line-through' : ''}`}
          >
            {task.title}
          </button>
          {task.steps.length > 1 && (
            <button
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="flex-none whitespace-nowrap rounded-full border border-line bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-muted"
            >
              <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span> {stepsDone}/{task.steps.length} pasos
            </button>
          )}
        </div>
        <div className="mt-[5px] flex flex-wrap items-center gap-1.5">
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize ${PRIORITY_CHIP[task.priority]}`}>
            {task.priority}
          </span>
          {(task.projectName || task.type) && (
            <span className="whitespace-nowrap rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-muted">{task.projectName ?? task.type}</span>
          )}
          {due && <span className={`whitespace-nowrap text-[11px] ${due.over ? 'font-semibold text-hot' : 'text-muted'}`}>{due.text}</span>}
        </div>
        {/* Con un solo paso no hay desplegable: se muestra directo */}
        {(open || task.steps.length === 1) && (
          <div className="mt-2 flex flex-col gap-1.5 border-l-2 border-line pl-3">
            {task.steps.map((s) => (
              <label key={s.id} className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                <input type="checkbox" checked={s.done} onChange={() => toggleStep.mutate(s.id)} className="size-4 accent-accent" />
                <span className={s.done ? 'text-faint line-through' : ''}>{s.title}</span>
                {rangoPaso(s) && <span className="text-[11px] text-faint">{rangoPaso(s)}</span>}
                {fueraDePlazo(s, task) && <span className="rounded-full bg-hot/15 px-1.5 text-[10.5px] font-semibold text-hot">fuera de plazo</span>}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
