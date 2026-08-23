-- ============================================================
-- PACOTE OPERACIONAL V2 · FASE A — Modelo financeiro canónico
-- ============================================================

-- 1) profiles: tipo de pagamento passa a aceitar daily/monthly + valor diário próprio
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pay_model_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pay_model_check
  CHECK (pay_model = ANY (ARRAY['hourly','fixed','mixed','daily','monthly']));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS manual_daily_rate numeric(10,2);

-- 2) clients: valor por dia + modo de cobrança daily
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS daily_rate numeric(10,2);
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_billing_mode_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_billing_mode_check
  CHECK (billing_mode = ANY (ARRAY['hourly','fixed','mixed','monthly','daily']));

-- 3) company_hr_settings = fonte única dos valores padrão da empresa
ALTER TABLE public.company_hr_settings
  ADD COLUMN IF NOT EXISTS default_daily_rate numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_monthly_rate numeric(10,2) NOT NULL DEFAULT 0;

-- Consolidação (não destrutiva) dos valores que estavam em companies.default_*
UPDATE public.company_hr_settings hr
   SET default_hour_rate = COALESCE(NULLIF(hr.default_hour_rate,0), c.default_hourly_rate, 0),
       default_fixed_rate = COALESCE(NULLIF(hr.default_fixed_rate,0), c.default_fixed_rate, 0),
       default_monthly_rate = COALESCE(NULLIF(hr.default_monthly_rate,0), c.default_monthly_rate, 0)
  FROM public.companies c
 WHERE c.id = hr.company_id;

INSERT INTO public.company_hr_settings (company_id, default_hour_rate, default_fixed_rate, default_monthly_rate)
SELECT c.id, COALESCE(c.default_hourly_rate,0), COALESCE(c.default_fixed_rate,0), COALESCE(c.default_monthly_rate,0)
  FROM public.companies c
 WHERE NOT EXISTS (SELECT 1 FROM public.company_hr_settings hr WHERE hr.company_id = c.id)
   AND (c.default_hourly_rate IS NOT NULL OR c.default_fixed_rate IS NOT NULL OR c.default_monthly_rate IS NOT NULL);

-- 4) snapshot: valorizações passam a suportar daily/monthly
ALTER TABLE public.time_entry_valuations DROP CONSTRAINT IF EXISTS time_entry_valuations_pay_model_used_check;
ALTER TABLE public.time_entry_valuations
  ADD CONSTRAINT time_entry_valuations_pay_model_used_check
  CHECK (pay_model_used = ANY (ARRAY['hourly','fixed','mixed','daily','monthly']));
ALTER TABLE public.time_entry_valuations
  ADD COLUMN IF NOT EXISTS daily_applied numeric(10,2),
  ADD COLUMN IF NOT EXISTS monthly_applied numeric(10,2);

-- 5) Hierarquia oficial: FUNCIONÁRIO > CLIENTE > EMPRESA (campo a campo)
CREATE OR REPLACE FUNCTION public.resolve_billing_rule(_time_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  te record; prof record; cli record; hr record; comp record;
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

-- 6) Cálculo: hora (tempo real), dia (1x por dia trabalhado), mensal (base, não multiplica horas)
CREATE OR REPLACE FUNCTION public.calculate_time_entry_value(_time_entry_id uuid)
RETURNS time_entry_valuations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  te record; rule jsonb; hr record;
  v_amount numeric(12,2) := 0;
  v_model text; v_minutes int; v_base_minutes int; v_extra_minutes int;
  v_hour_rate numeric(10,2); v_fixed numeric(10,2);
  v_daily numeric(10,2); v_monthly numeric(10,2);
  v_mbase numeric(10,2); v_mextra numeric(10,2); v_mincluded int;
  v_ot_threshold int; v_ot_mult numeric(6,3);
  v_breakdown jsonb; v_row time_entry_valuations;
  v_day date; v_day_already_paid boolean := false;
