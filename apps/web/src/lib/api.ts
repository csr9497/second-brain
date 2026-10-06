// Acceso a datos sobre Supabase (PostgREST + RLS). Traduce snake_case ↔ camelCase
// y delega los cálculos a la lógica pura de @sb/shared. Reglas que viven en la
// base (triggers): completed_at, pasos → tarea hecha y actividad del proyecto.
import {
  addDays,
  buildCalendar,
  buildToday,
  buildWeeklyReport,
  calendarGrid,
  createHabitInput,
  createProjectInput,
  createTaskInput,
  positionBetween,
  projectViews,
  todayISO,
  updateHabitInput,
  updateStepInput,
  createStepInput,
  type CalendarMonth,
  type CreateStepInput,
  weekRange,
  type CreateHabitInput,
  type CreateTaskInput,
  type DashboardInput,
  type HabitAdmin,
  type HabitRow,
  type HabitSlot,
  type Idea,
  type Project,
  type ProjectInput,
  type ProjectRow,
  type ReorderInput,
  type Task,
  type TodayPayload,
  type UpdateHabitInput,
  type UpdateStepInput,
  type UpdateTaskInput,
  type WeeklyReport,
} from '@sb/shared';
import { sb } from './supabase';

const STREAK_LOOKBACK_DAYS = 366;
const PAGE = 1000; // límite de filas por petición de PostgREST

/**
 * Lanza el error de Supabase (si lo hay) y devuelve los datos. Sin error, en
 * selects `data` nunca es null (con `.single()` un 0 filas es un error).
 */
function must<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R['data']> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<R['data']>;
}

/** Trae todas las filas paginando de PAGE en PAGE. */
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const page: T[] = must(await query(from, from + PAGE - 1)) ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function userId() {
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error('Sesión expirada');
  return data.session.user.id;
}

// ---------- Mapeo de filas ----------

type Row = Record<string, any>;

const TASK_SELECT = '*, project:projects(nombre, color), steps(*)';

const toHabitRow = (h: Row): HabitRow => ({
  id: h.id,
  nombre: h.nombre,
  position: Number(h.position),
  periods: (h.periods ?? [])
    .map((p: Row) => ({ desde: p.desde, hasta: p.hasta, turnos: p.turnos as HabitSlot[][] }))
    .sort((a: { desde: string }, b: { desde: string }) => Date.parse(a.desde) - Date.parse(b.desde)),
});

const toTask = (r: Row): Task => ({
  id: r.id,
  projectId: r.project_id,
  projectName: r.project?.nombre ?? null,
  projectColor: r.project?.color ?? null,
  title: r.title,
  description: r.description,
  type: r.type,
  priority: r.priority,
  status: r.status,
  startDate: r.start_date,
  deadline: r.deadline,
  position: Number(r.position),
  notes: r.notes,
  completedAt: r.completed_at,
  steps: (r.steps ?? [])
    .map((s: Row) => ({ id: s.id, taskId: s.task_id, title: s.title,
      done: s.done,
      position: Number(s.position),
      startDate: s.start_date,
      duracionDias: s.duracion_dias,
    }))
    .sort((a: { position: number }, b: { position: number }) => a.position - b.position),
});

const toProjectRow = (r: Row): ProjectRow => ({
  id: r.id,
  nombre: r.nombre,
  estado: r.estado,
  prioridad: r.prioridad,
  nextAction: r.next_action,
  scheduleDays: r.schedule_days ?? [],
  totalProgress: r.total_progress,
  color: r.color ?? 'azul',
  lastActivityAt: r.last_activity_at,
});

const taskColumns = (t: Partial<CreateTaskInput & UpdateTaskInput>): Row =>
  Object.fromEntries(
    Object.entries({
      title: t.title,
      description: t.description,
      type: t.type,
      project_id: t.projectId,
      priority: t.priority,
      status: t.status,
      start_date: t.startDate,
      deadline: t.deadline,
      notes: t.notes,
    }).filter(([, v]) => v !== undefined),
  );

