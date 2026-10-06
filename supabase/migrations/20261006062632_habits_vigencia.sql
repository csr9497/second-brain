-- Vigencia de hábitos: la racha y los % cuentan, cada día, los hábitos que existían
-- ese día (creados y aún no archivados). `active` pasa a derivarse de archived_at.
alter table public.habits
  add column created_at  timestamptz not null default now(),
  add column archived_at timestamptz;

-- Relleno: los hábitos existentes "nacen" el día de su primer registro. Se usa el mediodía UTC:
-- cae en ese mismo día local en casi todas las zonas (medianoche UTC sería la víspera en América).
update public.habits h
   set created_at = coalesce((select (min(l.fecha) + time '12:00')::timestamptz from public.habit_logs l where l.habit_id = h.id), h.created_at);
-- Los inactivos nunca contaron: se archivan desde su creación para no alterar el historial
update public.habits set archived_at = created_at where not active;

alter table public.habits drop column active;
alter table public.habits add column active boolean generated always as (archived_at is null) stored;
