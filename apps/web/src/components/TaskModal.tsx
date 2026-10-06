import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { encadenar, fueraDePlazo, todayISO, type CreateTaskInput, type Task, type TaskStatus } from '@sb/shared';
import { api } from '../lib/api';
import { rangoPaso } from '../lib/format';
import { diasDe, nombrePaso, programacion, type Activo, type StepDraft, type TareaPlan } from '../lib/pasosBorrador';
import { PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, TASK_TYPE_OPTIONS } from '../lib/options';
import { TODAY_KEY } from '../lib/useToday';
import { ConfirmDelete, Field, Modal, ModalActions } from './Modal';
import { PlanificadorTarea } from './planner/PlanificadorTarea';
import { Select, type SelectOption } from './ui/Select';
import { confirmar } from './ui/Confirmar';
import { useToast } from './Toast';

const detalles = 'group mb-[13px] rounded-lg border border-line';
const resumen = 'flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-muted select-none [&::-webkit-details-marker]:hidden';

/** Crea una tarea o, si recibe `task`, la edita (campos, estado y pasos). */
export function TaskModal({
  task,
  inicial,
  onClose,
}: {
  task?: Task;
  /** Fechas de partida al crear (p. ej., desde un día del Calendario) */
  inicial?: { startDate: string; deadline: string };
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const editing = !!task;
  const projects = useQuery({ queryKey: ['projects', 'all'], queryFn: () => api.projects() });

  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    type: task?.type ?? '',
    projectId: task?.projectId ?? '',
    priority: task?.priority ?? ('media' as Task['priority']),
    status: task?.status ?? ('por_hacer' as TaskStatus),
    startDate: task?.startDate ?? inicial?.startDate ?? '',
    deadline: task?.deadline ?? inicial?.deadline ?? '',
    notes: task?.notes ?? '',
  });
  const [steps, setSteps] = useState<StepDraft[]>(
    task
      ? task.steps.map((s) => ({ id: s.id, title: s.title, startDate: s.startDate ?? '', dias: s.duracionDias ? String(s.duracionDias) : '', done: s.done }))
      : [{ title: '', startDate: '', dias: '' }],
  );
  const [activo, setActivo] = useState<Activo>('tarea');
  const [verPasos, setVerPasos] = useState(!!task && task.steps.length > 0);
  // Foto del estado inicial (solo en el montaje) para avisar al cerrar con cambios sin guardar
  const [foto] = useState(() => JSON.stringify({ form, steps }));
  const cerrar = async () => {
    if (
      JSON.stringify({ form, steps }) !== foto &&
      !(await confirmar({ titulo: '¿Descartar los cambios de la tarea?', mensaje: 'Lo que cambiaste en esta tarea no se guardará.' }))
    )
      return;
    onClose();
  };
  const setStep = (i: number, patch: Partial<StepDraft>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setValue = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const quitarPaso = (i: number) => {
    setSteps((xs) => xs.filter((_, j) => j !== i));
    setActivo((a) => (a === i ? 'tarea' : typeof a === 'number' && a > i ? a - 1 : a));
  };
  const cambiarPlan = (t: TareaPlan, s: typeof steps) => {
    setForm((f) => ({ ...f, startDate: t.startDate, deadline: t.deadline }));
    setSteps(s);
  };
  const color = projects.data?.find((p) => p.id === form.projectId)?.color ?? 'azul';
  const projectOptions: SelectOption[] = [
    { value: '', label: '— Ninguno —' },
    ...(projects.data ?? []).map((p) => ({
      value: p.id,
      label: p.nombre + (p.estado !== 'en_curso' ? ` (${p.estado.replace('_', ' ')})` : ''),
      color: p.color,
    })),
  ];

  const etiqueta = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label;
  const resumenDetalles = [
    etiqueta(PRIORITY_OPTIONS, form.priority),
    form.projectId ? projectOptions.find((o) => o.value === form.projectId)?.label : 'sin proyecto',
    editing ? etiqueta(TASK_STATUS_OPTIONS, form.status) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const conTitulo = steps.filter((s) => s.title.trim()).length;
  const programados = steps.filter((s) => s.startDate).length;

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
    qc.invalidateQueries({ queryKey: ['calendar'] });
    qc.invalidateQueries({ queryKey: ['gantt'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      // Un paso sin título pero colocado se guarda como «Paso N»; sin título ni fecha, se descarta
      const titulos = steps.map((s, i) => (s.title.trim() || s.startDate ? nombrePaso(s, i) : ''));
      if (!task) {
        const newSteps = steps.flatMap((s, i) => (titulos[i] ? [{ title: titulos[i], ...programacion(s) }] : []));
        return api.createTask({ ...fields(), steps: newSteps });
      }
      await api.updateTask(task.id, { ...fields(), status: form.status });
      // Pasos: borrar los quitados (o vaciados), actualizar los cambiados y crear los nuevos
      const kept = new Map(steps.flatMap((s, i) => (s.id && titulos[i] ? [[s.id, { draft: s, title: titulos[i] }] as const] : [])));
      for (const s of task.steps) {
        const k = kept.get(s.id);
        if (!k) {
          await api.deleteStep(s.id);
          continue;
        }
        const { draft, title } = k;
        const prog = programacion(draft);
        if (title !== s.title || prog.startDate !== (s.startDate ?? null) || prog.duracionDias !== (s.duracionDias ?? null)) {
          await api.updateStep(s.id, { title, ...prog });
        }
      }
      for (const [i, s] of steps.entries()) if (!s.id && titulos[i]) await api.addStep(task.id, { title: titulos[i], ...programacion(s) });
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
      onClose={() => void cerrar()}
      ancho="max-w-[1120px]"
    >
      <form onSubmit={submit}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div>
            <Field label="Título">
              <input className="input" autoFocus={!editing} required value={form.title} onChange={set('title')} placeholder="p. ej. Limpiar la casa" />
            </Field>
            <Field label="Descripción">
              <textarea className="input min-h-14 resize-y" value={form.description} onChange={set('description')} placeholder="Qué hay que hacer…" />
            </Field>
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
            <details className={detalles}>
              <summary className={resumen}>
                <span aria-hidden className="transition group-open:rotate-90">▸</span>
                Detalles
                <span className="ml-auto truncate font-normal text-faint">{resumenDetalles}</span>
              </summary>
              <div className="px-3 pt-1 pb-0.5">
                <div className="grid grid-cols-2 gap-[11px]">
                  <Field label="Tipo de actividad">
                    <Select value={form.type} onChange={setValue('type')} options={TASK_TYPE_OPTIONS} />
                  </Field>
                  <Field label="Prioridad">
                    <Select value={form.priority} onChange={setValue('priority')} options={PRIORITY_OPTIONS} />
                  </Field>
                </div>
                <div className={editing ? 'grid grid-cols-2 gap-[11px]' : ''}>
                  <Field label="Proyecto relacionado">
                    <Select value={form.projectId} onChange={setValue('projectId')} options={projectOptions} />
                  </Field>
                  {editing && (
                    <Field label="Estado">
                      <Select value={form.status} onChange={setValue('status')} options={TASK_STATUS_OPTIONS} />
                    </Field>
                  )}
                </div>
              </div>
            </details>
            <details open={verPasos} onToggle={(e) => setVerPasos(e.currentTarget.open)} className={detalles}>
              <summary className={resumen}>
                <span aria-hidden className="transition group-open:rotate-90">▸</span>
                Pasos
                <span className="ml-auto truncate font-normal text-faint">
                  {`${conTitulo} ${conTitulo === 1 ? 'paso' : 'pasos'} · ${programados} programados`}
                </span>
              </summary>
              <div className="px-3 pt-1 pb-3">
                <div role="group" aria-label="Pasos" className="mb-1.5 flex flex-col gap-1.5">
                  {steps.map((s, i) => (
                    <div key={s.id ?? `new-${i}`} className="flex flex-col gap-1.5 rounded-lg border border-line p-2">
                      <div className="flex items-center gap-[7px]">
                        <input
                          className="input flex-1"
                          value={s.title}
                          placeholder={i === 0 ? 'Primer paso' : 'Otro paso…'}
                          onChange={(e) => setStep(i, { title: e.target.value })}
                        />
                        <button
                          type="button"
                          aria-pressed={activo === i}
                          aria-label={`Colocar el paso ${i + 1} en el planificador`}
                          title="Colocar en el planificador"
                          onClick={() => setActivo(i)}
                          className="rounded-md px-1 text-base text-faint aria-pressed:bg-accent/15 aria-pressed:text-accent"
                        >
                          📍
                        </button>
                        <button type="button" title="Quitar paso" aria-label={`Quitar paso ${i + 1}`} className="text-base text-faint" onClick={() => quitarPaso(i)}>
                          ✕
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          aria-label={`Inicio del paso ${i + 1}`}
                          className="input w-auto py-1 text-[13px]"
                          value={s.startDate}
                          onChange={(e) => setStep(i, { startDate: e.target.value })}
                        />
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          aria-label={`Días del paso ${i + 1}`}
                          placeholder="días"
                          className="input w-20 py-1 text-[13px]"
                          value={s.dias}
                          onChange={(e) => setStep(i, { dias: e.target.value })}
                        />
                        {rangoPaso(programacion(s)) && <span className="text-xs text-muted">{rangoPaso(programacion(s))}</span>}
                        {!s.done && fueraDePlazo(programacion(s), { startDate: form.startDate || null, deadline: form.deadline || null }) && (
                          <span className="rounded-full bg-hot/15 px-2 py-0.5 text-[11px] font-semibold text-hot">fuera de plazo</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSteps((xs) => [...xs, { title: '', startDate: '', dias: '' }])}
                    className="rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted"
                  >
                    + Añadir paso
                  </button>
                  <button
                    type="button"
                    disabled={!steps.some((s) => s.title.trim())}
                    onClick={() => {
                      // Se calcula fuera del updater de setSteps: React puede ejecutarlo dos veces (StrictMode)
                      const desde = form.startDate || todayISO();
                      const nombrados = steps.filter((s) => s.title.trim());
                      const encadenados = encadenar(nombrados.map((s) => ({ startDate: null, duracionDias: diasDe(s) })), desde);
                      const nuevo = new Map(nombrados.map((s, i) => [s, encadenados[i]]));
                      setSteps(
                        steps.map((x) => {
                          const e = nuevo.get(x);
                          return e ? { ...x, startDate: e.startDate ?? '', dias: String(e.duracionDias) } : x;
                        }),
                      );
                    }}
                    className="rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted disabled:opacity-40"
                  >
                    ⛓ Encadenar pasos
                  </button>
                </div>
              </div>
            </details>
          </div>
          <div className="self-start lg:sticky lg:top-0">
            <PlanificadorTarea
              tarea={{ startDate: form.startDate, deadline: form.deadline }}
              steps={steps}
              color={color}
              activo={activo}
              setActivo={setActivo}
              onCambiar={cambiarPlan}
            />
          </div>
        </div>
        <ModalActions>
          {editing && <ConfirmDelete label="Eliminar tarea" disabled={remove.isPending} onConfirm={() => remove.mutate()} />}
          <button type="button" className="btn" onClick={() => void cerrar()}>
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
