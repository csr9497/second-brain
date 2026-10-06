-- Guarda el borrador del Gantt en una sola transacción (todo o nada).
-- cambios = {"tasks":[{"id","start_date","deadline"}], "steps":[{"id","start_date","duracion_dias"}]}
-- SECURITY INVOKER: la RLS limita a las filas del usuario; una fila ajena o inexistente aborta el plan.
create function public.aplicar_plan(cambios jsonb) returns void
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
       set start_date = (c->>'start_date')::date, duracion_dias = (c->>'duracion_dias')::int
     where id = (c->>'id')::uuid;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'Paso % no encontrado', c->>'id' using errcode = 'P0002';
    end if;
  end loop;
end $$;

revoke all on function public.aplicar_plan(jsonb) from public, anon;
grant execute on function public.aplicar_plan(jsonb) to authenticated;
