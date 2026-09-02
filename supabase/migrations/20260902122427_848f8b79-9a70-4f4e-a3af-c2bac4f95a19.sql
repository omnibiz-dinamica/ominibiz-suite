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

-- Account-holder email change requests. The canonical Auth email changes only
-- after approval by a different company manager/owner or a Super Admin.
create table if not exists public.user_email_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null,
  current_email_redacted text not null,
  requested_email text not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text,
  constraint user_email_change_requests_email_length
    check (length(requested_email) between 3 and 254),
  constraint user_email_change_requests_reason_length
    check (length(btrim(reason)) between 5 and 500),
  constraint user_email_change_requests_decision_consistency
    check (
      (status = 'pending' and decided_at is null and decided_by is null)
      or
      (status <> 'pending' and decided_at is not null and decided_by is not null)
    )
);

create unique index if not exists user_email_change_requests_one_pending_idx
  on public.user_email_change_requests (user_id)
  where status = 'pending';
create index if not exists user_email_change_requests_company_status_idx
  on public.user_email_change_requests (company_id, status, requested_at desc);
create index if not exists user_email_change_requests_user_created_idx
  on public.user_email_change_requests (user_id, requested_at desc);

alter table public.user_email_change_requests enable row level security;
grant select on table public.user_email_change_requests to authenticated;
grant all on table public.user_email_change_requests to service_role;
revoke insert, update, delete on table public.user_email_change_requests from authenticated, anon;

drop policy if exists "email requests account holder and managers read"
  on public.user_email_change_requests;
create policy "email requests account holder and managers read"
  on public.user_email_change_requests for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_company_manager(auth.uid(), company_id)
  );

comment on table public.user_email_change_requests is
  'Audited requests submitted by the account holder for manager approval before changing auth.users.email.';