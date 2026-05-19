REVOKE EXECUTE ON FUNCTION public.get_auth_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_auth_context() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_auth_context() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_current_company(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_current_company(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_current_company(uuid) TO authenticated;