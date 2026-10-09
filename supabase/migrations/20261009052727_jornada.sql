-- Jornada: horas en que empiezan la tarde y la noche, y hora a la que termina el día (fin_dia).
-- Entre las 00:00 y fin_dia todavía es el día anterior, en su franja noche; la mañana empieza en fin_dia.
-- Una fila por usuario; sin fila valen los valores por defecto (00:00, 12:00, 19:00).
-- Misma regla que diaDe()/franjaDe() de @sb/shared (domain/dates.ts) y que jornadaSchema.
create table public.jornada (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  fin_dia    time not null default '00:00',
  hora_tarde time not null default '12:00',
  hora_noche time not null default '19:00',
  updated_at timestamptz not null default now(),
  constraint jornada_valida check (
    fin_dia <= '06:00' and fin_dia < hora_tarde and hora_tarde < hora_noche
    -- en pasos de 15 min, como el resto de horas de la app
    and extract(epoch from fin_dia)::int % 900 = 0
    and extract(epoch from hora_tarde)::int % 900 = 0
    and extract(epoch from hora_noche)::int % 900 = 0
  )
);

alter table public.jornada enable row level security;
create policy owner_all on public.jornada for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.jornada from anon;
grant select, insert, update, delete on public.jornada to authenticated;

-- Día y franja de una hora local según la jornada del usuario. Se desplaza la hora fin_dia hacia atrás
-- y se compara en ese marco: así la noche que pasa de medianoche sigue en el mismo día.
-- security invoker: en los triggers corre como el usuario (RLS); recordatorios_por_enviar pasa p_user.
create function public.dia_y_franja(p_local timestamp, p_user uuid default auth.uid())
returns table (fecha date, franja text)
language sql stable set search_path = '' as $$
  with j as (
    select coalesce(max(jo.fin_dia), '00:00') - time '00:00' as fin,
           coalesce(max(jo.hora_tarde), '12:00') as tarde,
           coalesce(max(jo.hora_noche), '19:00') as noche
    from public.jornada jo where jo.user_id = p_user
  )
  select (p_local - j.fin)::date,
         case when (p_local - j.fin)::time < j.tarde - j.fin then 'manana'
              when (p_local - j.fin)::time < j.noche - j.fin then 'tarde'
              else 'noche' end
  from j
$$;
revoke execute on function public.dia_y_franja(timestamp, uuid) from public, anon;
grant execute on function public.dia_y_franja(timestamp, uuid) to authenticated, service_role;

-- Igual que antes, pero el día y la franja salen de la jornada (dia_y_franja) y no de la medianoche y 12/19 h.
create or replace function public.marcar_habitos_por_tarea(p_task uuid, p_step uuid) returns void
language plpgsql set search_path = '' as $$
declare
  hoy    date;
  franja text;
  h      record;
  turno  jsonb;
  v_slot text;
begin
  select d.fecha, d.franja into hoy, franja from public.dia_y_franja(public.hora_local()) d;
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

-- Igual que antes, pero en el marco de la jornada: el día es el de dia_y_franja y la hora de cada aviso se
-- compara desplazada fin_dia hacia atrás (time - interval da la vuelta al reloj), igual que la hora actual.
create or replace function public.recordatorios_por_enviar(p_ahora timestamptz default now())
returns table (user_id uuid, fecha date, franja text, habitos text[])
language sql stable security definer set search_path = '' as $$
  with
  -- Una zona inválida no debe romper la ronda de todos: se descarta antes de evaluar `at time zone`
  -- (materialized impide que el planificador lo evalúe antes del filtro)
  configs as materialized (
    select c.user_id, c.zona, j.fin, (p_ahora at time zone c.zona) - j.fin as logico, c.hora_manana, c.hora_tarde, c.hora_noche
    from (
      select * from public.recordatorios_config c
      where c.activo and exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = c.zona)
      offset 0
    ) c
    cross join lateral (
      select coalesce(max(jo.fin_dia), '00:00') - time '00:00' as fin from public.jornada jo where jo.user_id = c.user_id
    ) j
  ),
  vencidas as (
    select c.user_id, c.zona, c.fin, c.logico::date as fecha, f.franja
    from configs c
    cross join lateral (values ('manana', c.hora_manana), ('tarde', c.hora_tarde), ('noche', c.hora_noche)) f(franja, hora)
    where f.hora is not null
      and f.hora - c.fin <= c.logico::time
      and not exists (
        select 1 from public.recordatorios_enviados e
        where e.user_id = c.user_id and e.fecha = c.logico::date and e.franja = f.franja)
  ),
  periodos as (
    select distinct on (p.habit_id, v.franja) v.user_id, v.fecha, v.franja, p.habit_id, p.turnos, p.veces_semana
    from vencidas v
    join public.habit_periods p on p.user_id = v.user_id
      and ((p.desde at time zone v.zona) - v.fin)::date <= v.fecha
      and (p.hasta is null or ((p.hasta at time zone v.zona) - v.fin)::date > v.fecha)
    order by p.habit_id, v.franja, p.desde desc
  ),
  pendientes as (
    -- los semanales (veces_semana) no tienen recordatorio
    select pe.user_id, pe.fecha, pe.franja, h.nombre
    from periodos pe
    join public.habits h on h.id = pe.habit_id
    cross join lateral jsonb_array_elements(pe.turnos) t(turno)
    where pe.veces_semana is null
      and t.turno ? pe.franja
      and not exists (
        select 1 from public.habit_logs l
        where l.habit_id = pe.habit_id and l.fecha = pe.fecha and l.done and t.turno ? l.slot)
  )
  select v.user_id, v.fecha, v.franja,
         coalesce(array_agg(distinct p.nombre order by p.nombre) filter (where p.nombre is not null), '{}')
  from vencidas v
  left join pendientes p on p.user_id = v.user_id and p.fecha = v.fecha and p.franja = v.franja
  group by v.user_id, v.fecha, v.franja;
$$;
