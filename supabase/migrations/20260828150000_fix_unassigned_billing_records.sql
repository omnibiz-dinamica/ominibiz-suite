-- P0 STOP: keep billing resolution NULL-safe for entries without a client.
-- This preserves the existing billing rules and only fixes PL/pgSQL record access.
CREATE OR REPLACE FUNCTION public.resolve_billing_rule(_time_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  te record;
  prof public.profiles%ROWTYPE;
  cli public.clients%ROWTYPE;
  hr public.company_hr_settings%ROWTYPE;
  comp public.companies%ROWTYPE;
  v_model text;
  v_hour numeric; v_hour_src text;
  v_fixed numeric; v_fixed_src text;
  v_daily numeric; v_daily_src text;
  v_monthly numeric; v_monthly_src text;
  v_primary_src text;
BEGIN
  SELECT t.*, ta.client_id INTO te
    FROM time_entries t LEFT JOIN tasks ta ON ta.id = t.task_id
   WHERE t.id = _time_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'time_entry % not found', _time_entry_id; END IF;

  SELECT * INTO prof FROM profiles WHERE id = te.user_id;
  SELECT * INTO comp FROM companies WHERE id = te.company_id;
  SELECT * INTO hr FROM company_hr_settings WHERE company_id = te.company_id;
  IF te.client_id IS NOT NULL THEN
    SELECT * INTO cli FROM clients WHERE id = te.client_id;
  END IF;

  -- Tipo de pagamento: sempre o do FUNCIONÁRIO (fallback: cobrança do cliente, senão hourly)
  v_model := COALESCE(prof.pay_model, cli.billing_mode, 'hourly');

  -- Valor/hora
  IF COALESCE(prof.manual_hour_rate, prof.manual_hourly_rate) IS NOT NULL THEN
    v_hour := COALESCE(prof.manual_hour_rate, prof.manual_hourly_rate); v_hour_src := 'employee_manual';
  ELSIF cli.hourly_rate IS NOT NULL THEN
    v_hour := cli.hourly_rate; v_hour_src := 'client';
  ELSE
    v_hour := COALESCE(hr.default_hour_rate, 0); v_hour_src := 'company_default';
  END IF;

  -- Valor fixo (por tarefa/empreitada — semântica preservada)
  IF prof.manual_fixed_rate IS NOT NULL THEN
    v_fixed := prof.manual_fixed_rate; v_fixed_src := 'employee_manual';
  ELSIF cli.fixed_rate IS NOT NULL THEN
    v_fixed := cli.fixed_rate; v_fixed_src := 'client';
  ELSE
    v_fixed := COALESCE(hr.default_fixed_rate, 0); v_fixed_src := 'company_default';
  END IF;

  -- Valor diário (novo conceito, explícito)
  IF prof.manual_daily_rate IS NOT NULL THEN
    v_daily := prof.manual_daily_rate; v_daily_src := 'employee_manual';
  ELSIF cli.daily_rate IS NOT NULL THEN
    v_daily := cli.daily_rate; v_daily_src := 'client';
  ELSE
    v_daily := COALESCE(hr.default_daily_rate, 0); v_daily_src := 'company_default';
  END IF;

  -- Valor mensal
  IF prof.manual_monthly_rate IS NOT NULL THEN
    v_monthly := prof.manual_monthly_rate; v_monthly_src := 'employee_manual';
  ELSIF cli.monthly_rate IS NOT NULL THEN
    v_monthly := cli.monthly_rate; v_monthly_src := 'client';
  ELSE
    v_monthly := COALESCE(hr.default_monthly_rate, 0); v_monthly_src := 'company_default';
  END IF;

  v_primary_src := CASE v_model
    WHEN 'hourly' THEN v_hour_src
    WHEN 'fixed'  THEN v_fixed_src
    WHEN 'daily'  THEN v_daily_src
    WHEN 'monthly' THEN v_monthly_src
    ELSE v_hour_src END;

  RETURN jsonb_build_object(
    'pay_model', v_model,
    'rate_source', v_primary_src,
    'hour_rate', v_hour,
    'hour_rate_source', v_hour_src,
    'fixed_rate', v_fixed,
    'fixed_rate_source', v_fixed_src,
    'daily_rate', v_daily,
    'daily_rate_source', v_daily_src,
    'monthly_rate', v_monthly,
    'monthly_rate_source', v_monthly_src,
    'mixed_base', COALESCE(prof.manual_mixed_base_fixed, cli.mixed_base_fixed, hr.default_mixed_base_fixed, 0),
    'mixed_extra_rate', COALESCE(prof.manual_mixed_extra_hour_rate, cli.mixed_extra_hour_rate, hr.default_mixed_extra_hour_rate, 0),
    'mixed_included_minutes', COALESCE(prof.manual_mixed_included_minutes, cli.mixed_included_minutes, hr.default_mixed_included_minutes, 0),
    'currency', COALESCE(comp.currency, 'EUR')
  );
END;
$function$;
