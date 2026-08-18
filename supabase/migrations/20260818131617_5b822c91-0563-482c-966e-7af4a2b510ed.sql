CREATE OR REPLACE FUNCTION public.profiles_guard_operational_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := COALESCE(NEW.current_company_id, OLD.current_company_id);
  v_is_manager boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF public.is_super_admin(v_uid) THEN RETURN NEW; END IF;
  IF v_company IS NOT NULL THEN
    v_is_manager := public.is_company_manager(v_uid, v_company);
  END IF;
  IF v_is_manager THEN RETURN NEW; END IF;

  NEW.job_title := OLD.job_title;
  NEW.work_location := OLD.work_location;
  NEW.supervisor_id := OLD.supervisor_id;
  NEW.team := OLD.team;
  NEW.team_number := OLD.team_number;
  NEW.current_company_id := OLD.current_company_id;
  NEW.company_id_primary := OLD.company_id_primary;
  NEW.is_active := OLD.is_active;
  NEW.status := OLD.status;

  NEW.iban := OLD.iban;
  NEW.swift := OLD.swift;
  NEW.pay_model := OLD.pay_model;
  NEW.pay_rate_source := OLD.pay_rate_source;
  NEW.manual_hour_rate := OLD.manual_hour_rate;
  NEW.manual_hourly_rate := OLD.manual_hourly_rate;
  NEW.manual_fixed_rate := OLD.manual_fixed_rate;
  NEW.manual_monthly_rate := OLD.manual_monthly_rate;
  NEW.manual_mixed_base_fixed := OLD.manual_mixed_base_fixed;
  NEW.manual_mixed_extra_hour_rate := OLD.manual_mixed_extra_hour_rate;
  NEW.manual_mixed_included_minutes := OLD.manual_mixed_included_minutes;
  NEW.rate_hour_week := OLD.rate_hour_week;
  NEW.rate_hour_weekend := OLD.rate_hour_weekend;
  NEW.rate_day_be := OLD.rate_day_be;
  NEW.rate_day_foreign := OLD.rate_day_foreign;
  NEW.allowance_meal := OLD.allowance_meal;
  NEW.allowance_transport := OLD.allowance_transport;
  NEW.allowance_rent := OLD.allowance_rent;
  NEW.allowance_other := OLD.allowance_other;

  NEW.tax_id_nif := OLD.tax_id_nif;
  NEW.social_security_niss := OLD.social_security_niss;
  NEW.tax_country := OLD.tax_country;
  NEW.contract_type := OLD.contract_type;
  NEW.contract_renewal_date := OLD.contract_renewal_date;
  NEW.weekly_contracted_hours := OLD.weekly_contracted_hours;
  NEW.hire_date := OLD.hire_date;
  NEW.termination_date := OLD.termination_date;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS profiles_guard_operational_fields_trg ON public.profiles;
CREATE TRIGGER profiles_guard_operational_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_operational_fields();