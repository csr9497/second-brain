-- Hábitos en varias franjas: `turnos` es una lista de turnos ("y") de franjas alternativas ("o"),
-- p. ej. [["manana"],["tarde","noche"]] = Mañana + (Tarde o Noche). Cada franja aparece una sola vez.
-- Debe coincidir con `turnosSchema` de packages/shared.
create function public.turnos_validos(t jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  turno jsonb;
  franja text;
  vistas text[] := '{}';
begin
  if t is null or jsonb_typeof(t) <> 'array' or jsonb_array_length(t) not between 1 and 3 then
    return false;
  end if;
  for turno in select value from jsonb_array_elements(t) loop
    if jsonb_typeof(turno) <> 'array' or jsonb_array_length(turno) = 0 then
      return false;
    end if;
    for franja in select value from jsonb_array_elements_text(turno) loop
      if franja not in ('manana', 'tarde', 'noche') or franja = any (vistas) then
        return false;
      end if;
      vistas := vistas || franja;
    end loop;
  end loop;
  return true;
end $$;

-- habits: turnos sustituye a slot; slot queda generado (primera franja) para el frontend publicado
alter table public.habits add column turnos jsonb;
update public.habits set turnos = jsonb_build_array(jsonb_build_array(slot));
alter table public.habits
  alter column turnos set not null,
  alter column turnos set default '[["manana"]]',
  add constraint habits_turnos_validos check (public.turnos_validos(turnos));
alter table public.habits drop column slot;
alter table public.habits add column slot text generated always as (turnos->0->>0) stored;

-- habit_periods: cada periodo guarda la programación vigente
alter table public.habit_periods add column turnos jsonb;
update public.habit_periods p set turnos = h.turnos from public.habits h where h.id = p.habit_id;
alter table public.habit_periods alter column turnos set not null;

create or replace function public.habits_sync_periods() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- el cliente archiva con la hora del navegador: nunca cerrar antes de abrir
  if tg_op = 'INSERT' then
    -- greatest() ignora los NULL: sin archived_at el periodo debe quedar abierto
    insert into public.habit_periods (user_id, habit_id, desde, hasta, turnos)
    values (new.user_id, new.id, new.created_at,
            case when new.archived_at is null then null else greatest(new.archived_at, new.created_at) end,
            new.turnos);
  elsif old.archived_at is null and new.archived_at is not null then
    update public.habit_periods set hasta = greatest(new.archived_at, desde) where habit_id = new.id and hasta is null;
  elsif old.archived_at is not null and new.archived_at is null then
    insert into public.habit_periods (user_id, habit_id, desde, turnos) values (new.user_id, new.id, now(), new.turnos);
  elsif new.archived_at is null and old.turnos is distinct from new.turnos then
    -- Cambiar las franjas de un hábito activo cierra el periodo y abre otro: el pasado no se reescribe
    update public.habit_periods set hasta = greatest(now(), desde) where habit_id = new.id and hasta is null;
    insert into public.habit_periods (user_id, habit_id, desde, turnos) values (new.user_id, new.id, now(), new.turnos);
  end if;
  return null;
end $$;

drop trigger habits_sync_periods on public.habits;
create trigger habits_sync_periods
  after insert or update of archived_at, turnos on public.habits
  for each row execute function public.habits_sync_periods();

-- habit_logs: franja en que se hizo; un registro por (hábito, fecha, franja)
alter table public.habit_logs add column slot text;
update public.habit_logs l set slot = h.slot from public.habits h where h.id = l.habit_id;
alter table public.habit_logs
  alter column slot set not null,
  add constraint habit_logs_slot_check check (slot in ('manana', 'tarde', 'noche'));
alter table public.habit_logs drop constraint habit_logs_habit_id_fecha_key;
alter table public.habit_logs add constraint habit_logs_habit_fecha_slot_key unique (habit_id, fecha, slot);
