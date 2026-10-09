// Acceso a datos sobre Supabase (PostgREST + RLS). Traduce snake_case ↔ camelCase
// y delega los cálculos a la lógica pura de @sb/shared. Reglas que viven en la
// base (triggers): completed_at, pasos → tarea hecha y actividad del proyecto.
import {
  addDays,
  buildCalendar,
  buildToday,
  buildMonthlyReport,
  buildWeeklyReport,
  type MonthlyReport,
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
  type Cambio,
  type CreateStepInput,
  weekRange,
  type CreateHabitInput,
  type CreateTaskInput,
  type DashboardInput,
  type HabitAdmin,
  type HabitRow,
  type HabitSlot,
  type Idea,
  type Jornada,
  JORNADA_POR_DEFECTO,
  fijarJornada,
  type Project,
  type PaletteColor,
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

const TASK_SELECT = '*, project:projects(nombre, color), steps(*), task_habits(habit_id)';
const HABIT_SELECT = 'id, nombre, position, periods:habit_periods(desde, hasta, turnos, veces_semana)';

const toHabitRow = (h: Row): HabitRow => ({
  id: h.id,
  nombre: h.nombre,
  position: Number(h.position),
  periods: (h.periods ?? [])
    .map((p: Row) => ({ desde: p.desde, hasta: p.hasta, turnos: p.turnos as HabitSlot[][], vecesSemana: p.veces_semana }))
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
      duracionMin: s.duracion_min,
    }))
    .sort((a: { position: number }, b: { position: number }) => a.position - b.position),
  habitIds: (r.task_habits ?? []).map((th: Row) => th.habit_id),
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

/** Deja a la tarea vinculada exactamente a `nuevos` (no toca registros ya marcados). */
async function vincularHabitos(taskId: string, nuevos: string[], antes: string[]) {
  const quitar = antes.filter((h) => !nuevos.includes(h));
  const agregar = nuevos.filter((h) => !antes.includes(h));
  if (quitar.length) must(await sb.from('task_habits').delete().eq('task_id', taskId).in('habit_id', quitar));
  if (agregar.length) must(await sb.from('task_habits').insert(agregar.map((habit_id) => ({ task_id: taskId, habit_id }))));
}

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
    sb.from('habits').select(HABIT_SELECT).order('position'),
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

/** Hora local "HH:MM" por franja; null = sin aviso en esa franja. */
export interface AvisosConfig {
  activo: boolean;
  horas: Record<HabitSlot, string | null>;
}
export interface Dispositivo {
  id: string;
  endpoint: string;
  userAgent: string;
  createdAt: string;
}

