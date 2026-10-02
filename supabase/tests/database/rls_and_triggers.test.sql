-- Ejecutar con: supabase test db
-- Verifica el aislamiento por usuario (RLS) y las reglas de negocio en triggers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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

-- ---------- Como B ----------
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.tasks), 0, 'B no ve las tareas de A');
select is((select count(*)::int from public.projects), 0, 'B no ve los proyectos de A');
select is((select count(*)::int from public.steps), 0, 'B no ve los pasos de A');

update public.tasks set title = 'hackeada' where id = 'aaaaaaaa-0000-4000-8000-000000000002';
delete from public.projects where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ---------- Anónimo ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.tasks $$, '42501', null, 'anon no tiene acceso a las tablas');

-- ---------- De vuelta como A: lo de B no tuvo efecto ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select title from public.tasks where id = 'aaaaaaaa-0000-4000-8000-000000000002'), 'Tarea A', 'B no pudo modificar la tarea de A');
select is((select count(*)::int from public.projects), 1, 'B no pudo borrar el proyecto de A');

select * from finish();
rollback;
