-- Ejecutar con: supabase test db
-- Verifica el aislamiento por usuario (RLS) y las reglas de negocio en triggers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Dos usuarios: A (dueño de los datos) y B (intruso)
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'a@test'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'b@test');

-- ---------- Como A ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

insert into public.projects (id, nombre) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Proyecto A');
insert into public.tasks (id, title, project_id) values ('aaaaaaaa-0000-4000-8000-000000000002', 'Tarea A', 'aaaaaaaa-0000-4000-8000-000000000001');
insert into public.steps (id, task_id, title) values
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 'paso 1'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002', 'paso 2');

select is((select user_id from public.tasks where title = 'Tarea A'), '11111111-1111-4111-8111-111111111111'::uuid,
  'user_id se rellena con auth.uid()');

-- Trigger: pasos → tarea
update public.steps set done = true where id = 'aaaaaaaa-0000-4000-8000-000000000003';
select is((select status from public.tasks where title = 'Tarea A'), 'por_hacer', 'con un paso pendiente la tarea sigue por hacer');
update public.steps set done = true where id = 'aaaaaaaa-0000-4000-8000-000000000004';
select is((select status from public.tasks where title = 'Tarea A'), 'hecha', 'todos los pasos hechos → tarea hecha');
select isnt((select completed_at from public.tasks where title = 'Tarea A'), null, 'completed_at se rellena al quedar hecha');
update public.steps set done = false where id = 'aaaaaaaa-0000-4000-8000-000000000004';
select is((select status from public.tasks where title = 'Tarea A'), 'por_hacer', 'desmarcar un paso → vuelve a por hacer');
select is((select completed_at from public.tasks where title = 'Tarea A'), null, 'completed_at se limpia');

select throws_ok(
  $$ insert into public.tasks (title, user_id) values ('suplantación', '22222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'no se pueden crear filas a nombre de otro usuario');

-- Color de proyecto: paleta fija con default
select is((select color from public.projects where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'azul',
  'un proyecto sin color queda en azul');
select throws_ok(
  $$ insert into public.projects (nombre, color) values ('Proyecto fucsia', 'fucsia') $$,
  '23514', null, 'color fuera de la paleta viola el CHECK');

-- Hábitos: active se deriva de archived_at
insert into public.habits (id, nombre) values ('aaaaaaaa-0000-4000-8000-000000000005', 'Hábito A');
select ok((select active and created_at is not null from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000005'),
  'un hábito nuevo nace activo y con created_at');
update public.habits set archived_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000005';
select is((select active from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000005'), false,
  'con archived_at el hábito queda inactivo');
select throws_ok(
  $$ update public.habits set active = true where id = 'aaaaaaaa-0000-4000-8000-000000000005' $$,
  '428C9', null, 'active no se escribe a mano (columna generada)');

-- Periodos de vigencia (triggers sobre habits)
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005'), 1,
  'crear el hábito abre un periodo');
select isnt((select hasta from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005'), null,
  'archivar cierra el periodo');
update public.habits set archived_at = null where id = 'aaaaaaaa-0000-4000-8000-000000000005';
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005' and hasta is null), 1,
  'reactivar abre un periodo nuevo');

-- ---------- Como B ----------
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.tasks), 0, 'B no ve las tareas de A');
select is((select count(*)::int from public.projects), 0, 'B no ve los proyectos de A');
select is((select count(*)::int from public.steps), 0, 'B no ve los pasos de A');
select is((select count(*)::int from public.habit_periods), 0, 'B no ve los periodos de A');

update public.tasks set title = 'hackeada' where id = 'aaaaaaaa-0000-4000-8000-000000000002';
delete from public.projects where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ---------- Anónimo ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.tasks $$, '42501', null, 'anon no tiene acceso a las tablas');
select throws_ok($$ select * from public.habit_periods $$, '42501', null, 'anon no tiene acceso a habit_periods');

-- ---------- De vuelta como A: lo de B no tuvo efecto ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select title from public.tasks where id = 'aaaaaaaa-0000-4000-8000-000000000002'), 'Tarea A', 'B no pudo modificar la tarea de A');
select is((select count(*)::int from public.projects), 1, 'B no pudo borrar el proyecto de A');

select * from finish();
rollback;
