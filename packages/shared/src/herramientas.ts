// Catálogo de herramientas para agentes (WebMCP hoy; servidor MCP después): nombre, descripción,
// entrada (Zod) y nivel. Cada transporte aporta la ejecución por nombre.
// Subruta aparte (`@sb/shared/herramientas`): importa valores de `./index`, así que no puede reexportarse desde allí (ciclo).
import { z } from 'zod';
import { createStepInput, createTaskInput, habitSlot, ideaStatus, isoDate, projectStatus, taskFilter, updateProjectInput, updateStepInput, updateTaskInput } from './index';

const id = (que: string) => z.uuid().describe(`id de ${que}`);
const hecho = z.boolean().describe('true = marcar como hecho; false = desmarcar');

/** Nivel 0 = solo lectura; 1 = capturar y marcar (aditivo y reversible); 2 = editar datos existentes (nada se borra). */
export type NivelHerramienta = 0 | 1 | 2;

export interface DefHerramienta<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  nivel: NivelHerramienta;
  /** Solo en el navegador (WebMCP): actúa sobre la interfaz, no sobre los datos */
  interfaz?: boolean;
}

const def = <S extends z.ZodType>(name: string, nivel: NivelHerramienta, description: string, input: S, interfaz = false): DefHerramienta<S> => ({
  name,
  nivel,
  description,
  input,
  interfaz,
});
const PROGRAMAR =
  'Programar un paso: startDate (YYYY-MM-DD) + duracionDias (rango de días), o startDate + duracionMin (tiempo estimado en minutos, un solo día; los de un mismo día se encadenan en orden en el día de trabajo de la tarea, minutosDia, 8 h si no tiene). Solo duracionMin, sin startDate: empieza el día de inicio de la tarea. Solo startDate: dura hasta el deadline de la tarea.';
const vacio = z.object({});

const COMUN = 'Second Brain (app personal de Cesar). Las fechas son YYYY-MM-DD en su zona horaria; toda respuesta incluye `hoy` y `tz`.';

