import { useState, type FormEvent, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { daysBetween, duracionPaso, encadenar, formatFrecuencia, fueraDePlazo, todayISO, type CreateTaskInput, type Task, type TaskStatus } from '@sb/shared';
import { api } from '../lib/api';
import { rangoPaso } from '../lib/format';
import { aBorrador, claveDe, diasDe, finBorrador, minutosDe, nombrePaso, pasoVacio, porTiempo, programacion, type Seleccion, type StepDraft } from '../lib/pasosBorrador';
import { PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, TASK_TYPE_OPTIONS, UNIDADES_TIEMPO } from '../lib/options';
import { useHabits } from '../lib/useHabits';
import { TODAY_KEY } from '../lib/useToday';
import { ConfirmDelete, Field, Modal, ModalActions } from './Modal';
import { RangoFecha } from './ui/RangoFecha';
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
  const habits = useHabits();

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
  // Hábitos vinculados: completar la tarea o un paso los marca ese día (trigger en la DB)
  const [habitIds, setHabitIds] = useState<string[]>(task?.habitIds ?? []);
  const [steps, setSteps] = useState<StepDraft[]>(
    task
      ? task.steps.map((s) => ({ id: s.id, title: s.title, ...aBorrador(s), done: s.done }))
      : [pasoVacio()],
  );
  // Días seleccionados en el planificador para agregar un paso
  const [sel, setSel] = useState<Seleccion | null>(null);
  const [verPasos, setVerPasos] = useState(!!task && task.steps.length > 0);
  // Foto del estado inicial (solo en el montaje) para avisar al cerrar con cambios sin guardar
  const [foto] = useState(() => JSON.stringify({ form, steps, habitIds }));
  const cerrar = async () => {
    if (
      JSON.stringify({ form, steps, habitIds }) !== foto &&
      !(await confirmar({ titulo: '¿Descartar los cambios de la tarea?', mensaje: 'Lo que cambiaste en esta tarea no se guardará.' }))
    )
      return;
    onClose();
  };
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordenarPasos = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setSteps((xs) => arrayMove(xs, xs.findIndex((x) => claveDe(x) === active.id), xs.findIndex((x) => claveDe(x) === over.id)));
  };
  const setStep = (i: number, patch: Partial<StepDraft>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setValue = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const quitarPaso = (i: number) => setSteps((xs) => xs.filter((_, j) => j !== i));
  /** Paso nuevo con el rango seleccionado; reemplaza el paso vacío inicial si no se usó. */
  const agregarPaso = (nombre: string, inicio: string, fin: string, tiempo?: Pick<StepDraft, 'tiempo' | 'unidad'>) => {
    const nuevo: StepDraft = { uid: crypto.randomUUID(), title: nombre, startDate: inicio, dias: String(daysBetween(inicio, fin) + 1), ...(inicio === fin ? tiempo : {}) };
    const vacio = steps.length === 1 && !steps[0].id && !steps[0].title.trim() && !steps[0].startDate;
    setSteps(vacio ? [nuevo] : [...steps, nuevo]);
    setVerPasos(true);
  };
  // Duración de la tarea (solo se cambia en la cabecera)
  const finAntes = !!form.startDate && !!form.deadline && form.deadline < form.startDate;
  const duracion =
    form.startDate && form.deadline && !finAntes
      ? `${daysBetween(form.startDate, form.deadline) + 1} ${daysBetween(form.startDate, form.deadline) === 0 ? 'día' : 'días'}`
      : null;
  const resumenTexto = [form.description.trim() && 'descripción', form.notes.trim() && 'notas'].filter(Boolean).join(' y ') || 'vacías';
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
    habitIds.length ? `🔁 ${habitIds.length} ${habitIds.length === 1 ? 'hábito' : 'hábitos'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Activos, más los archivados que ya estaban vinculados (para poder quitarlos)
  const habitOptions = (habits.data ?? []).filter((h) => !h.archivedAt || habitIds.includes(h.id));
  const toggleHabit = (id: string) => setHabitIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
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
    habitIds,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: TODAY_KEY });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
    qc.invalidateQueries({ queryKey: ['gantt'] });
    qc.invalidateQueries({ queryKey: ['review'] });
    qc.invalidateQueries({ queryKey: ['resumen'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      // Un paso sin título pero colocado se guarda como «Paso N»; sin título ni fecha, se descarta
      const titulos = steps.map((s, i) => (s.title.trim() || s.startDate ? nombrePaso(s, i) : ''));
      if (!task) {
        const newSteps = steps.flatMap((s, i) => (titulos[i] ? [{ title: titulos[i], ...programacion(s) }] : []));
        return api.createTask({ ...fields(), steps: newSteps });
      }
      await api.updateTask(task.id, { ...fields(), status: form.status }, task.habitIds);
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
        if (
          title !== s.title ||
          prog.startDate !== (s.startDate ?? null) ||
          prog.duracionDias !== (s.duracionDias ?? null) ||
          prog.duracionMin !== s.duracionMin
        ) {
          await api.updateStep(s.id, { title, ...prog });
        }
      }
      // Orden: si se reordenó (o un paso nuevo quedó entre los guardados) se renumera la lista de esta tarea;
      // si no, los guardados conservan su position y los nuevos van al final
      const guardados = steps.filter((s, i) => titulos[i]);
      const esperado = [...task.steps.filter((s) => kept.has(s.id)).map((s) => s.id), ...guardados.filter((s) => !s.id).map(() => null)];
      const reordenado = guardados.some((s, k) => (s.id ?? null) !== esperado[k]);
      for (const [k, s] of guardados.entries()) {
        const position = reordenado ? (k + 1) * 1000 : undefined;
        if (!s.id) await api.addStep(task.id, { title: titulos[steps.indexOf(s)], ...programacion(s) }, position);
        else if (position !== undefined && position !== task.steps.find((x) => x.id === s.id)!.position) await api.moverPaso(s.id, position);
      }
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
    if (form.title.trim() && !finAntes) save.mutate();
  }

  return (
    <Modal
      title={form.title.trim() || (editing ? 'Editar tarea' : 'Nueva tarea')}
      onClose={() => void cerrar()}
      ancho="max-w-[1120px]"
      encabezado={false}
    >
      <form onSubmit={submit}>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-[1_1_320px]">
            <span className="block text-[11px] font-semibold tracking-[.08em] text-faint uppercase">{editing ? 'Editar tarea' : 'Nueva tarea'}</span>
            <input
              aria-label="Nombre de la tarea"
              autoFocus={!editing}
              required
              value={form.title}
              onChange={set('title')}
              placeholder="Nombre de la tarea"
              className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-display text-[24px] leading-tight font-bold text-text outline-none placeholder:text-faint hover:border-line focus:border-accent"
            />
          </div>
          <div role="group" aria-label="Duración de la tarea" className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="field-label">Inicio</span>
              <input type="date" className="input w-auto" value={form.startDate} onChange={set('startDate')} />
            </label>
            <label className="block">
              <span className="field-label">Fin</span>
              <input type="date" className="input w-auto" value={form.deadline} onChange={set('deadline')} aria-invalid={finAntes} />
            </label>
            <div className="pb-2 text-[13px]" aria-live="polite">
              {finAntes ? (
                <span className="font-semibold text-hot">El fin es antes del inicio</span>
              ) : duracion ? (
                <span className="font-semibold">⏱ {duracion}</span>
              ) : (
                <span className="text-faint">Sin duración</span>
              )}
            </div>
          </div>
        </header>
        <details className={detalles}>
          <summary className={resumen}>
            <span aria-hidden className="transition group-open:rotate-90">▸</span>
            Descripción y notas
            <span className="ml-auto truncate font-normal text-faint">{resumenTexto}</span>
          </summary>
          <div className="grid gap-[11px] px-3 pt-1 pb-0.5 md:grid-cols-2">
            <Field label="Descripción">
              <textarea className="input min-h-20 resize-y" value={form.description} onChange={set('description')} placeholder="Qué hay que hacer…" />
            </Field>
            <Field label="Notas">
              <textarea className="input min-h-20 resize-y" value={form.notes} onChange={set('notes')} placeholder="Enlaces, ideas, recordatorios…" />
            </Field>
          </div>
        </details>
        <details className={detalles}>
          <summary className={resumen}>
            <span aria-hidden className="transition group-open:rotate-90">▸</span>
            Detalles
            <span className="ml-auto truncate font-normal text-faint">{resumenDetalles}</span>
          </summary>
          <div className="grid grid-cols-2 gap-x-[11px] px-3 pt-1 pb-0.5 md:grid-cols-4">
            <Field label="Tipo de actividad">
              <Select value={form.type} onChange={setValue('type')} options={TASK_TYPE_OPTIONS} />
            </Field>
            <Field label="Prioridad">
              <Select value={form.priority} onChange={setValue('priority')} options={PRIORITY_OPTIONS} />
            </Field>
            <Field label="Proyecto relacionado">
              <Select value={form.projectId} onChange={setValue('projectId')} options={projectOptions} />
            </Field>
            {editing && (
              <Field label="Estado">
                <Select value={form.status} onChange={setValue('status')} options={TASK_STATUS_OPTIONS} />
              </Field>
            )}
          </div>
          <div className="px-3 pb-3">
            <span className="field-label">Cuenta para los hábitos</span>
            {habitOptions.length === 0 ? (
              <p className="m-0 text-[12px] text-faint">Aún no tienes hábitos.</p>
            ) : (
              <div role="group" aria-label="Hábitos vinculados" className="flex flex-wrap gap-1.5">
                {habitOptions.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={habitIds.includes(h.id)}
                    title={formatFrecuencia(h)}
                    onClick={() => toggleHabit(h.id)}
                    className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-xs font-medium text-muted transition aria-pressed:border-good aria-pressed:bg-good-ink aria-pressed:text-good"
                  >
                    {habitIds.includes(h.id) ? '✓ ' : ''}
                    {h.nombre}
                    {h.archivedAt ? ' (archivado)' : ''}
                  </button>
                ))}
              </div>
            )}
            <p className="m-0 mt-1.5 text-[11.5px] text-faint">Al completar la tarea o uno de sus pasos, estos hábitos se marcan ese día.</p>
          </div>
        </details>
        <details open={verPasos} onToggle={(e) => setVerPasos(e.currentTarget.open)} className={detalles}>
          <summary className={resumen}>
            <span aria-hidden className="transition group-open:rotate-90">▸</span>
            Pasos
            <span className="ml-auto truncate font-normal text-faint">{`${conTitulo} ${conTitulo === 1 ? 'paso' : 'pasos'} · ${programados} programados`}</span>
          </summary>
          <div className="px-3 pt-1 pb-3">
            {/* Una fila por paso: nombre y, al costado, inicio, días y el rango calculado */}
            {/* Arrastrar ⠿ cambia solo el orden en que se muestran los pasos (no sus fechas) */}
            <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={ordenarPasos}>
            <SortableContext items={steps.map(claveDe)} strategy={verticalListSortingStrategy}>
            <div role="group" aria-label="Pasos" className="mb-2 flex flex-col divide-y divide-line/60">
              {steps.map((s, i) => {
                const p = programacion(s);
                const varios = (diasDe(s) ?? 1) > 1;
                const fuera = !s.done && fueraDePlazo(p, { startDate: form.startDate || null, deadline: form.deadline || null });
                return (
                  <FilaOrdenable key={claveDe(s)} id={claveDe(s)} etiqueta={`Mover paso ${i + 1}`} alerta={fuera}>
                    <input
                      className="input min-w-44 flex-1 py-1 text-base sm:text-[13px]"
                      aria-label={`Nombre del paso ${i + 1}`}
                      value={s.title}
                      placeholder={i === 0 ? 'Primer paso' : 'Otro paso…'}
                      onChange={(e) => setStep(i, { title: e.target.value })}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Duración: un rango de fechas, o un día con tiempo estimado (excluyentes) */}
                      <RangoFecha
                        etiqueta={`Fecha del paso ${i + 1}`}
                        inicio={s.startDate}
                        fin={finBorrador(s)}
                        alerta={fuera ? 'Fuera del plazo de la tarea' : null}
                        onChange={(inicio, fin) =>
                          setStep(i, {
                            startDate: inicio,
                            dias: inicio ? String(daysBetween(inicio, fin) + 1) : '',
                            // un rango de varios días no admite tiempo estimado
                            ...(inicio && fin > inicio ? { tiempo: '' } : {}),
                          })
                        }
                      />
                      <div className="flex items-center gap-1" title={varios ? 'El tiempo estimado es para pasos de un solo día' : 'Tiempo estimado (opcional)'}>
                        <input
                          type="number"
                          min={1}
                          step="any"
                          inputMode="decimal"
                          aria-label={`Tiempo estimado del paso ${i + 1}`}
                          placeholder="—"
                          disabled={varios}
                          className="input w-16 py-1 text-base sm:text-[13px] disabled:opacity-40"
                          value={varios ? '' : (s.tiempo ?? '')}
                          onChange={(e) => setStep(i, { tiempo: e.target.value })}
                        />
                        <div className={`w-[74px] ${varios ? 'pointer-events-none opacity-40' : ''}`}>
                          <Select
                            aria-label={`Unidad del tiempo del paso ${i + 1}`}
                            className="py-1 text-[13px]"
                            value={s.unidad ?? 'h'}
                            onChange={(v) => setStep(i, { unidad: v })}
                            options={UNIDADES_TIEMPO}
                          />
                        </div>
                      </div>
                      {/* Solo la duración calculada; ancho fijo para que el aviso no mueva la fila */}
                      <span className="w-32 truncate text-xs text-muted" aria-live="polite">
                        {s.startDate ? duracionPaso(p) : porTiempo(s) ? <span className="text-hot">elige un día</span> : 'Sin fecha'}
                        {fuera && <span className="text-[10.5px] text-hot"> · fuera de plazo</span>}
                      </span>
                      <button type="button" title="Quitar paso" aria-label={`Quitar paso ${i + 1}`} className="text-base text-faint hover:text-text" onClick={() => quitarPaso(i)}>
                        ✕
                      </button>
                    </div>
                  </FilaOrdenable>
                );
              })}
            </div>
            </SortableContext>
            </DndContext>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSteps((xs) => [...xs, pasoVacio()])}
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
                  // Los de tiempo estimado se encadenan en el mismo día (jornada de 8 h); los de días, día tras día
                  const encadenados = encadenar(
                    nombrados.map((s) =>
                      minutosDe(s) != null && (diasDe(s) ?? 1) === 1
                        ? { startDate: null, duracionDias: 1, duracionMin: minutosDe(s) }
                        : { startDate: null, duracionDias: diasDe(s), duracionMin: null },
                    ),
                    desde,
                  );
                  const nuevo = new Map(nombrados.map((s, i) => [s, encadenados[i]]));
                  setSteps(
                    steps.map((x) => {
                      const e = nuevo.get(x);
                      // solo cambian las fechas: el tiempo y su unidad quedan como se escribieron
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
        <PlanificadorTarea
          tarea={{ startDate: form.startDate, deadline: form.deadline, titulo: form.title.trim() }}
          steps={steps}
          color={color}
          onPasos={setSteps}
          sel={sel}
          setSel={setSel}
          onAgregarPaso={agregarPaso}
        />
        <ModalActions>
          {editing && <ConfirmDelete label="Eliminar tarea" disabled={remove.isPending} onConfirm={() => remove.mutate()} />}
          <button type="button" className="btn" onClick={() => void cerrar()}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !form.title.trim() || finAntes}>
            {editing ? 'Guardar' : 'Crear tarea'}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

/** Fila de paso reordenable con su asa ⠿ (ratón, táctil o teclado: espacio + flechas). */
function FilaOrdenable({ id, etiqueta, alerta = false, children }: { id: string; etiqueta: string; alerta?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Fuera de plazo: solo color (borde y fondo tenues), sin cambiar el tamaño de la fila
      className={`-ml-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-l-2 py-1.5 pl-1.5 ${alerta ? 'border-hot bg-hot/5' : 'border-transparent'} ${
        isDragging ? 'relative z-10 rounded-md bg-surface opacity-80 shadow-md' : ''
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        aria-label={etiqueta}
        title="Arrastra para reordenar"
        className="flex-none cursor-grab touch-none text-[15px] text-faint select-none hover:text-text active:cursor-grabbing"
      >
        ⠿
      </span>
      {children}
    </div>
  );
}
