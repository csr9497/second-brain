-- Ejecutar con: supabase test db
-- Verifica el aislamiento por usuario (RLS) y las reglas de negocio en triggers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

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
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005' and hasta is null), 1,
  'el periodo de un hábito nuevo queda abierto');
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
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005'), 2,
  'reactivar conserva el periodo anterior (2 en total)');
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005' and hasta is not null), 1,
  'el periodo anterior sigue cerrado');
insert into public.habits (id, nombre, archived_at) values ('aaaaaaaa-0000-4000-8000-000000000007', 'Nace archivado', now());
select isnt((select hasta from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000007'), null,
  'un hábito creado ya archivado tiene su periodo cerrado');
-- Turnos: "y" de franjas alternativas ("o"), cada franja una sola vez
select throws_ok($$ insert into public.habits (nombre, turnos) values ('repetido', '[["manana"],["manana"]]') $$,
  '23514', null, 'turnos con una franja repetida violan el CHECK');
select throws_ok($$ insert into public.habits (nombre, turnos) values ('nulo', '[[null]]') $$,
  '23514', null, 'una franja null viola el CHECK');
select throws_ok($$ update public.habits set slot = 'tarde' where id = 'aaaaaaaa-0000-4000-8000-000000000005' $$,
  '428C9', null, 'slot es generado (primera franja) y no se escribe');
update public.habits set turnos = '[["tarde"],["noche"]]' where id = 'aaaaaaaa-0000-4000-8000-000000000005';
select is((select count(*)::int from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005'), 3,
  'cambiar los turnos de un hábito activo abre un periodo nuevo');
select is((select turnos from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000005' and hasta is null),
  '[["tarde"],["noche"]]'::jsonb, 'el periodo abierto guarda la nueva programación');
select lives_ok($$ insert into public.habit_logs (habit_id, fecha, slot) values
  ('aaaaaaaa-0000-4000-8000-000000000005', '2026-10-01', 'tarde'),
  ('aaaaaaaa-0000-4000-8000-000000000005', '2026-10-01', 'noche') $$,
  'un hábito puede tener registros en varias franjas el mismo día');
select throws_ok($$ insert into public.habit_logs (habit_id, fecha, slot) values
  ('aaaaaaaa-0000-4000-8000-000000000005', '2026-10-01', 'tarde') $$,
  '23505', null, 'un solo registro por hábito, fecha y franja');

-- Reloj del navegador atrasado: archivar "en el pasado" no debe cerrar antes de abrir
insert into public.habits (id, nombre) values ('aaaaaaaa-0000-4000-8000-000000000006', 'Hábito reloj');
update public.habits set archived_at = now() - interval '1 minute' where id = 'aaaaaaaa-0000-4000-8000-000000000006';
select is((select hasta = desde from public.habit_periods where habit_id = 'aaaaaaaa-0000-4000-8000-000000000006'), true,
  'archivar con reloj atrasado cierra el periodo sin violar el CHECK');

-- Pasos programados: fecha y días van juntos, duración ≥ 1
select throws_ok($$ update public.steps set start_date = '2026-10-06' where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  '23514', null, 'fecha de paso sin días viola el CHECK');
select throws_ok($$ update public.steps set start_date = '2026-10-06', duracion_dias = 0 where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  '23514', null, 'duración 0 viola el CHECK');
select lives_ok($$ update public.steps set start_date = '2026-10-06', duracion_dias = 2 where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  'un paso con fecha y días es válido');

-- aplicar_plan: guarda el borrador del Gantt de una vez (todo o nada)
select lives_ok($$ select public.aplicar_plan('{"tasks":[{"id":"aaaaaaaa-0000-4000-8000-000000000002","start_date":"2026-10-10","deadline":"2026-10-20"}],"steps":[{"id":"aaaaaaaa-0000-4000-8000-000000000003","start_date":"2026-10-11","duracion_dias":3}]}') $$,
  'aplicar_plan aplica tareas y pasos');
select is((select deadline from public.tasks where id = 'aaaaaaaa-0000-4000-8000-000000000002'), '2026-10-20'::date, 'la tarea quedó con el nuevo deadline');
select is((select duracion_dias from public.steps where id = 'aaaaaaaa-0000-4000-8000-000000000003'), 3, 'el paso quedó con la nueva duración');
select throws_ok($$ select public.aplicar_plan('{"tasks":[{"id":"aaaaaaaa-0000-4000-8000-000000000002","start_date":"2026-11-01","deadline":"2026-11-05"}],"steps":[{"id":"aaaaaaaa-0000-4000-8000-000000000003","start_date":"2026-11-01","duracion_dias":0}]}') $$,
  '23514', null, 'un paso inválido aborta todo el plan');
select is((select deadline from public.tasks where id = 'aaaaaaaa-0000-4000-8000-000000000002'), '2026-10-20'::date, 'tras el fallo la tarea no cambió');

-- ---------- Como B ----------
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.tasks), 0, 'B no ve las tareas de A');
select is((select count(*)::int from public.projects), 0, 'B no ve los proyectos de A');
select is((select count(*)::int from public.steps), 0, 'B no ve los pasos de A');
select is((select count(*)::int from public.habit_periods), 0, 'B no ve los periodos de A');
select throws_ok($$ select public.aplicar_plan('{"tasks":[{"id":"aaaaaaaa-0000-4000-8000-000000000002","start_date":null,"deadline":null}]}') $$,
  'P0002', null, 'B no puede aplicar un plan sobre tareas de A');

update public.tasks set title = 'hackeada' where id = 'aaaaaaaa-0000-4000-8000-000000000002';
delete from public.projects where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ---------- Anónimo ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.tasks $$, '42501', null, 'anon no tiene acceso a las tablas');
select throws_ok($$ select * from public.habit_periods $$, '42501', null, 'anon no tiene acceso a habit_periods');
select throws_ok($$ select public.aplicar_plan('{}') $$, '42501', null, 'anon no puede ejecutar aplicar_plan');

-- ---------- De vuelta como A: lo de B no tuvo efecto ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select title from public.tasks where id = 'aaaaaaaa-0000-4000-8000-000000000002'), 'Tarea A', 'B no pudo modificar la tarea de A');
select is((select count(*)::int from public.projects), 1, 'B no pudo borrar el proyecto de A');

select * from finish();
rollback;
