import {
  detallarTarea,
  encadenarTarea,
  formatFrecuencia,
  programarPaso,
  reordenarPasos,
  resolverMarcaHabito,
  resumirCalendario,
  resumirHoy,
  resumirRevision,
  resumirTarea,
  todayISO,
  type CreateStepInput,
  type Task,
} from '@sb/shared';
import type { EntradaHerramienta, NombreHerramienta } from '@sb/shared/herramientas';
import { api } from '../api';
import type { Vista } from '../useVista';

/** Lo que las herramientas de interfaz pueden hacer en la pantalla (lo aporta `Home`). */
export interface PuenteUI {
  /** false si hay un modal abierto (no se pisa lo que Cesar está editando) */
  abrirTarea: (t: Task) => boolean;
  nuevaTarea: (inicial: { startDate: string; deadline: string }) => boolean;
  /** false si Cesar decide quedarse por cambios sin guardar */
  irA: (v: Vista) => Promise<boolean>;
}

type Ejecutores = { [N in NombreHerramienta]: (a: EntradaHerramienta<N>) => Promise<object> };

const conHabitos = async (id: string) => {
  const [t, habitos] = await Promise.all([api.task(id), api.habits()]);
  return detallarTarea(t, todayISO(), habitos);
};

/** Paso de entrada con la programación normalizada como la exige la base (o error legible). */
function pasoValido(p: CreateStepInput): CreateStepInput {
  const prog = programarPaso({ startDate: null, duracionDias: null, duracionMin: null }, p);
  if ('error' in prog) throw new Error(`Paso «${p.title}»: ${prog.error}`);
  return { ...p, ...prog };
}

const MODAL_ABIERTO = 'Hay un modal abierto en la pantalla; pide a Cesar que lo cierre o guarde primero.';

