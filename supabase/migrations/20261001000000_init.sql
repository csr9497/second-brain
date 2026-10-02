-- Second Brain — esquema inicial para Supabase.
-- Cada tabla lleva user_id (por defecto auth.uid()) y RLS: cada usuario solo ve y
-- modifica sus filas. La anon key es pública, así que RLS es la única barrera:
-- toda tabla nueva DEBE tener RLS activado y su política de dueño.

-- ---------- Tablas ----------

create table public.areas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  tipo       text,                       -- Vida | Trabajo | Salud | Aprendizaje | Finanzas | Sistema
  created_at timestamptz not null default now()
);

create table public.goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id    uuid references public.areas(id) on delete set null,
  nombre     text not null,
  horizonte  date,
  porque     text,
  estado     text not null default 'activa',   -- activa | lograda | pausada
  created_at timestamptz not null default now()
);

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id          uuid references public.areas(id) on delete set null,
  goal_id          uuid references public.goals(id) on delete set null,
  nombre           text not null,
  estado           text not null default 'en_curso'
                   check (estado in ('idea','en_curso','en_pausa','completado','archivado')),
  prioridad        text not null default 'media' check (prioridad in ('alta','media','baja')),
  next_action      text,
  schedule_days    jsonb not null default '[]',          -- [1,3,6] (0 = domingo)
  total_progress   int  not null default 0 check (total_progress between 0 and 100),
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null,
  area_id      uuid references public.areas(id) on delete set null,
  title        text not null check (length(trim(title)) > 0),
  description  text,
  type         text,                                  -- Estudio | Trabajo | Tesis | Personal | Revisión
  priority     text not null default 'media' check (priority in ('alta','media','baja')),
  status       text not null default 'por_hacer' check (status in ('por_hacer','en_curso','hecha')),
  start_date   date,
  deadline     date,
  position     numeric not null default 1000,         -- orden manual (punto medio entre vecinos)
  notes        text,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index tasks_user_status_deadline_idx on public.tasks (user_id, status, deadline);
create index tasks_project_idx on public.tasks (project_id);

create table public.steps (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id  uuid not null references public.tasks(id) on delete cascade,
  title    text not null check (length(trim(title)) > 0),
  done     boolean not null default false,
  position numeric not null default 1000
);
create index steps_task_idx on public.steps (task_id);

create table public.habits (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre   text not null,
  slot     text not null default 'manana' check (slot in ('manana','tarde','noche')),
  active   boolean not null default true,
  position numeric not null default 1000
);

create table public.habit_logs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  fecha    date not null,
  done     boolean not null default true,
  unique (habit_id, fecha)
);
create index habit_logs_user_fecha_idx on public.habit_logs (user_id, fecha);

create table public.ideas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto      text not null,
  estado     text not null default 'inbox' check (estado in ('inbox','procesada','archivada')),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start  date not null,
  week_end    date not null,
  metrics     jsonb not null default '{}',   -- {habitsPct, tasksDone, tasksTotal, overdue, perProject, untouched, streak}
  nota        text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------- Seguridad: RLS de dueño en todas las tablas ----------

do $$
declare t text;
begin
  foreach t in array array['areas','goals','projects','tasks','steps','habits','habit_logs','ideas','reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create index %I on public.%I (user_id)', t || '_user_idx', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Reglas de negocio en la base ----------
-- Funciones SECURITY INVOKER (por defecto): corren con los permisos y el RLS del usuario.

-- completed_at solo existe cuando la tarea está 'hecha'.
create function public.tasks_set_completed_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'hecha' then
    if tg_op = 'INSERT' or old.status is distinct from 'hecha' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger tasks_completed_at
  before insert or update of status on public.tasks
  for each row execute function public.tasks_set_completed_at();

-- Tocar una tarea marca actividad en su proyecto ("proyectos sin tocar" de la revisión).
create function public.tasks_touch_project() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.project_id is not null then
    update public.projects set last_activity_at = now() where id = new.project_id;
  end if;
  return new;
end $$;

create trigger tasks_touch_project
  after insert or update on public.tasks
  for each row execute function public.tasks_touch_project();

-- Pasos ↔ tarea: si todos los pasos quedan hechos, la tarea pasa a 'hecha';
-- si una tarea hecha deja de tenerlos todos, vuelve a 'por_hacer'.
create function public.steps_sync_task() returns trigger
language plpgsql set search_path = '' as $$
declare
  tid uuid := coalesce(new.task_id, old.task_id);
  total int;
  pending int;
begin
  select count(*), count(*) filter (where not done) into total, pending
  from public.steps where task_id = tid;

  if total = 0 then
    return null;
  elsif pending = 0 then
    update public.tasks set status = 'hecha' where id = tid and status <> 'hecha';
  else
    update public.tasks set status = 'por_hacer' where id = tid and status = 'hecha';
  end if;
  return null;
end $$;

create trigger steps_sync_task
  after insert or update of done or delete on public.steps
  for each row execute function public.steps_sync_task();
