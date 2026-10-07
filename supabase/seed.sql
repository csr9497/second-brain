-- Datos de demo SOLO para el entorno local (supabase start / supabase db reset).
-- `supabase db push` no ejecuta este archivo.
-- Usuario local: dev@local.test / devpassword

do $$
declare
  uid uuid := '00000000-0000-4000-8000-000000000001';
  -- La app calcula "hoy" con la hora del navegador; la DB está en UTC. Para que la
  -- demo cuadre, usamos la zona del desarrollador (cámbiala si no es la tuya).
  today date := (now() at time zone 'America/Lima')::date;
  dow int := extract(dow from (now() at time zone 'America/Lima'))::int;  -- 0 = domingo
  p_ntt uuid; p_devops uuid; p_tesis uuid;
  t_aws uuid; t_alcance uuid; t_math uuid; h_ingles uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'dev@local.test', extensions.crypt('devpassword', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, 'email',
          jsonb_build_object('sub', uid::text, 'email', 'dev@local.test', 'email_verified', true), now(), now(), now());

  -- Hábitos creados hace 10 días (uno con dos turnos: Mañana + (Tarde o Noche)) + 5 días previos completos
  insert into public.habits (user_id, nombre, turnos, position, created_at) values
    (uid, 'Ejercicio', '[["manana"]]', 1000, now() - interval '10 days'), (uid, 'Inglés', '[["manana"]]', 2000, now() - interval '10 days'),
    (uid, 'Estudiar', '[["tarde"]]', 3000, now() - interval '10 days'), (uid, 'Leer', '[["tarde"]]', 4000, now() - interval '10 days'),
    (uid, 'Revisar pendientes', '[["noche"]]', 5000, now() - interval '10 days'), (uid, 'Planear mañana', '[["noche"]]', 6000, now() - interval '10 days'),
    (uid, 'Tomar agua (2 L)', '[["manana"],["tarde","noche"]]', 7000, now() - interval '10 days');
  -- un registro por turno (en su primera franja) en cada uno de los 5 días previos
  insert into public.habit_logs (user_id, habit_id, fecha, done, slot)
    select uid, h.id, today - d, true, t->>0
    from public.habits h, jsonb_array_elements(h.turnos) t, generate_series(1, 5) d
    where h.user_id = uid;
  -- Hábito semanal (5 días por semana, sin turnos ni racha): hecho ayer y anteayer
  insert into public.habits (user_id, nombre, veces_semana, position, created_at)
    values (uid, 'Inglés — práctica 1 h', 5, 8000, now() - interval '10 days') returning id into h_ingles;
  insert into public.habit_logs (user_id, habit_id, fecha, done, slot)
    values (uid, h_ingles, today - 1, true, 'tarde'), (uid, h_ingles, today - 2, true, 'noche');

  -- Proyectos: dos "tocan hoy", uno no
  insert into public.projects (user_id, nombre, next_action, schedule_days, total_progress, prioridad, color)
    values (uid, 'Preparación rol Node.js (NTT)', 'Repasar AWS serverless', jsonb_build_array(dow, (dow + 2) % 7), 40, 'alta', 'azul')
    returning id into p_ntt;
  insert into public.projects (user_id, nombre, next_action, schedule_days, total_progress, color)
    values (uid, 'Roadmap DevOps → MLOps', 'Módulo Docker/K8s', jsonb_build_array(dow, (dow + 3) % 7), 15, 'cian')
    returning id into p_devops;
  insert into public.projects (user_id, nombre, next_action, schedule_days, total_progress, color)
    values (uid, 'Tesis — definir tema', 'Validar dirección GNN con el asesor', jsonb_build_array((dow + 1) % 7), 20, 'violeta')
    returning id into p_tesis;

  insert into public.tasks (user_id, title, priority, type, project_id, deadline, position)
    values (uid, 'Repasar AWS serverless', 'alta', 'Trabajo', p_ntt, today, 1000) returning id into t_aws;
  -- Pasos por tiempo el mismo día (encadenados en el orden de la lista) y uno sin programar
  insert into public.steps (user_id, task_id, title, position, start_date, duracion_dias, duracion_min) values
    (uid, t_aws, 'Lambda', 1000, today, 1, 60), (uid, t_aws, 'API Gateway', 2000, today, 1, 90),
    (uid, t_aws, 'DynamoDB', 3000, null, null, null);
  insert into public.tasks (user_id, title, priority, type, project_id, deadline, position)
    values (uid, 'Avanzar módulo Docker/K8s', 'alta', 'Estudio', p_devops, today, 2000);
  insert into public.tasks (user_id, title, type, project_id, deadline, position)
    values (uid, 'Escribir alcance de tesis', 'Tesis', p_tesis, today + 3, 3000) returning id into t_alcance;
  insert into public.steps (user_id, task_id, title, done, position) values
    (uid, t_alcance, 'Definir objetivos', true, 1000), (uid, t_alcance, 'Delimitar alcance', false, 2000),
    (uid, t_alcance, 'Bosquejar cronograma', false, 3000);
  insert into public.tasks (user_id, title, type, deadline, position)
    values (uid, 'Leer 20 págs. Math for ML', 'Estudio', today + 2, 4000) returning id into t_math;
  -- Completarla marca Estudiar y Leer ese día
  insert into public.task_habits (user_id, task_id, habit_id)
    select uid, t_math, id from public.habits where user_id = uid and nombre in ('Estudiar', 'Leer');
  insert into public.tasks (user_id, title, type, deadline, position)
    values (uid, 'Elegir certificación AWS', 'Trabajo', today - 2, 5000);

  insert into public.ideas (user_id, texto) values
    (uid, 'Probar Qdrant con embeddings de mis apuntes'), (uid, 'Escribir post sobre RAG en producción');
end $$;