export const HERRAMIENTAS = {
  get_today: def('get_today', 0, `${COMUN} Pantalla Hoy: franja actual, % de hábitos y racha, hábitos por franja (con id y turno), hábitos semanales y tareas de hoy, de la semana y en incumplimiento; cada tarea trae en «pasosDelPeriodo» sus pasos de hoy (lista hoy) o de la semana (lista semana).`, vacio),
  list_tasks: def(
    'list_tasks',
    0,
    `${COMUN} Lista tareas (máx. 50) de una lista: hoy, semana, todas (pendientes) o incumplimiento (vencidas sin terminar). En hoy y semana, cada tarea trae en «pasosDelPeriodo» sus pasos de ese periodo.`,
    z.object({ filtro: taskFilter.describe('hoy | semana | todas | incumplimiento') }),
  ),
  get_task: def('get_task', 0, `${COMUN} Detalle de una tarea: pasos (con id, inicio, días, fin y si está fuera de plazo), notas y hábitos vinculados.`, z.object({ id: id('la tarea') })),
  search_tasks: def('search_tasks', 0, `${COMUN} Busca tareas por título (máx. 20), incluidas las hechas. Úsalo para obtener el id a partir de un nombre.`, z.object({ texto: z.string().trim().min(1) })),
  get_calendar: def(
    'get_calendar',
    0,
    `${COMUN} Calendario de un mes: por día, tareas con rango, pasos programados, vencimientos y % de hábitos.`,
    z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).describe('YYYY-MM') }),
  ),
  list_projects: def('list_projects', 0, `${COMUN} Proyectos con estado, próxima acción y avance.`, z.object({ estado: projectStatus.optional() })),
  list_habits: def('list_habits', 0, `${COMUN} Todos los hábitos (también archivados) con su frecuencia: turnos diarios o N veces por semana.`, vacio),
  list_ideas: def('list_ideas', 0, `${COMUN} Ideas capturadas, las más recientes primero.`, vacio),
  get_weekly_review: def(
    'get_weekly_review',
    0,
    `${COMUN} Revisión de la semana (lunes–domingo): % de hábitos, tareas, proyectos con sus tareas y pasos, y la fila diaria de cada hábito.`,
    vacio,
  ),
  capture_idea: def('capture_idea', 1, `${COMUN} Guarda una idea rápida en la bandeja de ideas.`, z.object({ texto: z.string().trim().min(1) })),
  create_task: def(
    'create_task',
    1,
    `${COMUN} Crea una tarea. Opcional: inicio y deadline, minutosDia (minutos al día que se le dedican, de 15 en 15; 8 h si falta), proyecto (id de list_projects), pasos (${PROGRAMAR}) y hábitos vinculados (ids de list_habits; completar la tarea o un paso los marca ese día).`,
    createTaskInput,
  ),
  add_step: def('add_step', 1, `${COMUN} Añade un paso al final de una tarea, opcionalmente programado. ${PROGRAMAR}`, z.object({ taskId: id('la tarea'), paso: createStepInput })),
  set_task_done: def(
    'set_task_done',
    1,
    `${COMUN} Marca o desmarca una tarea como hecha. Idempotente: si ya está así, no cambia nada. Marcarla marca también hoy sus hábitos vinculados.`,
    z.object({ id: id('la tarea'), hecho }),
  ),
  set_step_done: def('set_step_done', 1, `${COMUN} Marca o desmarca un paso. Idempotente. El estado de la tarea se ajusta solo.`, z.object({ id: id('el paso'), hecho })),
  set_habit_done: def(
    'set_habit_done',
    1,
    `${COMUN} Marca o desmarca hoy un hábito (id de get_today). Diario: se marca una vez por turno; sin franja usa la franja actual o el primer turno pendiente. Semanal: una vez al día. Idempotente.`,
    z.object({ habitId: id('el hábito'), hecho, franja: habitSlot.optional().describe('manana | tarde | noche') }),
  ),

  // Nivel 2: editar (nada se borra)
  update_task: def(
    'update_task',
    2,
    `${COMUN} Cambia campos de una tarea: título, descripción, notas, prioridad, tipo, proyecto, startDate/deadline (null para quitar), minutosDia (null = 8 h), estado y hábitos vinculados (habitIds reemplaza la lista). Para marcarla hecha usa set_task_done.`,
    z.object({ id: id('la tarea'), cambios: updateTaskInput }),
  ),
  update_step: def(
    'update_step',
    2,
    `${COMUN} Cambia el título o la programación de un paso. ${PROGRAMAR} startDate: null lo deja sin programar.`,
    z.object({ id: id('el paso'), cambios: updateStepInput }),
  ),
  reorder_steps: def(
    'reorder_steps',
    2,
    `${COMUN} Reordena los pasos de una tarea: stepIds con todos sus pasos en el orden deseado (ids de get_task). Solo cambia el orden, no las fechas.`,
    z.object({ taskId: id('la tarea'), stepIds: z.array(z.uuid()).min(1) }),
  ),
  chain_steps: def(
    'chain_steps',
    2,
    `${COMUN} Encadena los pasos pendientes de una tarea en el orden de la lista, desde \`desde\` (por defecto, el inicio de la tarea u hoy): los de días uno tras otro y los de tiempo en el mismo día mientras quepan en 8 h. Se guarda todo junto o nada.`,
    z.object({ taskId: id('la tarea'), desde: isoDate.optional(), incluirHechos: z.boolean().optional() }),
  ),
  update_project: def(
    'update_project',
    2,
    `${COMUN} Cambia un proyecto: nombre, estado, prioridad, próxima acción (nextAction), días de trabajo (scheduleDays, 0 = domingo), avance (totalProgress 0–100) o color.`,
    z.object({ id: id('el proyecto'), cambios: updateProjectInput }),
  ),
  process_idea: def(
    'process_idea',
    2,
    `${COMUN} Cambia el estado de una idea: procesada o archivada la sacan de la bandeja (inbox).`,
    z.object({ id: id('la idea'), estado: ideaStatus }),
  ),

  // Interfaz (solo en el navegador): abren pantallas, no escriben datos
  open_task: def('open_task', 0, `${COMUN} Abre una tarea en su modal para que Cesar la vea o la edite.`, z.object({ id: id('la tarea') }), true),
  open_new_task: def(
    'open_new_task',
    0,
    `${COMUN} Abre el modal de nueva tarea con inicio y fin ya puestos, sin guardar: Cesar completa y confirma.`,
    z.object({ startDate: isoDate.optional(), deadline: isoDate.optional() }),
    true,
  ),
  go_to: def('go_to', 0, `${COMUN} Cambia de vista: hoy, calendario, gantt o resumen (revisión semanal y mensual) (si hay cambios sin guardar, se le pregunta a Cesar).`, z.object({ vista: z.enum(['hoy', 'calendario', 'gantt', 'resumen']) }), true),
} as const;

export type NombreHerramienta = keyof typeof HERRAMIENTAS;
export type EntradaHerramienta<N extends NombreHerramienta> = z.output<(typeof HERRAMIENTAS)[N]['input']>;

/** JSON Schema de la entrada (lo que el agente debe enviar, antes de defaults). */
export const esquemaJson = (h: DefHerramienta) => z.toJSONSchema(h.input, { io: 'input' }) as Record<string, unknown>;

/** Valida la entrada; devuelve un mensaje legible si no es válida. */
export function validarEntrada<N extends NombreHerramienta>(nombre: N, args: unknown): { ok: true; datos: EntradaHerramienta<N> } | { ok: false; error: string } {
  const r = HERRAMIENTAS[nombre].input.safeParse(args ?? {});
  return r.success ? { ok: true, datos: r.data as EntradaHerramienta<N> } : { ok: false, error: `Entrada no válida: ${z.prettifyError(r.error)}` };
}
