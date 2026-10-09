-- Realtime: la web y la app escuchan los cambios de estas tablas y vuelven a pedir los datos
-- (apps/web/src/lib/useTiempoReal.ts). Realtime aplica RLS a insert/update: cada usuario recibe solo lo suyo.
-- Un delete llega a todos los suscritos, pero solo con la clave primaria (sin replica identity full).
alter publication supabase_realtime add table
  public.tasks,
  public.steps,
  public.task_habits,
  public.habits,
  public.habit_logs,
  public.projects,
  public.ideas,
  public.reviews,
  public.jornada;
