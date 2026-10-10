-- Ejecutar con: supabase test db
-- Día de trabajo de una tarea (tasks.minutos_dia): opcional, de 15 min a 24 h, en pasos de 15 min.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'a@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$ insert into public.tasks (title) values ('Sin día de trabajo') $$, 'minutos_dia es opcional');
select lives_ok($$ insert into public.tasks (title, minutos_dia) values ('Media jornada', 270) $$, '4 h 30 min es válido');
select throws_ok($$ insert into public.tasks (title, minutos_dia) values ('Raro', 100) $$, '23514', null, 'en pasos de 15 min');
select throws_ok($$ insert into public.tasks (title, minutos_dia) values ('Demasiado', 1455) $$, '23514', null, 'como mucho 24 h');

select * from finish();
rollback;
