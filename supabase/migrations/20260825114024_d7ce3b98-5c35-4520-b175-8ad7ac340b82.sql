create or replace function public.payslip_storage_readable(_user_id uuid, _path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.payslips p
    where p.storage_path = _path
      and p.user_id = _user_id
      and p.status in ('assigned','sent')
  )
$$;

revoke all on function public.payslip_storage_readable(uuid, text) from public;
grant execute on function public.payslip_storage_readable(uuid, text) to authenticated;

drop policy if exists "payslips employee read own" on storage.objects;

create policy "payslips employee read own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payslips'
  and (storage.foldername(name))[2] = (auth.uid())::text
  and public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  and public.payslip_storage_readable(auth.uid(), name)
);