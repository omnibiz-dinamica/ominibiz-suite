
-- Remove the SECURITY DEFINER view (linter flagged it)
DROP VIEW IF EXISTS public.company_hr_punch_settings;

-- Restore an employee-readable SELECT policy on company_hr_settings,
-- but rely on column-level GRANTs to limit which columns they actually see.
CREATE POLICY "members view hr settings rows"
  ON public.company_hr_settings
  FOR SELECT
  TO authenticated
  USING (is_company_member(auth.uid(), company_id));

-- Revoke broad column access and grant only the safe ones to authenticated.
REVOKE SELECT ON public.company_hr_settings FROM authenticated;
GRANT SELECT (company_id, default_punch_mode) ON public.company_hr_settings TO authenticated;

-- Managers and owners need full SELECT for HR configuration screens.
-- They access via the existing "managers manage hr settings" ALL policy,
-- but ALL policy needs table-level SELECT grant to managers' role.
-- We don't have a separate manager DB role; instead, grant full SELECT to
-- service_role (edge functions / admin) and use a SECURITY DEFINER RPC
-- for the HR settings screen.
GRANT SELECT ON public.company_hr_settings TO service_role;

-- Helper RPC managers call to read full HR settings
CREATE OR REPLACE FUNCTION public.get_company_hr_settings(_company_id uuid)
RETURNS public.company_hr_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.company_hr_settings;
BEGIN
  IF NOT (is_super_admin(auth.uid()) OR is_company_manager(auth.uid(), _company_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO row FROM public.company_hr_settings WHERE company_id = _company_id;
  RETURN row;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_company_hr_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_hr_settings(uuid) TO authenticated;
