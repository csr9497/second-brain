-- Ejecutar con: supabase test db
-- Jornada: RLS, CHECK jornada_valida, dia_y_franja() y su efecto en recordatorios_por_enviar().
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'a@test'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'b@test');

-- ---------- Como A ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Sin fila: 00:00 / 12:00 / 19:00
select results_eq($$ select fecha, franja from public.dia_y_franja('2026-10-09 00:30') $$,
  $$ values ('2026-10-09'::date, 'manana') $$, 'sin jornada, a las 00:30 ya es el día nuevo, de mañana');
select results_eq($$ select franja from public.dia_y_franja('2026-10-09 19:00') $$, $$ values ('noche') $$, 'sin jornada, la noche empieza a las 19:00');

select throws_ok($$ insert into public.jornada (fin_dia) values ('07:00') $$, '23514', null, 'el día no puede terminar después de las 06:00');
select throws_ok($$ insert into public.jornada (hora_tarde, hora_noche) values ('20:00', '19:00') $$, '23514', null, 'la tarde va antes que la noche');
select throws_ok($$ insert into public.jornada (hora_tarde) values ('12:10') $$, '23514', null, 'horas en pasos de 15 min');

insert into public.jornada (fin_dia, hora_tarde, hora_noche) values ('03:00', '13:30', '20:00');
select is((select user_id from public.jornada), '11111111-1111-4111-8111-111111111111'::uuid, 'jornada se rellena con auth.uid()');

select results_eq($$ select fecha, franja from public.dia_y_franja('2026-10-10 01:30') $$,
  $$ values ('2026-10-09'::date, 'noche') $$, 'a las 01:30 sigue siendo la noche del día anterior');
select results_eq($$ select fecha, franja from public.dia_y_franja('2026-10-10 03:00') $$,
  $$ values ('2026-10-10'::date, 'manana') $$, 'a las 03:00 empieza la mañana del día nuevo');
select results_eq($$ select franja from public.dia_y_franja('2026-10-10 13:29') $$, $$ values ('manana') $$, 'mañana hasta hora_tarde');
select results_eq($$ select franja from public.dia_y_franja('2026-10-10 13:30') $$, $$ values ('tarde') $$, 'tarde desde hora_tarde');

-- Para recordatorios: un hábito de noche y aviso de noche a las 23:30 (UTC para no mezclar zonas)
insert into public.habits (id, nombre, turnos) values ('cccccccc-0000-4000-8000-000000000001', 'Leer', '[["noche"]]');
insert into public.recordatorios_config (zona, hora_noche) values ('UTC', '23:30');

-- ---------- Como B: no ve ni toca la jornada de A ----------
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.jornada), 0, 'B no ve la jornada de A');
select results_eq($$ select fecha from public.dia_y_franja('2026-10-10 01:30') $$, $$ values ('2026-10-10'::date) $$,
  'dia_y_franja usa la jornada de quien llama');

-- ---------- Cron (sin RLS) ----------
reset role;
update public.habit_periods set desde = '2026-10-01 00:00+00' where habit_id = 'cccccccc-0000-4000-8000-000000000001';

select results_eq(
  $$ select fecha, franja, habitos from public.recordatorios_por_enviar('2026-10-10 01:00+00') $$,
  $$ values ('2026-10-09'::date, 'noche', array['Leer']::text[]) $$,
  'a la 01:00 el aviso de noche de las 23:30 sigue siendo del día anterior y se envía');

update public.jornada set fin_dia = '00:00' where user_id = '11111111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.recordatorios_por_enviar('2026-10-10 01:00+00')), 0,
  'con el día terminando a medianoche, a la 01:00 aún no toca ningún aviso');

select * from finish();
rollback;
