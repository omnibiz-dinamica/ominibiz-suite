CREATE OR REPLACE FUNCTION public.companies_enforce_essential_modules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  essential text[] := ARRAY['core','tasks','time_clock','hr','support'];
BEGIN
  NEW.enabled_modules := (
    SELECT array_agg(DISTINCT m ORDER BY m)
    FROM unnest(COALESCE(NEW.enabled_modules, '{}'::text[]) || essential) AS m
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_enforce_essential_modules ON public.companies;
CREATE TRIGGER trg_companies_enforce_essential_modules
BEFORE INSERT OR UPDATE OF enabled_modules ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.companies_enforce_essential_modules();

UPDATE public.companies
SET enabled_modules = enabled_modules
WHERE NOT (enabled_modules @> ARRAY['core','tasks','time_clock','hr','support']::text[]);