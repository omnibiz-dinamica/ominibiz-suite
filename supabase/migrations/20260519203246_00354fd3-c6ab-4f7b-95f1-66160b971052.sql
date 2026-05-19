grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.is_company_member(uuid, uuid) to authenticated;
grant execute on function public.is_company_manager(uuid, uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role, uuid) to authenticated;