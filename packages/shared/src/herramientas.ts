// Catálogo de herramientas para agentes (WebMCP hoy; servidor MCP después): nombre, descripción,
// entrada (Zod) y nivel. Cada transporte aporta la ejecución por nombre.
// Subruta aparte (`@sb/shared/herramientas`): importa valores de `./index`, así que no puede reexportarse desde allí (ciclo).
import { z } from 'zod';
import { createStepInput, createTaskInput, habitSlot, projectStatus, taskFilter } from './index';

const id = (que: string) => z.uuid().describe(`id de ${que}`);
const hecho = z.boolean().describe('true = marcar como hecho; false = desmarcar');

/** Nivel 0 = solo lectura; 1 = capturar y marcar (aditivo y reversible). */
export type NivelHerramienta = 0 | 1;

export interface DefHerramienta<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  nivel: NivelHerramienta;
}

const def = <S extends z.ZodType>(name: string, nivel: NivelHerramienta, description: string, input: S): DefHerramienta<S> => ({ name, nivel, description, input });
const vacio = z.object({});

const COMUN = 'Second Brain (app personal de Cesar). Las fechas son YYYY-MM-DD en su zona horaria; toda respuesta incluye `hoy` y `tz`.';

export const HERRAMIENTAS = {
  get_today: def('get_today', 0, `${COMUN} Pantalla Hoy: franja actual, % de hábitos y racha, hábitos por franja (con id y turno), hábitos semanales y tareas de hoy, de la semana y en incumplimiento.`, vacio),
  list_tasks: def(
    'list_tasks',
    0,
    `${COMUN} Lista tareas (máx. 50) de una lista: hoy, semana, todas (pendientes) o incumplimiento (vencidas sin terminar).`,
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
    `${COMUN} Crea una tarea. Opcional: inicio y deadline, proyecto (id de list_projects), pasos con inicio y días, y hábitos vinculados (ids de list_habits; completar la tarea o un paso los marca ese día).`,
    createTaskInput,
  ),
  add_step: def('add_step', 1, `${COMUN} Añade un paso a una tarea; opcionalmente programado (inicio + días).`, z.object({ taskId: id('la tarea'), paso: createStepInput })),
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
