-- Día de trabajo de una tarea: minutos al día que se le dedican (null = 8 h, JORNADA_MIN en @sb/shared).
-- La duración de la tarea es (deadline − start_date + 1) días × minutos_dia; contra ella se miden sus pasos
-- (presupuesto, encadenar, pasos por tiempo de un día). En pasos de 15 min, como los pasos por tiempo.
alter table public.tasks
  add column minutos_dia int,
  add constraint tasks_minutos_dia check (minutos_dia is null or (minutos_dia between 15 and 1440 and minutos_dia % 15 = 0));