const projectColumns = (p: Partial<ProjectInput>): Row =>
  Object.fromEntries(
    Object.entries({
      nombre: p.nombre,
      estado: p.estado,
      prioridad: p.prioridad,
      next_action: p.nextAction,
      schedule_days: p.scheduleDays,
      total_progress: p.totalProgress,
      color: p.color,
    }).filter(([, v]) => v !== undefined),
  );

// ---------- Carga del dashboard ----------

/**
 * Todo lo necesario para /today y la revisión. De las tareas hechas solo se traen
 * las de esta semana (las demás no se muestran ni cuentan).
 */
async function loadDashboard(now = new Date()): Promise<DashboardInput> {
  const today = todayISO(now);
  const { start } = weekRange(today);
  const weekStartTs = new Date(`${start}T00:00:00`).toISOString();

  const [habits, logs, tasks, projects] = await Promise.all([
    sb.from('habits').select('id, nombre, position, periods:habit_periods(desde, hasta, turnos)').order('position'),
    fetchAll<Row>((a, b) =>
      sb
        .from('habit_logs')
        .select('habit_id, fecha, slot')
        .eq('done', true)
        .gte('fecha', addDays(today, -STREAK_LOOKBACK_DAYS))
        .order('fecha')
        .order('id')
        .range(a, b),
    ),
    fetchAll<Row>((a, b) =>
      sb
        .from('tasks')
        .select(TASK_SELECT)
        .or(`status.neq.hecha,completed_at.gte.${weekStartTs},deadline.gte.${start}`)
        .order('position')
        .order('id')
        .range(a, b),
    ),
    sb.from('projects').select('*'),
  ]);

  return {
    habits: must(habits).map(toHabitRow),
    doneLogs: logs.map((l) => ({ habitId: l.habit_id, fecha: l.fecha, slot: l.slot as HabitSlot })),
    tasks: tasks.map(toTask),
    projects: must(projects).map(toProjectRow),
    now,
  };
}

async function maxPosition(table: 'tasks' | 'steps' | 'habits', taskId?: string) {
  let q = sb.from(table).select('position').order('position', { ascending: false }).limit(1);
  if (taskId) q = q.eq('task_id', taskId);
  const [row] = must(await q);
  return row ? Number(row.position) : null;
}

async function getTask(id: string): Promise<Task> {
  return toTask(must(await sb.from('tasks').select(TASK_SELECT).eq('id', id).single()));
}

// ---------- API ----------

