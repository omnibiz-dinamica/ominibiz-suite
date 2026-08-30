-- SUP-2026-000108: restrict notification workflow states to managers.
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
  if _state = 'encaminhada'::public.notification_state
     and coalesce(btrim(_forwarded_to), '') = '' then
    raise exception 'FORWARD_DESTINATION_REQUIRED';
  end if;

  -- Employees may archive their own notifications, but workflow management is
  -- restricted to a manager of the notification company or a Super Admin.
  if _state <> 'arquivada'::public.notification_state
     and exists (
       select 1
         from public.notifications n
        where n.id = any(_ids)
          and n.user_id = _uid
          and not (
            public.is_company_manager(_uid, n.company_id)
            or public.is_super_admin(_uid)
          )
     ) then
    raise exception 'NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  update public.notifications n
     set state = _state,
         state_changed_at = now(),
         state_changed_by = _uid,
         forwarded_to = case
           when _state = 'encaminhada'::public.notification_state then btrim(_forwarded_to)
           else n.forwarded_to
         end,
         state_note = coalesce(nullif(btrim(coalesce(_note, '')), ''), n.state_note),
         read_at = case
           when _state = 'nova'::public.notification_state then n.read_at
           else coalesce(n.read_at, now())
         end
   where n.id = any(_ids)
     and n.user_id = _uid;

  get diagnostics _n = row_count;
  return _n;
end $$;

grant execute on function public.notification_set_state(
  uuid[], public.notification_state, text, text
) to authenticated;

-- State and read changes already use audited SECURITY DEFINER functions.
-- Removing direct table updates prevents bypassing their authorization checks.
revoke update on table public.notifications from authenticated;
