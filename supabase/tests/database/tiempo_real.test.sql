-- Ejecutar con: supabase test db
-- Realtime: las tablas que pinta la app están en la publicación supabase_realtime (lib/useTiempoReal.ts).
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select set_eq(
  $$ select tablename::text from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' $$,
  array['tasks', 'steps', 'task_habits', 'habits', 'habit_logs', 'projects', 'ideas', 'reviews', 'jornada'],
  'las tablas de la app publican sus cambios por Realtime (y no las de avisos)');

select * from finish();
rollback;