export const api = {
  today: async (): Promise<TodayPayload> => buildToday(await loadDashboard()),

  /** Mes del calendario: tareas que vencen o tienen pasos en la rejilla, hábitos y sus registros. */
  calendar: async (mes: string): Promise<CalendarMonth> => {
    const { start, end } = calendarGrid(mes);
    const [porDeadline, pasos, habits, logs] = await Promise.all([
      fetchAll<Row>((a, b) => sb.from('tasks').select(TASK_SELECT).gte('deadline', start).lte('deadline', end).order('position').order('id').range(a, b)),
      // pasos que empiezan hasta 1 año antes de la rejilla pueden cruzarla
      fetchAll<Row>((a, b) =>
        sb.from('steps').select('task_id').gte('start_date', addDays(start, -366)).lte('start_date', end).order('id').range(a, b),
      ),
      sb.from('habits').select('id, nombre, position, periods:habit_periods(desde, hasta, turnos)').order('position'),
      fetchAll<Row>((a, b) =>
        sb.from('habit_logs').select('habit_id, fecha, slot').eq('done', true).gte('fecha', start).lte('fecha', end).order('fecha').order('id').range(a, b),
      ),
    ]);
    const vistas = new Set(porDeadline.map((t) => t.id));
    const faltan = [...new Set(pasos.map((p) => p.task_id as string))].filter((id) => !vistas.has(id));
    const extra = faltan.length ? must(await sb.from('tasks').select(TASK_SELECT).in('id', faltan)) : [];
    return buildCalendar({
      mes,
      hoy: todayISO(),
      tasks: [...porDeadline, ...extra].map(toTask),
      habits: must(habits).map(toHabitRow),
      doneLogs: logs.map((l) => ({ habitId: l.habit_id, fecha: l.fecha, slot: l.slot as HabitSlot })),
    });
  },

  // Tareas
  createTask: async (input: CreateTaskInput): Promise<Task> => {
    const { steps, ...fields } = createTaskInput.parse(input);
    const position = positionBetween(await maxPosition('tasks'), null);
    const task = must(await sb.from('tasks').insert({ ...taskColumns(fields), position }).select('id').single());
    if (steps.length > 0) {
      must(
        await sb.from('steps').insert(
          steps.map((s, i) => ({
            task_id: task.id,
            title: s.title,
            start_date: s.startDate ?? null,
            duracion_dias: s.duracionDias ?? null,
            position: (i + 1) * 1000,
          })),
        ),
      );
    }
    return getTask(task.id);
  },
  updateTask: async (id: string, patch: UpdateTaskInput) => {
    must(await sb.from('tasks').update(taskColumns(patch)).eq('id', id));
  },
  deleteTask: async (id: string) => {
    must(await sb.from('tasks').delete().eq('id', id));
  },
  toggleTask: async (id: string) => {
    const { status } = must(await sb.from('tasks').select('status').eq('id', id).single());
    must(await sb.from('tasks').update({ status: status === 'hecha' ? 'por_hacer' : 'hecha' }).eq('id', id));
  },
  /** `beforeId` = vecino que queda arriba, `afterId` = el de abajo. Guarda el punto medio. */
  reorderTask: async ({ id, beforeId, afterId }: ReorderInput) => {
    const ids = [beforeId, afterId].filter((x): x is string => !!x);
    const rows = ids.length ? must(await sb.from('tasks').select('id, position').in('id', ids)) : [];
    const pos = (x?: string | null) => {
      const r = rows.find((row) => row.id === x);
      return r ? Number(r.position) : null;
    };
    const position = positionBetween(pos(beforeId), pos(afterId));
    must(await sb.from('tasks').update({ position }).eq('id', id));
  },

  // Pasos (el trigger steps_sync_task ajusta el estado de la tarea)
  toggleStep: async (id: string) => {
    const { done } = must(await sb.from('steps').select('done').eq('id', id).single());
    must(await sb.from('steps').update({ done: !done }).eq('id', id));
  },
  addStep: async (taskId: string, input: CreateStepInput) => {
    const step = createStepInput.parse(input);
    const position = positionBetween(await maxPosition('steps', taskId), null);
    must(
      await sb
        .from('steps')
        .insert({ task_id: taskId, title: step.title, start_date: step.startDate ?? null, duracion_dias: step.duracionDias ?? null, position }),
    );
  },
  /** Título y/o programación del paso; solo escribe los campos definidos. */
  updateStep: async (id: string, patch: UpdateStepInput) => {
    const { title, startDate, duracionDias } = updateStepInput.parse(patch);
    const cols = Object.fromEntries(
      Object.entries({ title, start_date: startDate, duracion_dias: duracionDias }).filter(([, v]) => v !== undefined),
    );
    must(await sb.from('steps').update(cols).eq('id', id));
  },
  deleteStep: async (id: string) => {
    must(await sb.from('steps').delete().eq('id', id));
  },

  // Hábitos: un registro por (hábito, fecha). Archivar conserva el historial.
  /**
   * Marca o desmarca el turno de una ficha. Si el turno ya está hecho (en cualquiera de sus franjas),
   * lo desmarca en todas; si no, lo marca en la franja de la ficha.
   */
  toggleHabit: async ({ id, slot, turno, done }: { id: string; slot: HabitSlot; turno: HabitSlot[]; done: boolean }) => {
    const fecha = todayISO();
    if (done) {
      must(await sb.from('habit_logs').update({ done: false }).eq('habit_id', id).eq('fecha', fecha).in('slot', turno));
    } else {
      must(await sb.from('habit_logs').upsert({ habit_id: id, fecha, slot, done: true }, { onConflict: 'habit_id,fecha,slot' }));
    }
  },
  habits: async (): Promise<HabitAdmin[]> =>
    must(await sb.from('habits').select('id, nombre, position, turnos, archived_at').order('position')).map((h) => ({
      id: h.id,
      nombre: h.nombre,
      turnos: h.turnos as HabitSlot[][],
      position: Number(h.position),
      archivedAt: h.archived_at,
    })),
  createHabit: async (input: CreateHabitInput) => {
    const { nombre, turnos } = createHabitInput.parse(input);
    const position = positionBetween(await maxPosition('habits'), null);
    must(await sb.from('habits').insert({ nombre, turnos, position }));
  },
  updateHabit: async (id: string, patch: UpdateHabitInput) => {
    const { nombre, turnos } = updateHabitInput.parse(patch);
    const cols = Object.fromEntries(Object.entries({ nombre, turnos }).filter(([, v]) => v !== undefined));
    must(await sb.from('habits').update(cols).eq('id', id));
  },
  archiveHabit: async (id: string) => {
    must(await sb.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', id));
  },
  /** El trigger habits_sync_periods abre un periodo nuevo; el historial anterior se conserva. */
  reactivateHabit: async (id: string) => {
    must(await sb.from('habits').update({ archived_at: null }).eq('id', id));
  },
  /** Borrado real: sus habit_logs se van en cascada. */
  deleteHabit: async (id: string) => {
    must(await sb.from('habits').delete().eq('id', id));
  },

  // Proyectos
  /** Sin `estado` devuelve todos los proyectos. */
  projects: async (estado?: string): Promise<Project[]> => {
    const today = todayISO();
    const { start, end } = weekRange(today);
    let q = sb.from('projects').select('*');
    if (estado) q = q.eq('estado', estado);
    const [projects, weekTasks] = await Promise.all([
      q,
      sb.from('tasks').select('project_id, status, deadline').gte('deadline', start).lte('deadline', end).not('project_id', 'is', null),
    ]);
    const tasks = must(weekTasks).map((t) => ({ projectId: t.project_id, status: t.status, deadline: t.deadline }));
    return projectViews(must(projects).map(toProjectRow), tasks, today);
  },
  createProject: async (input: ProjectInput) => {
    must(await sb.from('projects').insert(projectColumns(createProjectInput.parse(input))));
  },
  updateProject: async (id: string, patch: Partial<ProjectInput>) => {
    must(await sb.from('projects').update(projectColumns(patch)).eq('id', id));
  },
  deleteProject: async (id: string) => {
    must(await sb.from('projects').delete().eq('id', id));
  },

  // Ideas (captura rápida)
  ideas: async (): Promise<Idea[]> =>
    must(await sb.from('ideas').select('*').eq('estado', 'inbox').order('created_at', { ascending: false })).map((i) => ({
      id: i.id,
      texto: i.texto,
      estado: i.estado,
      createdAt: i.created_at,
    })),
  createIdea: async (texto: string) => {
    must(await sb.from('ideas').insert({ texto }));
  },

  // Revisión semanal: reporte calculado; archivar congela una foto (upsert por semana)
  currentReview: async (): Promise<WeeklyReport> => {
    const input = await loadDashboard();
    const { start } = weekRange(todayISO(input.now));
    const archived = must(await sb.from('reviews').select('id').eq('week_start', start).not('archived_at', 'is', null));
    return buildWeeklyReport(input, archived.length > 0);
  },
  archiveReview: async (nota: string) => {
    const { weekStart, weekEnd, archived: _, ...metrics } = buildWeeklyReport(await loadDashboard(), true);
    must(
      await sb.from('reviews').upsert(
        { user_id: await userId(), week_start: weekStart, week_end: weekEnd, metrics, nota: nota || null, archived_at: new Date().toISOString() },
        { onConflict: 'user_id,week_start' },
      ),
    );
  },
};
