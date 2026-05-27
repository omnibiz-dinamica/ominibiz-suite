
-- Recreate view as SECURITY DEFINER-style (default), exposing ONLY the punch mode.
-- Base table SELECT is restricted to managers; this view safely lets employees
-- read the company's default punch mode for the Folha de Ponto flow.
DROP VIEW IF EXISTS public.company_hr_punch_settings;

CREATE VIEW public.company_hr_punch_settings AS
SELECT company_id, default_punch_mode
FROM public.company_hr_settings;

-- Lock the view down to authenticated users that belong to the company.
REVOKE ALL ON public.company_hr_punch_settings FROM PUBLIC, anon;
GRANT SELECT ON public.company_hr_punch_settings TO authenticated;

-- Enforce per-row company membership at the view level using a security barrier
-- function, so employees only see their own company's punch mode.
CREATE OR REPLACE VIEW public.company_hr_punch_settings
WITH (security_barrier = true) AS
SELECT s.company_id, s.default_punch_mode
FROM public.company_hr_settings s
WHERE public.is_company_member(auth.uid(), s.company_id);

REVOKE ALL ON public.company_hr_punch_settings FROM PUBLIC, anon;
GRANT SELECT ON public.company_hr_punch_settings TO authenticated;