BEGIN
  SELECT t.*, ta.client_id INTO te
    FROM time_entries t LEFT JOIN tasks ta ON ta.id = t.task_id
   WHERE t.id = _time_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'time_entry % not found', _time_entry_id; END IF;

  IF te.ended_at IS NULL OR te.effective_minutes IS NULL THEN
    DELETE FROM time_entry_valuations WHERE time_entry_id = _time_entry_id;
    RETURN NULL;
  END IF;

  rule := resolve_billing_rule(_time_entry_id);
  SELECT * INTO hr FROM company_hr_settings WHERE company_id = te.company_id;
  v_ot_threshold := hr.overtime_threshold_minutes;
  v_ot_mult := COALESCE(hr.overtime_multiplier, 1);

  v_model := rule->>'pay_model';
  v_minutes := te.effective_minutes;
  v_hour_rate := (rule->>'hour_rate')::numeric;
  v_fixed := (rule->>'fixed_rate')::numeric;
  v_daily := (rule->>'daily_rate')::numeric;
  v_monthly := (rule->>'monthly_rate')::numeric;
  v_mbase := (rule->>'mixed_base')::numeric;
  v_mextra := (rule->>'mixed_extra_rate')::numeric;
  v_mincluded := (rule->>'mixed_included_minutes')::int;

  IF v_model = 'hourly' THEN
    IF v_ot_threshold IS NOT NULL AND v_minutes > v_ot_threshold THEN
      v_base_minutes := v_ot_threshold; v_extra_minutes := v_minutes - v_ot_threshold;
    ELSE
      v_base_minutes := v_minutes; v_extra_minutes := 0;
    END IF;
    v_amount := round((v_base_minutes::numeric / 60.0) * v_hour_rate
      + (v_extra_minutes::numeric / 60.0) * v_hour_rate * v_ot_mult, 2);
    v_breakdown := jsonb_build_object(
      'formula', 'base_minutes/60 * hour_rate + extra_minutes/60 * hour_rate * overtime_multiplier',
      'minutes', v_minutes, 'hour_rate', v_hour_rate,
      'base_minutes', v_base_minutes, 'extra_minutes', v_extra_minutes,
      'overtime_threshold_minutes', v_ot_threshold, 'overtime_multiplier', v_ot_mult,
      'rate_source', rule->>'hour_rate_source');
  ELSIF v_model = 'fixed' THEN
    v_amount := v_fixed;
    v_breakdown := jsonb_build_object('formula', 'fixed per closed time_entry',
      'fixed_rate', v_fixed, 'rate_source', rule->>'fixed_rate_source');
  ELSIF v_model = 'daily' THEN
    v_day := (te.started_at AT TIME ZONE COALESCE(NULLIF(te.timezone,''), 'UTC'))::date;
    SELECT EXISTS (
      SELECT 1 FROM time_entry_valuations v
        JOIN time_entries t2 ON t2.id = v.time_entry_id
       WHERE v.user_id = te.user_id
         AND v.company_id = te.company_id
         AND v.pay_model_used = 'daily'
         AND v.time_entry_id <> _time_entry_id
         AND (t2.started_at AT TIME ZONE COALESCE(NULLIF(t2.timezone,''), 'UTC'))::date = v_day
         AND v.amount > 0
    ) INTO v_day_already_paid;
    v_amount := CASE WHEN v_day_already_paid THEN 0 ELSE v_daily END;
    v_breakdown := jsonb_build_object(
      'formula', 'daily rate once per worked day (never multiplied by hours)',
      'daily_rate', v_daily, 'work_day', v_day, 'minutes', v_minutes,
      'day_already_paid', v_day_already_paid,
      'rate_source', rule->>'daily_rate_source');
  ELSIF v_model = 'monthly' THEN
    v_amount := 0;
    v_breakdown := jsonb_build_object(
      'formula', 'monthly base compensation — hours recorded for presence/overtime only',
      'monthly_rate', v_monthly, 'minutes', v_minutes,
      'rate_source', rule->>'monthly_rate_source');
  ELSIF v_model = 'mixed' THEN
    v_extra_minutes := GREATEST(0, v_minutes - v_mincluded);
    v_amount := round(v_mbase + (v_extra_minutes::numeric / 60.0) * v_mextra, 2);
    v_breakdown := jsonb_build_object(
      'formula', 'base + max(0, minutes-included)/60 * extra_rate',
      'minutes', v_minutes, 'base', v_mbase, 'included_minutes', v_mincluded,
      'extra_minutes', v_extra_minutes, 'extra_rate', v_mextra);
  ELSE
    RAISE EXCEPTION 'invalid pay_model %', v_model;
  END IF;

  INSERT INTO time_entry_valuations(
    time_entry_id, company_id, client_id, user_id,
    pay_model_used, rate_source, rate_applied, fixed_applied,
    daily_applied, monthly_applied,
    mixed_base_applied, mixed_extra_rate_applied, mixed_included_minutes_applied,
    effective_minutes, amount, currency, breakdown, computed_at, computed_by
  ) VALUES (
    _time_entry_id, te.company_id, te.client_id, te.user_id,
    v_model, rule->>'rate_source', v_hour_rate, v_fixed,
    v_daily, v_monthly,
    v_mbase, v_mextra, v_mincluded,
    v_minutes, v_amount, rule->>'currency', v_breakdown, now(), auth.uid()
  )
  ON CONFLICT (time_entry_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    client_id = EXCLUDED.client_id,
    user_id = EXCLUDED.user_id,
    pay_model_used = EXCLUDED.pay_model_used,
    rate_source = EXCLUDED.rate_source,
    rate_applied = EXCLUDED.rate_applied,
    fixed_applied = EXCLUDED.fixed_applied,
    daily_applied = EXCLUDED.daily_applied,
    monthly_applied = EXCLUDED.monthly_applied,
    mixed_base_applied = EXCLUDED.mixed_base_applied,
    mixed_extra_rate_applied = EXCLUDED.mixed_extra_rate_applied,
    mixed_included_minutes_applied = EXCLUDED.mixed_included_minutes_applied,
    effective_minutes = EXCLUDED.effective_minutes,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    breakdown = EXCLUDED.breakdown,
    computed_at = now(),
    computed_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 7) Leitura segura da hierarquia para a UI (sem expor a ficha do cliente ao funcionário)
