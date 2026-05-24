
-- Hardening user_roles: managers cannot assign or promote to 'owner' or 'super_admin'.
-- Only super_admin can assign 'owner'.

-- Drop existing manager INSERT policy and replace with stricter one
DROP POLICY IF EXISTS "managers manage company roles" ON public.user_roles;

CREATE POLICY "managers insert operational roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND role IN ('manager'::app_role, 'employee'::app_role)
  AND is_company_manager(auth.uid(), company_id)
);

-- Add explicit UPDATE policy: managers can only update non-owner/non-super_admin rows,
-- and cannot promote target to 'owner' or 'super_admin'.
DROP POLICY IF EXISTS "managers update operational roles" ON public.user_roles;

CREATE POLICY "managers update operational roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  company_id IS NOT NULL
  AND role IN ('manager'::app_role, 'employee'::app_role)
  AND is_company_manager(auth.uid(), company_id)
)
WITH CHECK (
  company_id IS NOT NULL
  AND role IN ('manager'::app_role, 'employee'::app_role)
  AND is_company_manager(auth.uid(), company_id)
);

-- Tighten DELETE: managers can't delete owner rows either
DROP POLICY IF EXISTS "managers delete company roles" ON public.user_roles;

CREATE POLICY "managers delete operational roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  company_id IS NOT NULL
  AND role IN ('manager'::app_role, 'employee'::app_role)
  AND is_company_manager(auth.uid(), company_id)
);

-- Tighten the restrictive ALL policy: managers may only touch operational roles
DROP POLICY IF EXISTS "restrict role writes to managers" ON public.user_roles;

CREATE POLICY "restrict role writes to managers"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    company_id IS NOT NULL
    AND role IN ('manager'::app_role, 'employee'::app_role)
    AND is_company_manager(auth.uid(), company_id)
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    company_id IS NOT NULL
    AND role IN ('manager'::app_role, 'employee'::app_role)
    AND is_company_manager(auth.uid(), company_id)
  )
);
