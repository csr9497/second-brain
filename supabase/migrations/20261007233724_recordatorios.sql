-- Fase 5: avisos Web Push. Suscripciones por dispositivo, hora por franja y registro de lo enviado.
-- La Edge Function `recordatorios` (la llama pg_cron cada 15 min) pide a recordatorios_por_enviar() qué avisar.

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Una fila por usuario. zona: IANA, la escribe el navegador al guardar. Hora null = sin aviso en esa franja
create table public.recordatorios_config (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  activo      boolean not null default true,
  zona        text not null,
  hora_manana time,
  hora_tarde  time,
  hora_noche  time,
  updated_at  timestamptz not null default now()
);

-- Evita repetir un aviso: una fila por (usuario, día local, franja)
create table public.recordatorios_enviados (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha      date not null,
  franja     text not null check (franja in ('manana','tarde','noche')),
  enviado_at timestamptz not null default now(),
  primary key (user_id, fecha, franja)
);

alter table public.push_subscriptions enable row level security;
create policy owner_all on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

alter table public.recordatorios_config enable row level security;
create policy owner_all on public.recordatorios_config for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.recordatorios_config from anon;
grant select, insert, update, delete on public.recordatorios_config to authenticated;

alter table public.recordatorios_enviados enable row level security;
create policy owner_all on public.recordatorios_enviados for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.recordatorios_enviados from anon;
grant select, insert, update, delete on public.recordatorios_enviados to authenticated;

-- Franjas cuya hora ya pasó hoy (en la zona del usuario) y que aún no se avisaron, con los hábitos
-- diarios que siguen sin marcar en esa franja. Devuelve también las vencidas sin pendientes (habitos
-- vacío) para que la función las anote y no las vuelva a evaluar.
-- Vigencia como periodoEn() de @sb/shared: el periodo que cubre el día local; si varios, el más reciente.
-- Un turno «o» (p. ej. ["tarde","noche"]) cuenta como hecho si tiene un registro en cualquiera de sus franjas.
create function public.recordatorios_por_enviar(p_ahora timestamptz default now())
returns table (user_id uuid, fecha date, franja text, habitos text[])
language sql stable security definer set search_path = '' as $$
  with vencidas as (
    select c.user_id, c.zona, (p_ahora at time zone c.zona)::date as fecha, f.franja
    from public.recordatorios_config c
    join pg_catalog.pg_timezone_names tz on tz.name = c.zona   -- una zona inválida no rompe la ronda
    cross join lateral (values ('manana', c.hora_manana), ('tarde', c.hora_tarde), ('noche', c.hora_noche)) f(franja, hora)
    where c.activo
      and f.hora is not null
      and f.hora <= (p_ahora at time zone c.zona)::time
      and not exists (
        select 1 from public.recordatorios_enviados e
        where e.user_id = c.user_id and e.fecha = (p_ahora at time zone c.zona)::date and e.franja = f.franja)
  ),
  periodos as (
    select distinct on (p.habit_id, v.franja) v.user_id, v.fecha, v.franja, p.habit_id, p.turnos, p.veces_semana
    from vencidas v
    join public.habit_periods p on p.user_id = v.user_id
      and (p.desde at time zone v.zona)::date <= v.fecha
      and (p.hasta is null or (p.hasta at time zone v.zona)::date > v.fecha)
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
revoke execute on function public.recordatorios_por_enviar(timestamptz) from public, anon, authenticated;
grant execute on function public.recordatorios_por_enviar(timestamptz) to service_role;

-- Cron: cada 15 min llama a la Edge Function. La URL y el secreto viven en Vault (uno por proyecto,
-- ver docs/ALERTAS.md). Sin ellos (local recién creado, tests) el job no hace nada.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('recordatorios', '*/15 * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'recordatorios_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
  where exists (select 1 from vault.decrypted_secrets where name = 'recordatorios_url');
$cron$);