CREATE OR REPLACE FUNCTION public.resolve_effective_compensation(
  _employee_id uuid,
  _client_id uuid DEFAULT NULL,
  _company_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prof record; cli record; hr record; comp record;
  v_company uuid; v_model text;
  v_rate numeric; v_src text;
BEGIN
  SELECT * INTO prof FROM profiles WHERE id = _employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'employee % not found', _employee_id; END IF;

  v_company := COALESCE(_company_id, prof.company_id);
  IF NOT (is_super_admin(auth.uid()) OR is_company_manager(auth.uid(), v_company) OR auth.uid() = _employee_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO comp FROM companies WHERE id = v_company;
  SELECT * INTO hr FROM company_hr_settings WHERE company_id = v_company;
  IF _client_id IS NOT NULL THEN
    SELECT * INTO cli FROM clients WHERE id = _client_id AND company_id = v_company;
  END IF;

  v_model := COALESCE(prof.pay_model, 'hourly');

  IF v_model = 'monthly' THEN
    IF prof.manual_monthly_rate IS NOT NULL THEN v_rate := prof.manual_monthly_rate; v_src := 'employee';
    ELSIF cli.monthly_rate IS NOT NULL THEN v_rate := cli.monthly_rate; v_src := 'client';
    ELSE v_rate := COALESCE(hr.default_monthly_rate, 0); v_src := 'company'; END IF;
  ELSIF v_model = 'daily' THEN
    IF prof.manual_daily_rate IS NOT NULL THEN v_rate := prof.manual_daily_rate; v_src := 'employee';
    ELSIF cli.daily_rate IS NOT NULL THEN v_rate := cli.daily_rate; v_src := 'client';
    ELSE v_rate := COALESCE(hr.default_daily_rate, 0); v_src := 'company'; END IF;
  ELSIF v_model = 'fixed' THEN
    IF prof.manual_fixed_rate IS NOT NULL THEN v_rate := prof.manual_fixed_rate; v_src := 'employee';
    ELSIF cli.fixed_rate IS NOT NULL THEN v_rate := cli.fixed_rate; v_src := 'client';
    ELSE v_rate := COALESCE(hr.default_fixed_rate, 0); v_src := 'company'; END IF;
  ELSE
    IF COALESCE(prof.manual_hour_rate, prof.manual_hourly_rate) IS NOT NULL THEN
      v_rate := COALESCE(prof.manual_hour_rate, prof.manual_hourly_rate); v_src := 'employee';
    ELSIF cli.hourly_rate IS NOT NULL THEN v_rate := cli.hourly_rate; v_src := 'client';
    ELSE v_rate := COALESCE(hr.default_hour_rate, 0); v_src := 'company'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_type', v_model,
    'applied_rate', v_rate,
    'source', v_src,
    'currency', COALESCE(comp.currency, 'EUR'),
    'effective_date', CURRENT_DATE
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_effective_compensation(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_effective_compensation(uuid, uuid, uuid) TO authenticated;