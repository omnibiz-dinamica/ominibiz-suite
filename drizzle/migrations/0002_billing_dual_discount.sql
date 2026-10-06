ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_monthly_discount_kind text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS billing_monthly_discount_value numeric NOT NULL DEFAULT 0;
ALTER TABLE public.companies DISABLE TRIGGER trg_companies_billing_super_admin_guard;
UPDATE public.companies
  SET billing_monthly_discount_kind = billing_discount_kind,
      billing_monthly_discount_value = billing_discount_value,
      billing_discount_kind = 'none', billing_discount_value = 0, billing_discount_target = 'setup'
  WHERE billing_discount_target = 'monthly';
ALTER TABLE public.companies ENABLE TRIGGER trg_companies_billing_super_admin_guard;
COMMENT ON COLUMN public.companies.billing_discount_target IS 'DEPRECATED: billing_discount_* is now always the setup discount; monthly uses billing_monthly_discount_*';
CREATE OR REPLACE FUNCTION public.companies_billing_super_admin_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    OLD.billing_discount_target IS DISTINCT FROM NEW.billing_discount_target OR
    OLD.billing_monthly_discount_kind IS DISTINCT FROM NEW.billing_monthly_discount_kind OR
    OLD.billing_monthly_discount_value IS DISTINCT FROM NEW.billing_monthly_discount_value OR
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
$function$;