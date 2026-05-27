
-- 1) Drop the broad SELECT policy that exposed default pay rates to employees
DROP POLICY IF EXISTS "members view hr settings" ON public.company_hr_settings;

-- 2) Add managers-only SELECT (super_admin policy still applies separately)
CREATE POLICY "managers view hr settings"
  ON public.company_hr_settings
  FOR SELECT
  TO authenticated
  USING (is_company_manager(auth.uid(), company_id));

-- 3) Minimal view: only the punch mode default, which employees legitimately need
CREATE OR REPLACE VIEW public.company_hr_punch_settings
WITH (security_invoker = on) AS
SELECT company_id, default_punch_mode
FROM public.company_hr_settings;

GRANT SELECT ON public.company_hr_punch_settings TO authenticated;

-- 4) Replacement RLS path for members reading only the punch mode column
CREATE POLICY "members view punch mode only"
  ON public.company_hr_settings
  FOR SELECT
  TO authenticated
  USING (
    is_company_member(auth.uid(), company_id)
    AND current_setting('request.jwt.claims', true) IS NOT NULL
    AND false  -- base table no longer readable by employees; use view
  );

DROP POLICY IF EXISTS "members view punch mode only" ON public.company_hr_settings;
