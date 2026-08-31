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