/** Qué hace cada herramienta del catálogo (`@sb/shared/herramientas`), sobre la misma capa de datos que la web. */
export const ejecutores = (ui: PuenteUI): Ejecutores => ({
  get_today: async () => resumirHoy(await api.today()),
  list_tasks: async ({ filtro }) => {
    const t = await api.today();
    const lista = t.tasks[filtro];
    return { filtro, total: lista.length, tareas: lista.slice(0, 50).map((x) => resumirTarea(x, t.date)) };
  },
  get_task: async ({ id }) => conHabitos(id),
  search_tasks: async ({ texto }) => ({ tareas: (await api.searchTasks(texto)).map((t) => resumirTarea(t, todayISO())) }),
  get_calendar: async ({ mes }) => resumirCalendario(await api.calendar(mes)),
  list_projects: async ({ estado }) => ({
    proyectos: (await api.projects(estado)).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      estado: p.estado,
      prioridad: p.prioridad,
      proximaAccion: p.nextAction,
      avance: p.totalProgress,
      pctSemana: p.pctSemana,
      hoyToca: p.hoyToca,
    })),
  }),
  list_habits: async () => ({
    habitos: (await api.habits()).map((h) => ({
      id: h.id,
      nombre: h.nombre,
      frecuencia: formatFrecuencia(h),
      turnos: h.turnos,
      vecesSemana: h.vecesSemana,
      archivado: h.archivedAt != null,
    })),
  }),
  list_ideas: async () => ({ ideas: (await api.ideas()).slice(0, 50).map((i) => ({ id: i.id, texto: i.texto, estado: i.estado, creada: i.createdAt })) }),
  get_weekly_review: async () => resumirRevision(await api.currentReview()),

  capture_idea: async ({ texto }) => {
    await api.createIdea(texto);
    return { ok: true, mensaje: `Idea guardada: «${texto}»` };
  },
  create_task: async (entrada) => {
    const t = await api.createTask({ ...entrada, steps: entrada.steps.map(pasoValido) });
    return { ok: true, tarea: resumirTarea(t, todayISO()) };
  },
  add_step: async ({ taskId, paso }) => {
    await api.addStep(taskId, pasoValido(paso));
    return { ok: true, tarea: await conHabitos(taskId) };
  },
  set_task_done: async ({ id, hecho }) => {
    const t = await api.task(id);
    if ((t.status === 'hecha') === hecho) return { ok: true, sinCambios: true, mensaje: `«${t.title}» ya estaba ${hecho ? 'hecha' : 'pendiente'}` };
    await api.updateTask(id, { status: hecho ? 'hecha' : 'por_hacer' });
    return { ok: true, mensaje: `«${t.title}» ${hecho ? 'marcada como hecha' : 'vuelve a por hacer'}`, habitosVinculados: hecho ? t.habitIds.length : 0 };
  },
  set_step_done: async ({ id, hecho }) => {
    const s = await api.step(id);
    if (s.done === hecho) return { ok: true, sinCambios: true, mensaje: `El paso «${s.title}» ya estaba ${hecho ? 'hecho' : 'pendiente'}` };
    await api.setStepDone(id, hecho);
    return { ok: true, mensaje: `Paso «${s.title}» ${hecho ? 'hecho' : 'pendiente'}`, tarea: await conHabitos(s.taskId) };
  },
  set_habit_done: async ({ habitId, hecho, franja }) => {
    const r = resolverMarcaHabito(await api.today(), habitId, hecho, franja);
    if ('error' in r) throw new Error(r.error);
    if ('nada' in r) return { ok: true, sinCambios: true, mensaje: r.nada };
    await api.toggleHabit(r.marca);
    return { ok: true, mensaje: `Hábito ${hecho ? 'marcado' : 'desmarcado'} (franja ${r.marca.slot})` };
  },

  update_task: async ({ id, cambios }) => {
    const antes = await api.task(id);
    await api.updateTask(id, cambios, antes.habitIds);
    return { ok: true, tarea: await conHabitos(id) };
  },
  update_step: async ({ id, cambios }) => {
    const t = await api.task((await api.step(id)).taskId);
    const s = t.steps.find((x) => x.id === id)!;
    const { title, ...prog } = cambios;
    const tocaProgramacion = Object.values(prog).some((v) => v !== undefined);
    const nueva = tocaProgramacion ? programarPaso(s, prog) : null;
    if (nueva && 'error' in nueva) throw new Error(nueva.error);
    await api.updateStep(id, { ...(title !== undefined && { title }), ...nueva });
    return { ok: true, tarea: await conHabitos(t.id) };
  },
  reorder_steps: async ({ taskId, stepIds }) => {
    const t = await api.task(taskId);
    const r = reordenarPasos(t.steps, stepIds);
    if ('error' in r) throw new Error(r.error);
    for (const c of r) await api.moverPaso(c.id, c.position);
    return { ok: true, movidos: r.length, pasos: (await api.task(taskId)).steps.map((s) => ({ id: s.id, titulo: s.title })) };
  },
  chain_steps: async ({ taskId, desde, incluirHechos }) => {
    const t = await api.task(taskId);
    const inicio = desde ?? t.startDate ?? todayISO();
    const plan = encadenarTarea(t, inicio, incluirHechos);
    if (plan.length === 0) return { ok: true, sinCambios: true, mensaje: 'La tarea no tiene pasos pendientes que encadenar' };
    await api.programarPasos(plan);
    return { ok: true, desde: inicio, tarea: await conHabitos(taskId) };
  },
  update_project: async ({ id, cambios }) => {
    await api.updateProject(id, cambios);
    const p = (await api.projects()).find((x) => x.id === id);
    return { ok: true, proyecto: p && { id: p.id, nombre: p.nombre, estado: p.estado, proximaAccion: p.nextAction, avance: p.totalProgress } };
  },
  process_idea: async ({ id, estado }) => {
    await api.updateIdea(id, estado);
    return { ok: true, mensaje: `Idea ${estado === 'inbox' ? 'devuelta a la bandeja' : estado}` };
  },

  open_task: async ({ id }) => {
    const t = await api.task(id);
    if (!ui.abrirTarea(t)) throw new Error(MODAL_ABIERTO);
    return { ok: true, mensaje: `Abierta «${t.title}»` };
  },
  open_new_task: async ({ startDate, deadline }) => {
    if (!ui.nuevaTarea({ startDate: startDate ?? '', deadline: deadline ?? '' })) throw new Error(MODAL_ABIERTO);
    return { ok: true, mensaje: 'Modal de nueva tarea abierto; Cesar la completa y la guarda' };
  },
  go_to: async ({ vista }) => {
    if (!(await ui.irA(vista))) return { ok: false, mensaje: 'Cesar prefirió quedarse: hay cambios sin guardar' };
    return { ok: true, vista };
  },
});
