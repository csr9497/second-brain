-- Ejecutar con: supabase test db
-- Avisos (Fase 5): RLS de las tablas de avisos y recordatorios_por_enviar().
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'a@test'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'b@test');

-- ---------- Como A: hábitos, registros y configuración ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

insert into public.habits (id, nombre, turnos) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Agua', '[["manana"],["tarde","noche"]]'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Leer', '[["tarde"]]'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'Archivado', '[["tarde"]]');
insert into public.habits (id, nombre, turnos, veces_semana) values
  ('bbbbbbbb-0000-4000-8000-000000000003', 'Gym', '[["tarde"]]', 3);
-- Agua: el turno «Tarde o Noche» del 7 ya se hizo de noche
insert into public.habit_logs (habit_id, fecha, slot) values ('bbbbbbbb-0000-4000-8000-000000000001', '2026-10-07', 'noche');
insert into public.recordatorios_config (zona, hora_manana, hora_tarde, hora_noche) values ('America/Lima', '11:00', '17:00', '21:30');
insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/a', 'p256', 'auth');

select is((select user_id from public.recordatorios_config), '11111111-1111-4111-8111-111111111111'::uuid,
  'recordatorios_config se rellena con auth.uid()');
select throws_ok($$ select * from public.recordatorios_por_enviar() $$, '42501', null,
  'authenticated no puede ejecutar recordatorios_por_enviar');

-- ---------- Como B: no ve nada de A ----------
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.push_subscriptions), 0, 'B no ve las suscripciones de A');
select is((select count(*)::int from public.recordatorios_config), 0, 'B no ve la configuración de A');
select throws_ok(
  $$ insert into public.push_subscriptions (endpoint, p256dh, auth, user_id) values ('https://push.example/b', 'p', 'x', '11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'B no puede suscribir dispositivos a nombre de A');

-- ---------- Anónimo ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.push_subscriptions $$, '42501', null, 'anon no tiene acceso a push_subscriptions');
select throws_ok($$ select * from public.recordatorios_enviados $$, '42501', null, 'anon no tiene acceso a recordatorios_enviados');

-- ---------- Como el servicio: vigencias fijas para no depender de now() ----------
reset role;
update public.habit_periods set desde = '2026-10-01 12:00+00' where habit_id::text like 'bbbbbbbb-%';
-- «Archivado» dejó de estar vigente el 5
update public.habit_periods set hasta = '2026-10-05 12:00+00' where habit_id = 'bbbbbbbb-0000-4000-8000-000000000004';

-- 2026-10-08 02:00 UTC = 7 oct, 21:00 en Lima
select results_eq(
  $$ select franja, fecha from public.recordatorios_por_enviar('2026-10-08 02:00+00') order by franja $$,
  $$ values ('manana'::text, '2026-10-07'::date), ('tarde', '2026-10-07') $$,
  'a las 21:00 de Lima vencieron mañana y tarde, con el día local (no el UTC)');
select is((select habitos from public.recordatorios_por_enviar('2026-10-08 02:00+00') where franja = 'tarde'), array['Leer']::text[],
  'tarde: falta Leer; Agua hizo su turno de noche y Gym (semanal) y Archivado no cuentan');
select is((select habitos from public.recordatorios_por_enviar('2026-10-08 02:00+00') where franja = 'manana'), array['Agua']::text[],
  'mañana: falta Agua');
select is((select habitos from public.recordatorios_por_enviar('2026-10-08 02:45+00') where franja = 'noche'), '{}'::text[],
  'una franja vencida sin pendientes sale con la lista vacía');
select is((select habitos from public.recordatorios_por_enviar('2026-10-08 16:30+00') where franja = 'manana' and fecha = '2026-10-08'), array['Agua']::text[],
  'al día siguiente (11:30 en Lima) vuelve a faltar Agua');

insert into public.recordatorios_enviados (user_id, fecha, franja) values ('11111111-1111-4111-8111-111111111111', '2026-10-07', 'tarde');
select is((select count(*)::int from public.recordatorios_por_enviar('2026-10-08 02:00+00') where franja = 'tarde'), 0,
  'una franja ya avisada no se repite');

update public.recordatorios_config set hora_manana = null;
select is((select count(*)::int from public.recordatorios_por_enviar('2026-10-08 02:00+00') where franja = 'manana'), 0,
  'una franja sin hora no avisa');

update public.recordatorios_config set activo = false;
select is((select count(*)::int from public.recordatorios_por_enviar('2026-10-08 02:00+00')), 0,
  'con los avisos desactivados no sale nada');

select * from finish();
rollback;
