
DROP POLICY IF EXISTS "managers insert operational roles" ON public.user_roles;
DROP POLICY IF EXISTS "managers update operational roles" ON public.user_roles;
DROP POLICY IF EXISTS "managers delete operational roles" ON public.user_roles;
DROP POLICY IF EXISTS "restrict role writes to managers" ON public.user_roles;

-- Managers (non-owner): can only manage 'employee' roles
CREATE POLICY "managers insert employee roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND role = 'employee'::app_role
  AND public.is_company_manager(auth.uid(), company_id)
  AND public.is_company_member(user_id, company_id)
);

CREATE POLICY "managers update employee roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  company_id IS NOT NULL
  AND role = 'employee'::app_role
  AND public.is_company_manager(auth.uid(), company_id)
)
WITH CHECK (
  company_id IS NOT NULL
  AND role = 'employee'::app_role
  AND public.is_company_manager(auth.uid(), company_id)
  AND public.is_company_member(user_id, company_id)
);

CREATE POLICY "managers delete employee roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL
  AND role = 'employee'::app_role
  AND public.is_company_manager(auth.uid(), company_id)
);

-- Owners: can grant/revoke manager and employee roles within their company
CREATE POLICY "owners insert operational roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND role = ANY (ARRAY['manager'::app_role, 'employee'::app_role])
  AND public.is_company_owner(auth.uid(), company_id)
  AND public.is_company_member(user_id, company_id)
);

CREATE POLICY "owners update operational roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  company_id IS NOT NULL
  AND role = ANY (ARRAY['manager'::app_role, 'employee'::app_role])
  AND public.is_company_owner(auth.uid(), company_id)
)
WITH CHECK (
  company_id IS NOT NULL
  AND role = ANY (ARRAY['manager'::app_role, 'employee'::app_role])
  AND public.is_company_owner(auth.uid(), company_id)
  AND public.is_company_member(user_id, company_id)
);

CREATE POLICY "owners delete operational roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL
  AND role = ANY (ARRAY['manager'::app_role, 'employee'::app_role])
  AND public.is_company_owner(auth.uid(), company_id)
);
