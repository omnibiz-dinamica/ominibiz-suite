DROP POLICY IF EXISTS "members read company attachments" ON public.employee_attachments;
CREATE POLICY "owner or manager read attachments"
  ON public.employee_attachments
  FOR SELECT
  USING (
    profile_id = auth.uid()
    OR public.is_company_manager(auth.uid(), company_id)
  );