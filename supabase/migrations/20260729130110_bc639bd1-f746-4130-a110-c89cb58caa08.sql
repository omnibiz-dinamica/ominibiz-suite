CREATE OR REPLACE FUNCTION public.tasks_timing_modes(_task_ids uuid[])
RETURNS TABLE (task_id uuid, timing_mode text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, c.timing_mode::text
    FROM public.tasks t
    JOIN public.clients c ON c.id = t.client_id
   WHERE t.id = ANY(_task_ids)
     AND (
       public.is_super_admin(auth.uid())
       OR public.is_company_manager(auth.uid(), t.company_id)
       OR t.assigned_to = auth.uid()
       OR t.created_by = auth.uid()
     )
$$;

REVOKE EXECUTE ON FUNCTION public.tasks_timing_modes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tasks_timing_modes(uuid[]) TO authenticated, service_role;