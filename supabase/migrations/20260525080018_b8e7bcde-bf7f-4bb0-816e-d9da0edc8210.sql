-- Defense-in-depth: explicit INSERT RLS on time_entries
-- Allows users to create their own time entries scoped to their company,
-- backing up the SECURITY DEFINER RPCs already used by the punch flows.
DROP POLICY IF EXISTS "user insert own punches" ON public.time_entries;
CREATE POLICY "user insert own punches"
ON public.time_entries
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND is_company_member(auth.uid(), company_id)
);

-- Managers can also create entries for their company (admin corrections).
DROP POLICY IF EXISTS "managers insert company punches" ON public.time_entries;
CREATE POLICY "managers insert company punches"
ON public.time_entries
FOR INSERT
TO authenticated
WITH CHECK (
  is_company_manager(auth.uid(), company_id)
);