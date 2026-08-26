-- ADR-043 · Gestão de estados das notificações (SUP-2026-000095)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_state') then
    create type public.notification_state as enum ('nova','em_tratamento','encaminhada','resolvida','arquivada');
  end if;
end $$;

alter table public.notifications
  add column if not exists state public.notification_state not null default 'nova',
  add column if not exists state_changed_at timestamptz,
  add column if not exists state_changed_by uuid,
  add column if not exists forwarded_to text,
  add column if not exists state_note text;

create index if not exists notifications_user_state_idx
  on public.notifications (user_id, state, created_at desc);

create or replace function public.notification_set_state(
  _ids uuid[],
  _state public.notification_state,
  _forwarded_to text default null,
  _note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _n integer;
begin
  if _uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if _ids is null or array_length(_ids, 1) is null then
    return 0;
  end if;
  if _state = 'encaminhada' and coalesce(btrim(_forwarded_to), '') = '' then
    raise exception 'FORWARD_DESTINATION_REQUIRED';
  end if;

  update public.notifications n
     set state = _state,
         state_changed_at = now(),
         state_changed_by = _uid,
         forwarded_to = case when _state = 'encaminhada' then btrim(_forwarded_to) else n.forwarded_to end,
         state_note = coalesce(nullif(btrim(coalesce(_note, '')), ''), n.state_note),
         read_at = case when _state = 'nova' then n.read_at else coalesce(n.read_at, now()) end
   where n.id = any(_ids)
     and n.user_id = _uid;

  get diagnostics _n = row_count;
  return _n;
end $$;

grant execute on function public.notification_set_state(uuid[], public.notification_state, text, text) to authenticated;