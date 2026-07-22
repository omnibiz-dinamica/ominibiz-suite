
DROP POLICY IF EXISTS "managers manage invites" ON public.invites;

CREATE POLICY "managers select invites"
ON public.invites FOR SELECT
USING (is_company_manager(auth.uid(), company_id));

CREATE POLICY "managers update invites"
ON public.invites FOR UPDATE
USING (is_company_manager(auth.uid(), company_id))
WITH CHECK (is_company_manager(auth.uid(), company_id));

CREATE POLICY "managers delete invites"
ON public.invites FOR DELETE
USING (is_company_manager(auth.uid(), company_id));

-- Restrict INSERT: managers can only invite employees; owners can invite manager/employee; never owner/super_admin via this path.
CREATE POLICY "managers insert invites restricted"
ON public.invites FOR INSERT
WITH CHECK (
  is_company_manager(auth.uid(), company_id)
  AND (
    role = 'employee'::app_role
    OR (role = 'manager'::app_role AND is_company_owner(auth.uid(), company_id))
  )
);
