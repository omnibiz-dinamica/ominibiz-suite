
-- =========================================================
-- MOTOR FINANCEIRO DA FOLHA DE PONTO
-- =========================================================

-- 1. company_hr_settings: tarifas padrão
ALTER TABLE public.company_hr_settings
  ADD COLUMN IF NOT EXISTS default_hour_rate numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_fixed_rate numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_mixed_base_fixed numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_mixed_extra_hour_rate numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_mixed_included_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_multiplier numeric(5,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS overtime_threshold_minutes int NOT NULL DEFAULT 480,
  ADD COLUMN IF NOT EXISTS billing_active boolean NOT NULL DEFAULT true;

-- 2. clients: modelo de faturação
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS fixed_rate numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS mixed_base_fixed numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS mixed_extra_hour_rate numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS mixed_included_minutes int NULL;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_billing_mode_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_billing_mode_check CHECK (billing_mode IN ('hourly','fixed','mixed'));

-- 3. profiles: modelo de remuneração (separado de punch_mode)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pay_model text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS pay_rate_source text NOT NULL DEFAULT 'inherit',
  ADD COLUMN IF NOT EXISTS manual_hour_rate numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS manual_fixed_rate numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS manual_mixed_base_fixed numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS manual_mixed_extra_hour_rate numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS manual_mixed_included_minutes int NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pay_model_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pay_model_check CHECK (pay_model IN ('hourly','fixed','mixed'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pay_rate_source_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pay_rate_source_check CHECK (pay_rate_source IN ('inherit','manual'));

-- 4. time_entry_valuations
CREATE TABLE IF NOT EXISTS public.time_entry_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL UNIQUE,
  company_id uuid NOT NULL,
  client_id uuid NULL,
  user_id uuid NOT NULL,
  pay_model_used text NOT NULL,
  rate_source text NOT NULL,
  rate_applied numeric(10,2) NOT NULL DEFAULT 0,
  fixed_applied numeric(10,2) NOT NULL DEFAULT 0,
  mixed_base_applied numeric(10,2) NOT NULL DEFAULT 0,
  mixed_extra_rate_applied numeric(10,2) NOT NULL DEFAULT 0,
  mixed_included_minutes_applied int NOT NULL DEFAULT 0,
  effective_minutes int NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by uuid NULL,
  CHECK (pay_model_used IN ('hourly','fixed','mixed')),
  CHECK (rate_source IN ('employee_manual','client','company_default'))
);

CREATE INDEX IF NOT EXISTS idx_tev_company_user ON public.time_entry_valuations(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tev_company_client ON public.time_entry_valuations(company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_tev_computed_at ON public.time_entry_valuations(computed_at);

ALTER TABLE public.time_entry_valuations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user view own valuations" ON public.time_entry_valuations;
CREATE POLICY "user view own valuations" ON public.time_entry_valuations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "managers view company valuations" ON public.time_entry_valuations;
CREATE POLICY "managers view company valuations" ON public.time_entry_valuations
  FOR SELECT TO authenticated USING (is_company_manager(auth.uid(), company_id));

DROP POLICY IF EXISTS "super admin all valuations" ON public.time_entry_valuations;
CREATE POLICY "super admin all valuations" ON public.time_entry_valuations
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- 5. financial_audit
CREATE TABLE IF NOT EXISTS public.financial_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  scope text NOT NULL,
  scope_id uuid NULL,
  field text NOT NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  actor_id uuid NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope IN ('company_settings','client','employee','time_entry','recalculate'))
);

CREATE INDEX IF NOT EXISTS idx_finaudit_company ON public.financial_audit(company_id, created_at DESC);

ALTER TABLE public.financial_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers view company financial audit" ON public.financial_audit;
CREATE POLICY "managers view company financial audit" ON public.financial_audit
  FOR SELECT TO authenticated USING (is_company_manager(auth.uid(), company_id));

DROP POLICY IF EXISTS "super admin all financial audit" ON public.financial_audit;
CREATE POLICY "super admin all financial audit" ON public.financial_audit
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- =========================================================
-- 6. RESOLVE BILLING RULE
-- =========================================================
CREATE OR REPLACE FUNCTION public.resolve_billing_rule(_time_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  te record;
  prof record;
  cli record;
  hr record;
  comp record;
  result jsonb;
BEGIN
  SELECT t.*, ta.client_id INTO te
  FROM time_entries t
  LEFT JOIN tasks ta ON ta.id = t.task_id
  WHERE t.id = _time_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'time_entry % not found', _time_entry_id;
  END IF;

  SELECT * INTO prof FROM profiles WHERE id = te.user_id;
  SELECT * INTO comp FROM companies WHERE id = te.company_id;
  SELECT * INTO hr FROM company_hr_settings WHERE company_id = te.company_id;

  IF te.client_id IS NOT NULL THEN
    SELECT * INTO cli FROM clients WHERE id = te.client_id;
  END IF;

  -- 1) employee manual override
  IF prof.pay_rate_source = 'manual' THEN
    result := jsonb_build_object(
      'pay_model', prof.pay_model,
      'rate_source', 'employee_manual',
      'hour_rate', COALESCE(prof.manual_hour_rate, 0),
      'fixed_rate', COALESCE(prof.manual_fixed_rate, 0),
      'mixed_base', COALESCE(prof.manual_mixed_base_fixed, 0),
      'mixed_extra_rate', COALESCE(prof.manual_mixed_extra_hour_rate, 0),
      'mixed_included_minutes', COALESCE(prof.manual_mixed_included_minutes, 0),
      'currency', COALESCE(comp.currency, 'EUR')
    );
    RETURN result;
  END IF;

  -- 2) client
  IF cli.id IS NOT NULL THEN
    result := jsonb_build_object(
      'pay_model', cli.billing_mode,
      'rate_source', 'client',
      'hour_rate', COALESCE(cli.hourly_rate, 0),
      'fixed_rate', COALESCE(cli.fixed_rate, 0),
      'mixed_base', COALESCE(cli.mixed_base_fixed, 0),
      'mixed_extra_rate', COALESCE(cli.mixed_extra_hour_rate, 0),
      'mixed_included_minutes', COALESCE(cli.mixed_included_minutes, 0),
      'currency', COALESCE(comp.currency, 'EUR')
    );
    RETURN result;
  END IF;

  -- 3) company defaults
  result := jsonb_build_object(
    'pay_model', COALESCE(prof.pay_model, 'hourly'),
    'rate_source', 'company_default',
    'hour_rate', COALESCE(hr.default_hour_rate, 0),
    'fixed_rate', COALESCE(hr.default_fixed_rate, 0),
    'mixed_base', COALESCE(hr.default_mixed_base_fixed, 0),
    'mixed_extra_rate', COALESCE(hr.default_mixed_extra_hour_rate, 0),
    'mixed_included_minutes', COALESCE(hr.default_mixed_included_minutes, 0),
    'currency', COALESCE(comp.currency, 'EUR')
  );
  RETURN result;
