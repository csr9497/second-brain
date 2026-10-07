import {
  detallarTarea,
  formatFrecuencia,
  resolverMarcaHabito,
  resumirCalendario,
  resumirHoy,
  resumirRevision,
  resumirTarea,
  todayISO,
} from '@sb/shared';
import type { EntradaHerramienta, NombreHerramienta } from '@sb/shared/herramientas';
import { api } from '../api';

type Ejecutores = { [N in NombreHerramienta]: (a: EntradaHerramienta<N>) => Promise<object> };

const conHabitos = async (id: string) => {
  const [t, habitos] = await Promise.all([api.task(id), api.habits()]);
  return detallarTarea(t, todayISO(), habitos);
};

/** Qué hace cada herramienta del catálogo (`@sb/shared/herramientas`), sobre la misma capa de datos que la web. */
export const EJECUTAR: Ejecutores = {
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
    const t = await api.createTask(entrada);
    return { ok: true, tarea: resumirTarea(t, todayISO()) };
  },
  add_step: async ({ taskId, paso }) => {
    await api.addStep(taskId, paso);
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
};