/** Postgres devuelve "HH:MM:SS"; el input type=time usa "HH:MM". */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export const api = {
  /** Tareas con alguna fecha o con pasos programados, y los proyectos para agruparlas. */
  gantt: async (incluirHechas: boolean): Promise<{ tasks: Task[]; projects: { id: string; nombre: string; color: PaletteColor }[] }> => {
    const [conFecha, pasos, projects] = await Promise.all([
      fetchAll<Row>((a, b) => {
        const base = sb.from('tasks').select(TASK_SELECT).or('start_date.not.is.null,deadline.not.is.null');
        const q = incluirHechas ? base : base.neq('status', 'hecha');
        return q.order('position').order('id').range(a, b);
      }),
      fetchAll<Row>((a, b) => sb.from('steps').select('task_id').not('start_date', 'is', null).order('id').range(a, b)),
      sb.from('projects').select('id, nombre, color').order('nombre'),
    ]);
    const vistas = new Set(conFecha.map((t) => t.id));
    const faltan = [...new Set(pasos.map((p) => p.task_id as string))].filter((id) => !vistas.has(id));
    let extra: Row[] = [];
    if (faltan.length) {
      const base = sb.from('tasks').select(TASK_SELECT).in('id', faltan);
      extra = must(await (incluirHechas ? base : base.neq('status', 'hecha')));
    }
    return {
      tasks: [...conFecha, ...extra].map(toTask),
      projects: must(projects).map((p) => ({ id: p.id, nombre: p.nombre, color: (p.color ?? 'azul') as PaletteColor })),
    };
  },
  /** Guarda el borrador del Gantt de una vez (aplicar_plan: todo o nada). */
  aplicarPlan: async (cambios: Cambio[]) => {
    const plan = {
      tasks: cambios.flatMap((c) => (c.tipo === 'tarea' ? [{ id: c.id, start_date: c.despues.startDate, deadline: c.despues.deadline }] : [])),
      steps: cambios.flatMap((c) =>
        c.tipo === 'paso'
          ? [{ id: c.id, start_date: c.despues.startDate, duracion_dias: c.despues.duracionDias, duracion_min: c.despues.duracionMin }]
          : [],
      ),
    };
    const { error } = await sb.rpc('aplicar_plan', { cambios: plan });
    if (error) throw new Error(error.message);
  },
  /** Programación de varios pasos a la vez, todo o nada (misma RPC que el Gantt). */
  programarPasos: async (pasos: { id: string; startDate: string | null; duracionDias: number | null; duracionMin: number | null }[]) => {
    const steps = pasos.map((p) => ({ id: p.id, start_date: p.startDate, duracion_dias: p.duracionDias, duracion_min: p.duracionMin }));
    const { error } = await sb.rpc('aplicar_plan', { cambios: { tasks: [], steps } });
    if (error) throw new Error(error.message);
  },
  today: async (): Promise<TodayPayload> => buildToday(await loadDashboard()),

  /** Mes del calendario: tareas que vencen, cruzan o empiezan en la rejilla (o tienen pasos en ella), hábitos y sus registros. */
  calendar: async (mes: string): Promise<CalendarMonth> => {
    const { start, end } = calendarGrid(mes);
    const [porDeadline, porRango, pasos, habits, logs] = await Promise.all([
      fetchAll<Row>((a, b) => sb.from('tasks').select(TASK_SELECT).gte('deadline', start).lte('deadline', end).order('position').order('id').range(a, b)),
      // tareas con inicio cuyo rango se solapa con la rejilla aunque venzan fuera (o solo tengan inicio)
      fetchAll<Row>((a, b) =>
        sb
          .from('tasks')
          .select(TASK_SELECT)
          .lte('start_date', end)
          .or(`deadline.gte.${start},and(deadline.is.null,start_date.gte.${start})`)
          .order('position')
          .order('id')
          .range(a, b),
      ),
      // pasos que empiezan hasta 1 año antes de la rejilla pueden cruzarla
      fetchAll<Row>((a, b) =>
        sb.from('steps').select('task_id').gte('start_date', addDays(start, -366)).lte('start_date', end).order('id').range(a, b),
      ),
      sb.from('habits').select(HABIT_SELECT).order('position'),
      fetchAll<Row>((a, b) =>
        sb.from('habit_logs').select('habit_id, fecha, slot').eq('done', true).gte('fecha', start).lte('fecha', end).order('fecha').order('id').range(a, b),
      ),
    ]);
    const vistas = new Set(porDeadline.map((t) => t.id));
    const cruzan = porRango.filter((t) => !vistas.has(t.id));
    for (const t of cruzan) vistas.add(t.id);
    const faltan = [...new Set(pasos.map((p) => p.task_id as string))].filter((id) => !vistas.has(id));
    const extra = faltan.length ? must(await sb.from('tasks').select(TASK_SELECT).in('id', faltan)) : [];
    return buildCalendar({
      mes,
      hoy: todayISO(),
      tasks: [...porDeadline, ...cruzan, ...extra].map(toTask),
      habits: must(habits).map(toHabitRow),
      doneLogs: logs.map((l) => ({ habitId: l.habit_id, fecha: l.fecha, slot: l.slot as HabitSlot })),
    });
  },

  // Tareas
  task: getTask,
  /** Por título (sin distinguir mayúsculas), las más recientes primero; máx. 20 */
  searchTasks: async (texto: string): Promise<Task[]> => {
    const patron = `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return must(await sb.from('tasks').select(TASK_SELECT).ilike('title', patron).order('created_at', { ascending: false }).limit(20)).map(toTask);
  },
  createTask: async (input: CreateTaskInput): Promise<Task> => {
    const { steps, habitIds, ...fields } = createTaskInput.parse(input);
    const position = positionBetween(await maxPosition('tasks'), null);
    const task = must(await sb.from('tasks').insert({ ...taskColumns(fields), position }).select('id').single());
    await vincularHabitos(task.id, habitIds, []);
    if (steps.length > 0) {
      must(
        await sb.from('steps').insert(
          steps.map((s, i) => ({
            task_id: task.id,
            title: s.title,
            start_date: s.startDate ?? null,
            duracion_dias: s.duracionDias ?? null,
            duracion_min: s.duracionMin ?? null,
            position: (i + 1) * 1000,
          })),
        ),
      );
    }
    return getTask(task.id);
  },
  /** Con `habitIds`, reemplaza los vínculos (primero, para que un cambio a «hecha» ya marque los hábitos nuevos). */
  updateTask: async (id: string, { habitIds, ...patch }: UpdateTaskInput, habitIdsAntes: string[] = []) => {
    if (habitIds) await vincularHabitos(id, habitIds, habitIdsAntes);
    const cols = taskColumns(patch);
    if (Object.keys(cols).length) must(await sb.from('tasks').update(cols).eq('id', id));
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
  step: async (id: string): Promise<{ id: string; taskId: string; title: string; done: boolean }> => {
    const s = must(await sb.from('steps').select('id, task_id, title, done').eq('id', id).single());
    return { id: s.id, taskId: s.task_id, title: s.title, done: s.done };
  },
  setStepDone: async (id: string, done: boolean) => {
    must(await sb.from('steps').update({ done }).eq('id', id));
  },
  toggleStep: async (id: string) => {
    const { done } = must(await sb.from('steps').select('done').eq('id', id).single());
    must(await sb.from('steps').update({ done: !done }).eq('id', id));
  },
  /** Sin `position`, el paso va al final. */
  addStep: async (taskId: string, input: CreateStepInput, position?: number) => {
    const step = createStepInput.parse(input);
    position ??= positionBetween(await maxPosition('steps', taskId), null);
    must(
      await sb
        .from('steps')
        .insert({
          task_id: taskId,
          title: step.title,
          start_date: step.startDate ?? null,
          duracion_dias: step.duracionDias ?? null,
          duracion_min: step.duracionMin ?? null,
          position,
        }),
    );
  },
  /** Título y/o programación del paso; solo escribe los campos definidos. */
  updateStep: async (id: string, patch: UpdateStepInput) => {
    const { title, startDate, duracionDias, duracionMin } = updateStepInput.parse(patch);
    const cols = Object.fromEntries(
      Object.entries({ title, start_date: startDate, duracion_dias: duracionDias, duracion_min: duracionMin }).filter(
        ([, v]) => v !== undefined,
      ),
    );
    must(await sb.from('steps').update(cols).eq('id', id));
  },
  /** Solo cambia el orden en que se muestra el paso. */
  moverPaso: async (id: string, position: number) => {
    must(await sb.from('steps').update({ position }).eq('id', id));
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
    must(await sb.from('habits').select('id, nombre, position, turnos, veces_semana, archived_at').order('position')).map((h) => ({
      id: h.id,
      nombre: h.nombre,
      turnos: h.turnos as HabitSlot[][],
      vecesSemana: h.veces_semana,
      position: Number(h.position),
      archivedAt: h.archived_at,
    })),
  createHabit: async (input: CreateHabitInput) => {
    const { nombre, turnos, vecesSemana } = createHabitInput.parse(input);
    const position = positionBetween(await maxPosition('habits'), null);
    must(await sb.from('habits').insert({ nombre, turnos, veces_semana: vecesSemana, position }));
  },
  updateHabit: async (id: string, patch: UpdateHabitInput) => {
    const { nombre, turnos, vecesSemana } = updateHabitInput.parse(patch);
    const cols = Object.fromEntries(Object.entries({ nombre, turnos, veces_semana: vecesSemana }).filter(([, v]) => v !== undefined));
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
  updateIdea: async (id: string, estado: Idea['estado']) => {
    must(await sb.from('ideas').update({ estado }).eq('id', id));
  },

  // Revisión semanal: reporte calculado; archivar congela una foto (upsert por semana)
  currentReview: async (): Promise<WeeklyReport> => {
    const input = await loadDashboard();
    const { start } = weekRange(todayISO(input.now));
    const archived = must(await sb.from('reviews').select('id').eq('week_start', start).not('archived_at', 'is', null));
    return buildWeeklyReport(input, archived.length > 0);
  },
  monthlyReport: async (): Promise<MonthlyReport> => buildMonthlyReport(await loadDashboard()),
  archiveReview: async (nota: string) => {
    const { weekStart, weekEnd, archived: _, ...metrics } = buildWeeklyReport(await loadDashboard(), true);
    must(
      await sb.from('reviews').upsert(
        { user_id: await userId(), week_start: weekStart, week_end: weekEnd, metrics, nota: nota || null, archived_at: new Date().toISOString() },
        { onConflict: 'user_id,week_start' },
      ),
    );
  },
  /** Jornada (tabla `jornada`; sin fila, la de por defecto). La deja fijada en @sb/shared para todo el cálculo de «hoy». */
  jornada: async (): Promise<Jornada> => {
    const { data, error } = await sb.from('jornada').select('fin_dia, hora_tarde, hora_noche').maybeSingle();
    if (error) throw new Error(error.message);
    const j = data ? { finDia: hhmm(data.fin_dia)!, horaTarde: hhmm(data.hora_tarde)!, horaNoche: hhmm(data.hora_noche)! } : JORNADA_POR_DEFECTO;
    fijarJornada(j);
    return j;
  },
  guardarJornada: async (j: Jornada) => {
    must(
      await sb
        .from('jornada')
        .upsert(
          { user_id: await userId(), fin_dia: j.finDia, hora_tarde: j.horaTarde, hora_noche: j.horaNoche, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        ),
    );
    fijarJornada(j);
  },
  // Avisos (Web Push): horas por franja y dispositivos suscritos. La Edge Function `recordatorios` envía.
  avisos: async (): Promise<{ config: AvisosConfig | null; dispositivos: Dispositivo[] }> => {
    const [config, subs] = await Promise.all([
      sb.from('recordatorios_config').select('activo, hora_manana, hora_tarde, hora_noche').maybeSingle(),
      sb.from('push_subscriptions').select('id, endpoint, user_agent, created_at').order('created_at'),
    ]);
    if (config.error) throw new Error(config.error.message);
    const c = config.data;
    return {
      config: c ? { activo: c.activo, horas: { manana: hhmm(c.hora_manana), tarde: hhmm(c.hora_tarde), noche: hhmm(c.hora_noche) } } : null,
      dispositivos: must(subs).map((s) => ({ id: s.id, endpoint: s.endpoint, userAgent: s.user_agent ?? '', createdAt: s.created_at })),
    };
  },
  /** Guarda las horas con la zona del navegador: el cron evalúa cada franja en esa zona. */
  guardarAvisos: async (c: AvisosConfig) => {
    must(
      await sb.from('recordatorios_config').upsert(
        {
          user_id: await userId(),
          activo: c.activo,
          zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
          hora_manana: c.horas.manana,
          hora_tarde: c.horas.tarde,
          hora_noche: c.horas.noche,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      ),
    );
  },
  suscribir: async (sub: PushSubscriptionJSON) => {
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys.auth) throw new Error('Suscripción incompleta');
    must(
      await sb
        .from('push_subscriptions')
        .upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: navigator.userAgent }, { onConflict: 'endpoint' }),
    );
  },
  quitarDispositivo: async (id: string) => {
    must(await sb.from('push_subscriptions').delete().eq('id', id));
  },
  quitarEndpoint: async (endpoint: string) => {
    must(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
  },
  /** Aviso de prueba a todos mis dispositivos; devuelve a cuántos llegó. */
  probarAviso: async () => {
    const { data, error } = await sb.functions.invoke<{ enviados: number }>('recordatorios', { body: { prueba: true } });
    if (error) throw new Error(error.message);
    return data?.enviados ?? 0;
  },
};
