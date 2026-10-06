-- Pasos programados: fecha de inicio + duración en días (fin = inicio + días - 1).
-- Ambos opcionales, pero juntos. Sin programar, el paso no aparece en el Gantt.
alter table public.steps
  add column start_date date,
  add column duracion_dias int,
  add constraint steps_programacion_completa check ((start_date is null) = (duracion_dias is null)),
  add constraint steps_duracion_positiva check (duracion_dias is null or duracion_dias >= 1);
