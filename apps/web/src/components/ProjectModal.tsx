import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Project, type ProjectInput } from '@sb/shared';
import { api } from '../lib/api';
import { PRIORITY_OPTIONS, PROJECT_STATUS_OPTIONS } from '../lib/options';
import { TODAY_KEY } from '../lib/useToday';
import { ConfirmDelete, Field, Modal, ModalActions } from './Modal';
import { useToast } from './Toast';
import { ColorPicker } from './ui/ColorPicker';
import { Select } from './ui/Select';

// Lunes primero; el valor es el de schedule_days (0 = domingo)
const WEEK = [
  { d: 1, label: 'Lun' },
  { d: 2, label: 'Mar' },
  { d: 3, label: 'Mié' },
  { d: 4, label: 'Jue' },
  { d: 5, label: 'Vie' },
  { d: 6, label: 'Sáb' },
  { d: 0, label: 'Dom' },
];

/** Crea un proyecto o, si recibe `project`, lo edita. */
export function ProjectModal({ project, onClose }: { project?: Project; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const editing = !!project;
  const [form, setForm] = useState<ProjectInput>({
    nombre: project?.nombre ?? '',
    estado: (project?.estado ?? 'en_curso') as ProjectInput['estado'],
    prioridad: (project?.prioridad ?? 'media') as ProjectInput['prioridad'],
    nextAction: project?.nextAction ?? '',
    scheduleDays: project?.scheduleDays ?? [],
    totalProgress: project?.totalProgress ?? 0,
    color: project?.color ?? 'azul',
  });
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDay = (d: number) =>
    set('scheduleDays', form.scheduleDays.includes(d) ? form.scheduleDays.filter((x) => x !== d) : [...form.scheduleDays, d].sort());

  const refresh = () => {
    qc.invalidateQueries({ queryKey: TODAY_KEY });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const input = { ...form, nombre: form.nombre.trim(), nextAction: form.nextAction?.trim() || null };
      return editing ? api.updateProject(project.id, input) : api.createProject(input);
    },
    onSuccess: () => {
      toast(editing ? '✅ Proyecto actualizado' : '✅ Proyecto creado');
      onClose();
    },
    onError: (err) => toast(`⚠ ${err.message}`),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: () => api.deleteProject(project!.id),
    onSuccess: () => {
      toast('🗑 Proyecto eliminado');
      onClose();
    },
    onError: (err) => toast(`⚠ ${err.message}`),
    onSettled: refresh,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.nombre.trim()) save.mutate();
  }

  return (
    <Modal
      title={editing ? '✏️ Editar proyecto' : '📁 Nuevo proyecto'}
      hint={editing ? undefined : 'Solo el nombre es obligatorio.'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Field label="Nombre">
          <input
            className="input"
            autoFocus={!editing}
            required
            value={form.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            placeholder="p. ej. Preparar certificación AWS"
          />
        </Field>
        <Field label="Siguiente acción">
          <input
            className="input"
            value={form.nextAction ?? ''}
            onChange={(e) => set('nextAction', e.target.value)}
            placeholder="Lo próximo concreto que hay que hacer"
          />
        </Field>
        <div className="grid grid-cols-2 gap-[11px]">
          <Field label="Estado">
            <Select value={form.estado} onChange={(v) => set('estado', v)} options={PROJECT_STATUS_OPTIONS} />
          </Field>
          <Field label="Prioridad">
            <Select value={form.prioridad} onChange={(v) => set('prioridad', v)} options={PRIORITY_OPTIONS} />
          </Field>
        </div>
        <Field label="Color" group>
          <ColorPicker value={form.color} onChange={(c) => set('color', c)} />
        </Field>
        <Field label="Días de aplicación" group>
          <div className="flex flex-wrap gap-1.5">
            {WEEK.map(({ d, label }) => (
              <button
                key={d}
                type="button"
                aria-pressed={form.scheduleDays.includes(d)}
                onClick={() => toggleDay(d)}
                className="min-w-11 rounded-full border border-line bg-surface2 px-3 py-1.5 text-xs font-semibold text-muted transition aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white"
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`Avance total: ${form.totalProgress}%`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={form.totalProgress}
            onChange={(e) => set('totalProgress', Number(e.target.value))}
            className="w-full accent-accent"
          />
        </Field>
        <ModalActions>
          {editing && <ConfirmDelete label="Eliminar" disabled={remove.isPending} onConfirm={() => remove.mutate()} />}
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !form.nombre.trim()}>
            {editing ? 'Guardar' : 'Crear proyecto'}
          </button>
        </ModalActions>
        {editing && <p className="mt-3 mb-0 text-[11.5px] text-faint">Al eliminar el proyecto, sus tareas se conservan sin proyecto.</p>}
      </form>
    </Modal>
  );
}
