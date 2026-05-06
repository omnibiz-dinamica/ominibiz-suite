
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_company_manager(uuid, uuid) FROM authenticated;
