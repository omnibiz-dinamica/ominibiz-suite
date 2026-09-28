ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_setup_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_discount_kind text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS billing_discount_value numeric NOT NULL DEFAULT 0;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_billing_discount_kind_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_billing_discount_kind_check
  CHECK (billing_discount_kind IN ('none', 'percent', 'amount'));

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_billing_discount_value_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_billing_discount_value_check
  CHECK (billing_discount_value >= 0);

CREATE OR REPLACE FUNCTION public.companies_enforce_essential_modules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  essential text[] := ARRAY['core','tasks','time_clock','hr','support','notes'];
BEGIN
  NEW.enabled_modules := (
    SELECT array_agg(DISTINCT m ORDER BY m)
    FROM unnest(COALESCE(NEW.enabled_modules, '{}'::text[]) || essential) AS m
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.companies_billing_super_admin_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.billing_plan IS DISTINCT FROM NEW.billing_plan OR
    OLD.billing_cycle IS DISTINCT FROM NEW.billing_cycle OR
    OLD.billing_country IS DISTINCT FROM NEW.billing_country OR
    OLD.billing_currency IS DISTINCT FROM NEW.billing_currency OR
    OLD.billing_base_monthly IS DISTINCT FROM NEW.billing_base_monthly OR
    OLD.billing_addons_monthly IS DISTINCT FROM NEW.billing_addons_monthly OR
    OLD.billing_setup_fee IS DISTINCT FROM NEW.billing_setup_fee OR
    OLD.billing_discount_kind IS DISTINCT FROM NEW.billing_discount_kind OR
    OLD.billing_discount_value IS DISTINCT FROM NEW.billing_discount_value OR
    OLD.employee_limit IS DISTINCT FROM NEW.employee_limit OR
    OLD.user_limit IS DISTINCT FROM NEW.user_limit OR
    OLD.enabled_modules IS DISTINCT FROM NEW.enabled_modules OR
    OLD.billing_trial_ends_at IS DISTINCT FROM NEW.billing_trial_ends_at OR
    OLD.billing_notes IS DISTINCT FROM NEW.billing_notes
  ) AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas super admin pode alterar plano, cobrança ou módulos da empresa';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.companies DISABLE TRIGGER USER;

UPDATE public.companies
SET enabled_modules = (
  SELECT array_agg(DISTINCT m ORDER BY m)
  FROM unnest(COALESCE(enabled_modules, '{}'::text[]) || ARRAY['notes']) AS m
)
WHERE NOT ('notes' = ANY (COALESCE(enabled_modules, '{}'::text[])));

ALTER TABLE public.companies ENABLE TRIGGER USER;