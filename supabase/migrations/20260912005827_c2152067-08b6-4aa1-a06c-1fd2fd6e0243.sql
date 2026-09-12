-- ADR-062: employees need to see colleague names to suggest a reassignment.
-- Returns only (id, full_name) of members of companies the caller belongs to.
CREATE OR REPLACE FUNCTION public.company_member_options()
RETURNS TABLE (id uuid, full_name text, company_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, ur.company_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles mine
      WHERE mine.user_id = auth.uid()
        AND mine.company_id = ur.company_id
    )
  ORDER BY p.full_name
$$;

REVOKE EXECUTE ON FUNCTION public.company_member_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_member_options() TO authenticated;