-- Vigencia de hábitos: la racha y los % cuentan, cada día, los hábitos que existían
-- ese día (creados y aún no archivados). `active` pasa a derivarse de archived_at.
alter table public.habits
  add column created_at  timestamptz not null default now(),
  add column archived_at timestamptz;

-- Relleno: los hábitos existentes "nacen" el día de su primer registro
update public.habits h
   set created_at = coalesce((select min(l.fecha)::timestamptz from public.habit_logs l where l.habit_id = h.id), h.created_at);
update public.habits set archived_at = now() where not active;

alter table public.habits drop column active;
alter table public.habits add column active boolean generated always as (archived_at is null) stored;