END;
$$;

-- =========================================================
-- 7. CALCULATE TIME ENTRY VALUE
-- =========================================================
CREATE OR REPLACE FUNCTION public.calculate_time_entry_value(_time_entry_id uuid)
RETURNS public.time_entry_valuations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  te record;
  rule jsonb;
  v_amount numeric(12,2) := 0;
  v_model text;
  v_minutes int;
  v_extra_minutes int;
  v_hour_rate numeric(10,2);
  v_fixed numeric(10,2);
  v_mbase numeric(10,2);
  v_mextra numeric(10,2);
  v_mincluded int;
  v_breakdown jsonb;
  v_row time_entry_valuations;
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

  v_model := rule->>'pay_model';
  v_minutes := te.effective_minutes;
  v_hour_rate := (rule->>'hour_rate')::numeric;
  v_fixed := (rule->>'fixed_rate')::numeric;
  v_mbase := (rule->>'mixed_base')::numeric;
  v_mextra := (rule->>'mixed_extra_rate')::numeric;
  v_mincluded := (rule->>'mixed_included_minutes')::int;

  IF v_model = 'hourly' THEN
    v_amount := round((v_minutes::numeric / 60.0) * v_hour_rate, 2);
    v_breakdown := jsonb_build_object('formula', 'effective_minutes/60 * hour_rate',
      'minutes', v_minutes, 'hour_rate', v_hour_rate);
  ELSIF v_model = 'fixed' THEN
    -- Fixed = pagamento por time_entry fechado (independente dos minutos)
    v_amount := v_fixed;
    v_breakdown := jsonb_build_object('formula', 'fixed per closed time_entry',
      'fixed_rate', v_fixed);
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
    mixed_base_applied, mixed_extra_rate_applied, mixed_included_minutes_applied,
    effective_minutes, amount, currency, breakdown, computed_at, computed_by
  ) VALUES (
    _time_entry_id, te.company_id, te.client_id, te.user_id,
    v_model, rule->>'rate_source', v_hour_rate, v_fixed,
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
$$;

-- =========================================================
-- 8. TRIGGER seletivo
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_calculate_valuation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM calculate_time_entry_value(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_time_entries_valuation ON public.time_entries;
CREATE TRIGGER tr_time_entries_valuation
AFTER INSERT OR UPDATE OF ended_at, effective_minutes, paused_at, resumed_at, started_at, task_id
ON public.time_entries
FOR EACH ROW
WHEN (NEW.ended_at IS NOT NULL AND NEW.effective_minutes IS NOT NULL)
EXECUTE FUNCTION public.trg_calculate_valuation();

-- =========================================================
-- 9. RPCs administrativas com reason obrigatório
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_company_finance_settings(
  _company_id uuid, _patch jsonb, _reason text
) RETURNS public.company_hr_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_row company_hr_settings; new_row company_hr_settings; k text; v jsonb;
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason required (min 5 chars)';
  END IF;
  IF NOT (is_company_manager(auth.uid(), _company_id) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO old_row FROM company_hr_settings WHERE company_id = _company_id;

  UPDATE company_hr_settings SET
    default_hour_rate = COALESCE((_patch->>'default_hour_rate')::numeric, default_hour_rate),
    default_fixed_rate = COALESCE((_patch->>'default_fixed_rate')::numeric, default_fixed_rate),
    default_mixed_base_fixed = COALESCE((_patch->>'default_mixed_base_fixed')::numeric, default_mixed_base_fixed),
    default_mixed_extra_hour_rate = COALESCE((_patch->>'default_mixed_extra_hour_rate')::numeric, default_mixed_extra_hour_rate),
    default_mixed_included_minutes = COALESCE((_patch->>'default_mixed_included_minutes')::int, default_mixed_included_minutes),
    overtime_multiplier = COALESCE((_patch->>'overtime_multiplier')::numeric, overtime_multiplier),
    overtime_threshold_minutes = COALESCE((_patch->>'overtime_threshold_minutes')::int, overtime_threshold_minutes),
    billing_active = COALESCE((_patch->>'billing_active')::boolean, billing_active),
    updated_at = now()
  WHERE company_id = _company_id
  RETURNING * INTO new_row;

  FOR k, v IN SELECT * FROM jsonb_each(_patch) LOOP
    INSERT INTO financial_audit(company_id, scope, scope_id, field, old_value, new_value, actor_id, reason)
    VALUES (_company_id, 'company_settings', _company_id, k, to_jsonb(old_row) -> k, v, auth.uid(), _reason);
  END LOOP;

  RETURN new_row;
END; $$;

CREATE OR REPLACE FUNCTION public.update_client_billing(
  _client_id uuid, _patch jsonb, _reason text
) RETURNS public.clients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_row clients; new_row clients; k text; v jsonb;
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason required (min 5 chars)'; END IF;
  SELECT * INTO old_row FROM clients WHERE id = _client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
  IF NOT (is_company_manager(auth.uid(), old_row.company_id) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE clients SET
    billing_mode = COALESCE(_patch->>'billing_mode', billing_mode),
    hourly_rate = CASE WHEN _patch ? 'hourly_rate' THEN (_patch->>'hourly_rate')::numeric ELSE hourly_rate END,
    fixed_rate = CASE WHEN _patch ? 'fixed_rate' THEN (_patch->>'fixed_rate')::numeric ELSE fixed_rate END,
    mixed_base_fixed = CASE WHEN _patch ? 'mixed_base_fixed' THEN (_patch->>'mixed_base_fixed')::numeric ELSE mixed_base_fixed END,
    mixed_extra_hour_rate = CASE WHEN _patch ? 'mixed_extra_hour_rate' THEN (_patch->>'mixed_extra_hour_rate')::numeric ELSE mixed_extra_hour_rate END,
    mixed_included_minutes = CASE WHEN _patch ? 'mixed_included_minutes' THEN (_patch->>'mixed_included_minutes')::int ELSE mixed_included_minutes END,
    updated_at = now()
  WHERE id = _client_id RETURNING * INTO new_row;

  FOR k, v IN SELECT * FROM jsonb_each(_patch) LOOP
    INSERT INTO financial_audit(company_id, scope, scope_id, field, old_value, new_value, actor_id, reason)
    VALUES (old_row.company_id, 'client', _client_id, k, to_jsonb(old_row) -> k, v, auth.uid(), _reason);
  END LOOP;

  RETURN new_row;
END; $$;

CREATE OR REPLACE FUNCTION public.update_employee_pay(
  _user_id uuid, _company_id uuid, _patch jsonb, _reason text
) RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_row profiles; new_row profiles; k text; v jsonb;
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason required (min 5 chars)'; END IF;
  IF NOT (is_company_manager(auth.uid(), _company_id) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO old_row FROM profiles WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;

  UPDATE profiles SET
    pay_model = COALESCE(_patch->>'pay_model', pay_model),
    pay_rate_source = COALESCE(_patch->>'pay_rate_source', pay_rate_source),
    manual_hour_rate = CASE WHEN _patch ? 'manual_hour_rate' THEN (_patch->>'manual_hour_rate')::numeric ELSE manual_hour_rate END,
    manual_fixed_rate = CASE WHEN _patch ? 'manual_fixed_rate' THEN (_patch->>'manual_fixed_rate')::numeric ELSE manual_fixed_rate END,
    manual_mixed_base_fixed = CASE WHEN _patch ? 'manual_mixed_base_fixed' THEN (_patch->>'manual_mixed_base_fixed')::numeric ELSE manual_mixed_base_fixed END,
    manual_mixed_extra_hour_rate = CASE WHEN _patch ? 'manual_mixed_extra_hour_rate' THEN (_patch->>'manual_mixed_extra_hour_rate')::numeric ELSE manual_mixed_extra_hour_rate END,
    manual_mixed_included_minutes = CASE WHEN _patch ? 'manual_mixed_included_minutes' THEN (_patch->>'manual_mixed_included_minutes')::int ELSE manual_mixed_included_minutes END,
    updated_at = now()
  WHERE id = _user_id RETURNING * INTO new_row;

  FOR k, v IN SELECT * FROM jsonb_each(_patch) LOOP
    INSERT INTO financial_audit(company_id, scope, scope_id, field, old_value, new_value, actor_id, reason)
    VALUES (_company_id, 'employee', _user_id, k, to_jsonb(old_row) -> k, v, auth.uid(), _reason);
  END LOOP;

  RETURN new_row;
END; $$;

CREATE OR REPLACE FUNCTION public.recalculate_period(
  _company_id uuid, _from date, _to date, _reason text
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; old_amount numeric; new_row time_entry_valuations;
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason required (min 5 chars)'; END IF;
  IF NOT (is_company_manager(auth.uid(), _company_id) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR r IN
    SELECT id FROM time_entries
    WHERE company_id = _company_id
      AND ended_at IS NOT NULL AND effective_minutes IS NOT NULL
      AND started_at::date BETWEEN _from AND _to
  LOOP
    SELECT amount INTO old_amount FROM time_entry_valuations WHERE time_entry_id = r.id;
    new_row := calculate_time_entry_value(r.id);
    IF new_row.amount IS DISTINCT FROM old_amount THEN
      INSERT INTO financial_audit(company_id, scope, scope_id, field, old_value, new_value, actor_id, reason)
      VALUES (_company_id, 'time_entry', r.id, 'amount',
        to_jsonb(old_amount), to_jsonb(new_row.amount), auth.uid(), _reason);
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

-- =========================================================
-- 10. Finance summary
-- =========================================================
CREATE OR REPLACE FUNCTION public.finance_summary(
  _company_id uuid, _from date, _to date,
  _user_id uuid DEFAULT NULL, _client_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT (is_company_manager(auth.uid(), _company_id) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH base AS (
    SELECT v.* FROM time_entry_valuations v
    JOIN time_entries t ON t.id = v.time_entry_id
    WHERE v.company_id = _company_id
      AND t.started_at::date BETWEEN _from AND _to
      AND (_user_id IS NULL OR v.user_id = _user_id)
      AND (_client_id IS NULL OR v.client_id = _client_id)
  )
  SELECT jsonb_build_object(
    'total_minutes', COALESCE(sum(effective_minutes),0),
    'total_amount', COALESCE(sum(amount),0),
    'currency', COALESCE(max(currency),'EUR'),
    'count', count(*),
    'by_user', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'minutes',m,'amount',a))
                         FROM (SELECT user_id, sum(effective_minutes) m, sum(amount) a FROM base GROUP BY user_id) s),'[]'::jsonb),
    'by_client', COALESCE((SELECT jsonb_agg(jsonb_build_object('client_id',client_id,'minutes',m,'amount',a))
                           FROM (SELECT client_id, sum(effective_minutes) m, sum(amount) a FROM base GROUP BY client_id) s),'[]'::jsonb)
  ) INTO result FROM base;

  RETURN result;
END; $$;
