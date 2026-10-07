-- Pasos por tiempo: en vez de un rango de días, un paso puede llevar un tiempo estimado (minutos)
-- en un solo día (duracion_dias = 1). Sin hora de inicio: los de un mismo día se encadenan en el
-- orden de la lista. Así la lógica por días (fin, fuera de plazo, calendario) no cambia.
alter table public.steps
  add column duracion_min int,
  add constraint steps_tiempo_un_dia check (duracion_min is null or (start_date is not null and duracion_dias = 1)),
  add constraint steps_tiempo_rango check (duracion_min is null or duracion_min between 1 and 1440);

-- aplicar_plan: los pasos aceptan además duracion_min (si falta la clave, no se toca).
create or replace function public.aplicar_plan(cambios jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  c jsonb;
  n int;
begin
  for c in select value from jsonb_array_elements(coalesce(cambios->'tasks', '[]'::jsonb)) loop
    update public.tasks
       set start_date = (c->>'start_date')::date, deadline = (c->>'deadline')::date
     where id = (c->>'id')::uuid;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'Tarea % no encontrada', c->>'id' using errcode = 'P0002';
    end if;
  end loop;
  for c in select value from jsonb_array_elements(coalesce(cambios->'steps', '[]'::jsonb)) loop
    update public.steps
       set start_date = (c->>'start_date')::date,
           duracion_dias = (c->>'duracion_dias')::int,
           duracion_min = case when c ? 'duracion_min' then (c->>'duracion_min')::int else duracion_min end
     where id = (c->>'id')::uuid;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'Paso % no encontrado', c->>'id' using errcode = 'P0002';
    end if;
  end loop;
end $$;

revoke all on function public.aplicar_plan(jsonb) from public, anon;
grant execute on function public.aplicar_plan(jsonb) to authenticated;
