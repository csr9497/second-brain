-- Periodos de vigencia de hábitos: un hábito cuenta un día si algún periodo lo cubre.
-- Los mantienen los triggers sobre habits (crear abre, archivar cierra, reactivar abre otro),
-- así reactivar no reescribe el pasado.
create table public.habit_periods (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  desde    timestamptz not null,
  hasta    timestamptz,                 -- null = periodo abierto (hábito activo)
  check (hasta is null or hasta >= desde)
);
create index habit_periods_habit_idx on public.habit_periods (habit_id);
create index habit_periods_user_idx on public.habit_periods (user_id);

alter table public.habit_periods enable row level security;
create policy owner_all on public.habit_periods for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.habit_periods from anon;
grant select, insert, update, delete on public.habit_periods to authenticated;

-- Relleno: un periodo por hábito existente
insert into public.habit_periods (user_id, habit_id, desde, hasta)
  select user_id, id, created_at, archived_at from public.habits;

create function public.habits_sync_periods() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.habit_periods (user_id, habit_id, desde, hasta)
    values (new.user_id, new.id, new.created_at, new.archived_at);
  elsif old.archived_at is null and new.archived_at is not null then
    update public.habit_periods set hasta = new.archived_at where habit_id = new.id and hasta is null;
  elsif old.archived_at is not null and new.archived_at is null then
    insert into public.habit_periods (user_id, habit_id, desde) values (new.user_id, new.id, now());
  end if;
  return null;
end $$;

create trigger habits_sync_periods
  after insert or update of archived_at on public.habits
  for each row execute function public.habits_sync_periods();
