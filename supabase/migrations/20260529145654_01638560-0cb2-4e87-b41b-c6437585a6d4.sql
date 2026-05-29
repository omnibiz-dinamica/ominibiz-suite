-- Bucket
insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false)
on conflict (id) do nothing;

-- Enum
do $$ begin
  create type public.payslip_status as enum ('unassigned','assigned','sent','failed','archived');
exception when duplicate_object then null; end $$;

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid,
  uploaded_by uuid not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  period_year int,
  period_month int check (period_month is null or (period_month between 1 and 12)),
  employee_name_detected text,
  gross_amount numeric(12,2),
  net_amount numeric(12,2),
  parse_confidence numeric(3,2),
  parse_raw jsonb not null default '{}'::jsonb,
  status public.payslip_status not null default 'unassigned',
  email_to text,
  email_sent_at timestamptz,
  email_delivery_status text,
  email_opened_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payslips_company_period_idx on public.payslips(company_id, period_year desc nulls last, period_month desc nulls last);
create index payslips_company_user_idx on public.payslips(company_id, user_id);
create index payslips_company_status_idx on public.payslips(company_id, status);

grant select, insert, update, delete on public.payslips to authenticated;
grant all on public.payslips to service_role;

alter table public.payslips enable row level security;

create policy "employee view own payslips" on public.payslips for select to authenticated
  using (user_id = auth.uid() and status in ('assigned','sent'));

create policy "managers manage company payslips" on public.payslips for all to authenticated
  using (public.is_company_manager(auth.uid(), company_id))
  with check (public.is_company_manager(auth.uid(), company_id));

create policy "super admin all payslips" on public.payslips for all to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

create trigger payslips_set_updated_at
  before update on public.payslips
  for each row execute function public.touch_updated_at();

create table public.payslip_email_events (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null,
  company_id uuid not null,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index payslip_email_events_payslip_idx on public.payslip_email_events(payslip_id, created_at desc);

grant select on public.payslip_email_events to authenticated;
grant all on public.payslip_email_events to service_role;

alter table public.payslip_email_events enable row level security;

create policy "managers view email events" on public.payslip_email_events for select to authenticated
  using (public.is_company_manager(auth.uid(), company_id));

create policy "super admin email events" on public.payslip_email_events for all to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- Storage policies (bucket payslips, path: {company_id}/{user_id|unassigned}/...)
create policy "payslips manager write" on storage.objects for all to authenticated
  using (
    bucket_id = 'payslips'
    and public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'payslips'
    and public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "payslips employee read own" on storage.objects for select to authenticated
  using (
    bucket_id = 'payslips'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "payslips super admin all" on storage.objects for all to authenticated
  using (bucket_id = 'payslips' and public.is_super_admin(auth.uid()))
  with check (bucket_id = 'payslips' and public.is_super_admin(auth.uid()));

-- RPCs
create or replace function public.payslip_assign(_id uuid, _user_id uuid)
returns public.payslips
language plpgsql security definer set search_path = public
as $$
declare rec public.payslips; user_email text;
begin
  select * into rec from public.payslips where id = _id for update;
  if not found then raise exception 'Recibo não encontrado'; end if;
  if not (public.is_super_admin(auth.uid()) or public.is_company_manager(auth.uid(), rec.company_id)) then
    raise exception 'Sem permissão';
  end if;
  if not public.is_company_member(_user_id, rec.company_id) then
    raise exception 'Funcionário não pertence à empresa';
  end if;
  select email into user_email from auth.users where id = _user_id;
  update public.payslips
    set user_id = _user_id,
        email_to = coalesce(user_email, email_to),
        status = case when status = 'unassigned' then 'assigned'::payslip_status else status end,
        updated_at = now()
    where id = _id
    returning * into rec;
  return rec;
end; $$;
revoke all on function public.payslip_assign(uuid, uuid) from public;
grant execute on function public.payslip_assign(uuid, uuid) to authenticated;

create or replace function public.payslip_mark_sent(_id uuid, _status text, _detail jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare rec public.payslips;
begin
  select * into rec from public.payslips where id = _id for update;
  if not found then raise exception 'Recibo não encontrado'; end if;
  if not (public.is_super_admin(auth.uid()) or public.is_company_manager(auth.uid(), rec.company_id)) then
    raise exception 'Sem permissão';
  end if;
  update public.payslips
    set email_sent_at = case when _status = 'sent' then now() else email_sent_at end,
        email_delivery_status = _status,
        email_error = case when _status = 'failed' then coalesce(_detail->>'error', email_error) else null end,
        status = case
          when _status = 'sent' then 'sent'::payslip_status
          when _status = 'failed' then 'failed'::payslip_status
          else status
        end,
        updated_at = now()
    where id = _id;
  insert into public.payslip_email_events(payslip_id, company_id, event, detail)
  values (_id, rec.company_id, _status, _detail);
end; $$;
revoke all on function public.payslip_mark_sent(uuid, text, jsonb) from public;
grant execute on function public.payslip_mark_sent(uuid, text, jsonb) to authenticated;

create or replace function public.payslip_dashboard_counts(_company_id uuid)
returns table (total bigint, unassigned bigint, assigned bigint, sent bigint, failed bigint)
language sql stable security definer set search_path = public
as $$
  select
    count(*)::bigint,
    count(*) filter (where status = 'unassigned')::bigint,
    count(*) filter (where status = 'assigned')::bigint,
    count(*) filter (where status = 'sent')::bigint,
    count(*) filter (where status = 'failed')::bigint
  from public.payslips
  where company_id = _company_id
    and (public.is_super_admin(auth.uid()) or public.is_company_manager(auth.uid(), _company_id));
$$;
revoke all on function public.payslip_dashboard_counts(uuid) from public;
grant execute on function public.payslip_dashboard_counts(uuid) to authenticated;