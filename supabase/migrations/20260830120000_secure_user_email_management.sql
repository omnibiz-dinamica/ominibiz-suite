-- Secure, canonical email access and audit for administrative changes.
create table if not exists public.user_identity_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null,
  actor_id uuid not null,
  action text not null check (action = 'email_change'),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  old_email_redacted text not null,
  new_email_redacted text not null,
  old_email_hash text not null,
  new_email_hash text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists user_identity_audit_company_created_idx
  on public.user_identity_audit (company_id, created_at desc);
create index if not exists user_identity_audit_user_created_idx
  on public.user_identity_audit (user_id, created_at desc);

alter table public.user_identity_audit enable row level security;
grant select on table public.user_identity_audit to authenticated;
grant all on table public.user_identity_audit to service_role;
revoke insert, update, delete on table public.user_identity_audit from authenticated, anon;

drop policy if exists "user identity audit managers read" on public.user_identity_audit;
create policy "user identity audit managers read"
  on public.user_identity_audit for select to authenticated
  using (
    public.is_super_admin(auth.uid())
    or public.is_company_manager(auth.uid(), company_id)
  );

create or replace function public.company_member_emails(_company_id uuid)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not (
    public.is_super_admin(v_uid)
    or public.is_company_manager(v_uid, _company_id)
  ) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query
  select distinct ur.user_id, lower(u.email)
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
   where ur.company_id = _company_id
     and u.email is not null;
end;
$$;

revoke all on function public.company_member_emails(uuid) from public, anon;
grant execute on function public.company_member_emails(uuid) to authenticated, service_role;
