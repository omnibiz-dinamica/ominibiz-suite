REVOKE ALL ON FUNCTION public.support_can_close_ticket(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.support_can_close_ticket(uuid, uuid) TO authenticated, service_role;