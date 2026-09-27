CREATE OR REPLACE FUNCTION public.company_active_member_options()
 RETURNS TABLE(id uuid, full_name text, company_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, ur.company_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.company_id IS NOT NULL
    AND COALESCE(p.is_active, true) = true
    AND EXISTS (SELECT 1 FROM public.user_roles mine
                WHERE mine.user_id = auth.uid() AND mine.company_id = ur.company_id)
  ORDER BY p.full_name
$$;
REVOKE ALL ON FUNCTION public.company_active_member_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_active_member_options() TO authenticated;