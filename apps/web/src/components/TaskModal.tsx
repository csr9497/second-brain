import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taskType, type CreateTaskInput, type Task, type TaskStatus } from '@sb/shared';
import { api } from '../lib/api';
import { TODAY_KEY } from '../lib/useToday';
import { ConfirmDelete, Field, Modal, ModalActions } from './Modal';
import { useToast } from './Toast';

type StepDraft = { id?: string; title: string };

/** Crea una tarea o, si recibe `task`, la edita (campos, estado y pasos). */
export function TaskModal({ task, onClose }: { task?: Task; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const editing = !!task;
  const projects = useQuery({ queryKey: ['projects', 'all'], queryFn: () => api.projects() });

  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    type: task?.type ?? '',
    projectId: task?.projectId ?? '',
    priority: task?.priority ?? ('media' as CreateTaskInput['priority']),
    status: task?.status ?? ('por_hacer' as TaskStatus),
    startDate: task?.startDate ?? '',
    deadline: task?.deadline ?? '',
    notes: task?.notes ?? '',
  });
  const [steps, setSteps] = useState<StepDraft[]>(task ? task.steps.map((s) => ({ id: s.id, title: s.title })) : [{ title: '' }]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fields = () => ({
    title: form.title.trim(),
    description: form.description || null,
    type: (form.type || null) as CreateTaskInput['type'],
    projectId: form.projectId || null,
    priority: form.priority,
    startDate: form.startDate || null,
    deadline: form.deadline || null,
    notes: form.notes || null,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: TODAY_KEY });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!task) {
        const newSteps = steps.map((s) => s.title.trim()).filter(Boolean).map((title) => ({ title }));
        return api.createTask({ ...fields(), steps: newSteps });
      }
      await api.updateTask(task.id, { ...fields(), status: form.status });
      // Pasos: borrar los quitados (o vaciados), renombrar los cambiados y crear los nuevos
      const kept = new Map(steps.filter((s) => s.id && s.title.trim()).map((s) => [s.id!, s.title.trim()]));
      for (const s of task.steps) {
        if (!kept.has(s.id)) await api.deleteStep(s.id);
        else if (kept.get(s.id) !== s.title) await api.renameStep(s.id, kept.get(s.id)!);
      }
      for (const s of steps) if (!s.id && s.title.trim()) await api.addStep(task.id, s.title.trim());
    },
    onSuccess: () => {
      toast(editing ? '✅ Tarea actualizada' : '✅ Tarea creada');
      onClose();
    },
    onError: (err) => toast(`⚠ ${err.message}`),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: () => api.deleteTask(task!.id),
    onSuccess: () => {
      toast('🗑 Tarea eliminada');
      onClose();
    },
    onError: (err) => toast(`⚠ ${err.message}`),
    onSettled: refresh,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.title.trim()) save.mutate();
  }

  return (
    <Modal
      title={editing ? '✏️ Editar tarea' : '➕ Nueva tarea'}
      hint={editing ? undefined : 'Completa lo que necesites; solo el título es obligatorio.'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Field label="Título">
          <input className="input" autoFocus={!editing} required value={form.title} onChange={set('title')} placeholder="p. ej. Limpiar la casa" />
        </Field>
        <Field label="Descripción">
          <textarea className="input min-h-14 resize-y" value={form.description} onChange={set('description')} placeholder="Qué hay que hacer…" />
        </Field>
        <Field label="Pasos (subtareas)" group>
          <div className="mb-1.5 flex flex-col gap-1.5">
            {steps.map((s, i) => (
              <div key={s.id ?? `new-${i}`} className="flex items-center gap-[7px]">
                <input
                  className="input flex-1"
                  value={s.title}
                  placeholder={i === 0 ? 'Primer paso' : 'Otro paso…'}
                  onChange={(e) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                />
                <button type="button" title="Quitar paso" className="text-base text-faint" onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSteps((xs) => [...xs, { title: '' }])}
            className="rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted"
          >
            + Añadir paso
          </button>
        </Field>
        <div className="grid grid-cols-2 gap-[11px]">
          <Field label="Tipo de actividad">
            <select className="input" value={form.type} onChange={set('type')}>
              <option value="">—</option>
              {taskType.options.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select className="input" value={form.priority} onChange={set('priority')}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </Field>
        </div>
        <div className={editing ? 'grid grid-cols-2 gap-[11px]' : ''}>
          <Field label="Proyecto relacionado">
            <select className="input" value={form.projectId} onChange={set('projectId')}>
              <option value="">— Ninguno —</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.estado !== 'en_curso' ? ` (${p.estado.replace('_', ' ')})` : ''}
                </option>
              ))}
            </select>
          </Field>
          {editing && (
            <Field label="Estado">
              <select className="input" value={form.status} onChange={set('status')}>
                <option value="por_hacer">Por hacer</option>
                <option value="en_curso">En curso</option>
                <option value="hecha">Hecha</option>
              </select>
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-[11px]">
          <Field label="Fecha inicio">
            <input type="date" className="input" value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="Deadline">
            <input type="date" className="input" value={form.deadline} onChange={set('deadline')} />
          </Field>
        </div>
        <Field label="Notas">
          <textarea className="input min-h-14 resize-y" value={form.notes} onChange={set('notes')} placeholder="Enlaces, ideas, recordatorios…" />
        </Field>
        <ModalActions>
          {editing && <ConfirmDelete label="Eliminar tarea" disabled={remove.isPending} onConfirm={() => remove.mutate()} />}
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !form.title.trim()}>
            {editing ? 'Guardar' : 'Crear tarea'}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
