-- 1) Hábitos semanales: `veces_semana` = meta de N días por semana (1–7). null = hábito diario por turnos.
--    Un semanal se marca como mucho una vez al día; sus `turnos` no se usan.
alter table public.habits add column veces_semana smallint check (veces_semana between 1 and 7);
-- El periodo guarda también la meta vigente: cambiarla no reescribe semanas pasadas
alter table public.habit_periods add column veces_semana smallint;

create or replace function public.habits_sync_periods() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- el cliente archiva con la hora del navegador: nunca cerrar antes de abrir
  if tg_op = 'INSERT' then
    -- greatest() ignora los NULL: sin archived_at el periodo debe quedar abierto
    insert into public.habit_periods (user_id, habit_id, desde, hasta, turnos, veces_semana)
    values (new.user_id, new.id, new.created_at,
            case when new.archived_at is null then null else greatest(new.archived_at, new.created_at) end,
            new.turnos, new.veces_semana);
  elsif old.archived_at is null and new.archived_at is not null then
    update public.habit_periods set hasta = greatest(new.archived_at, desde) where habit_id = new.id and hasta is null;
  elsif old.archived_at is not null and new.archived_at is null then
    insert into public.habit_periods (user_id, habit_id, desde, turnos, veces_semana)
    values (new.user_id, new.id, now(), new.turnos, new.veces_semana);
  elsif new.archived_at is null and (old.turnos is distinct from new.turnos or old.veces_semana is distinct from new.veces_semana) then
    -- Cambiar la programación de un hábito activo cierra el periodo y abre otro: el pasado no se reescribe
    update public.habit_periods set hasta = greatest(now(), desde) where habit_id = new.id and hasta is null;
    insert into public.habit_periods (user_id, habit_id, desde, turnos, veces_semana)
    values (new.user_id, new.id, now(), new.turnos, new.veces_semana);
  end if;
  return null;
end $$;

drop trigger habits_sync_periods on public.habits;
create trigger habits_sync_periods
  after insert or update of archived_at, turnos, veces_semana on public.habits
  for each row execute function public.habits_sync_periods();

-- 2) Tareas vinculadas a hábitos (n:m): completar la tarea o uno de sus pasos marca el hábito ese día
create table public.task_habits (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id  uuid not null references public.tasks(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  primary key (task_id, habit_id)
);
create index task_habits_habit_idx on public.task_habits (habit_id);
create index task_habits_user_idx on public.task_habits (user_id);

alter table public.task_habits enable row level security;
create policy owner_all on public.task_habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.task_habits from anon;
grant select, insert, update, delete on public.task_habits to authenticated;

-- Origen de un registro marcado por una tarea (task_id) o por uno de sus pasos (task_id + step_id).
-- Deshacer la tarea o el paso borra solo los registros que creó; los marcados a mano no se tocan.
alter table public.habit_logs
  add column task_id uuid references public.tasks(id) on delete set null,
  add column step_id uuid references public.steps(id) on delete set null;
create index habit_logs_task_idx on public.habit_logs (task_id) where task_id is not null;
create index habit_logs_step_idx on public.habit_logs (step_id) where step_id is not null;

-- Hora local del navegador: el cliente manda su zona IANA en la cabecera x-timezone (UTC si falta o no es válida).
create function public.hora_local() returns timestamp
language plpgsql stable set search_path = '' as $$
declare
  tz text := nullif(current_setting('request.headers', true), '')::json->>'x-timezone';
begin
  if tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    tz := 'UTC';
  end if;
  return now() at time zone tz;
end $$;

-- Marca hoy los hábitos vinculados a la tarea. Una tarea (con sus pasos) cuenta una vez por día y hábito.
-- Diario: el primer turno pendiente, prefiriendo el de la franja actual (misma regla que slotForHour).
-- Semanal: un registro por día, en la franja actual.
create function public.marcar_habitos_por_tarea(p_task uuid, p_step uuid) returns void
language plpgsql set search_path = '' as $$
declare
  ahora  timestamp := public.hora_local();
  hoy    date := ahora::date;
  franja text := case when extract(hour from ahora) < 12 then 'manana' when extract(hour from ahora) < 19 then 'tarde' else 'noche' end;
  h      record;
  turno  jsonb;
  v_slot text;
begin
  for h in
    select hb.id, hb.user_id, hb.turnos, hb.veces_semana
    from public.task_habits th join public.habits hb on hb.id = th.habit_id
    where th.task_id = p_task and hb.archived_at is null
  loop
    continue when exists (select 1 from public.habit_logs l where l.habit_id = h.id and l.fecha = hoy and l.done and l.task_id = p_task);
    v_slot := null;
    if h.veces_semana is not null then
      continue when exists (select 1 from public.habit_logs l where l.habit_id = h.id and l.fecha = hoy and l.done);
      v_slot := franja;
    else
      for turno in
        select t.value from jsonb_array_elements(h.turnos) with ordinality t(value, i) order by (t.value ? franja) desc, t.i
      loop
        if not exists (
          select 1 from public.habit_logs l
          where l.habit_id = h.id and l.fecha = hoy and l.done and l.slot in (select jsonb_array_elements_text(turno))
        ) then
          v_slot := case when turno ? franja then franja else turno->>0 end;
          exit;
        end if;
      end loop;
    end if;
    continue when v_slot is null;
    insert into public.habit_logs as l (user_id, habit_id, fecha, slot, done, task_id, step_id)
    values (h.user_id, h.id, hoy, v_slot, true, p_task, p_step)
    on conflict (habit_id, fecha, slot) do update
      set done = true, task_id = excluded.task_id, step_id = excluded.step_id
      where not l.done;
  end loop;
end $$;

create function public.tasks_sync_habitos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'hecha' and old.status <> 'hecha' then
    perform public.marcar_habitos_por_tarea(new.id, null);
  elsif old.status = 'hecha' and new.status <> 'hecha' then
    delete from public.habit_logs where task_id = new.id and step_id is null;
  end if;
  return null;
end $$;

create trigger tasks_sync_habitos
  after update of status on public.tasks
  for each row execute function public.tasks_sync_habitos();

create function public.steps_sync_habitos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.done and not old.done then
    perform public.marcar_habitos_por_tarea(new.task_id, new.id);
  elsif old.done and not new.done then
    delete from public.habit_logs where step_id = new.id;
  end if;
  return null;
end $$;

create trigger steps_sync_habitos
  after update of done on public.steps
  for each row execute function public.steps_sync_habitos();
