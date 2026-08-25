-- ============================================================
-- ADR-038 · Fechamento Mensal da Folha de Ponto
-- Aditivo. Nada em time_entries / valuations é alterado.
-- ============================================================

-- ---------- helper: contabilista da empresa ----------
CREATE OR REPLACE FUNCTION public.is_company_accountant(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'accountant'::app_role
      AND ur.company_id = _company_id
  )
$$;
REVOKE ALL ON FUNCTION public.is_company_accountant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_accountant(uuid, uuid) TO authenticated, service_role;

-- ---------- tabelas ----------
CREATE TABLE IF NOT EXISTS public.timesheet_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  status public.timesheet_status NOT NULL DEFAULT 'em_aberto',
  current_version integer NOT NULL DEFAULT 0,
  worked_minutes integer,
  paid_days integer,
  payment_type_used text,
  rate_used numeric(12,2),
  rate_source text,
  monthly_amount numeric(12,2),
  calculated_amount numeric(12,2),
  currency text NOT NULL DEFAULT 'EUR',
  signed_at timestamptz,
  signed_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  released_at timestamptz,
  released_by uuid,
  correction_requested_at timestamptz,
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timesheet_periods_month_range CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT timesheet_periods_year_range CHECK (period_year BETWEEN 2000 AND 2200),
  CONSTRAINT timesheet_periods_unique UNIQUE (company_id, employee_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS timesheet_periods_company_period_idx
  ON public.timesheet_periods (company_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS timesheet_periods_employee_idx
  ON public.timesheet_periods (employee_id, period_year, period_month);

GRANT SELECT ON public.timesheet_periods TO authenticated;
GRANT ALL ON public.timesheet_periods TO service_role;
ALTER TABLE public.timesheet_periods ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.timesheet_period_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.timesheet_periods(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  pdf_path text,
  content_hash text,
  signed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timesheet_period_versions_unique UNIQUE (period_id, version)
);
CREATE INDEX IF NOT EXISTS timesheet_period_versions_period_idx
  ON public.timesheet_period_versions (period_id, version DESC);

GRANT SELECT ON public.timesheet_period_versions TO authenticated;
GRANT ALL ON public.timesheet_period_versions TO service_role;
ALTER TABLE public.timesheet_period_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.timesheet_day_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid NOT NULL,
  CONSTRAINT timesheet_day_confirmations_unique UNIQUE (company_id, employee_id, work_date)
);
GRANT SELECT ON public.timesheet_day_confirmations TO authenticated;
GRANT ALL ON public.timesheet_day_confirmations TO service_role;
ALTER TABLE public.timesheet_day_confirmations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.timesheet_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period_id uuid REFERENCES public.timesheet_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  actor_user_id uuid,
  event text NOT NULL,
  version integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timesheet_audit_events_period_idx
  ON public.timesheet_audit_events (period_id, created_at DESC);

GRANT SELECT ON public.timesheet_audit_events TO authenticated;
GRANT ALL ON public.timesheet_audit_events TO service_role;
ALTER TABLE public.timesheet_audit_events ENABLE ROW LEVEL SECURITY;

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS timesheet_periods_touch ON public.timesheet_periods;
CREATE TRIGGER timesheet_periods_touch
  BEFORE UPDATE ON public.timesheet_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.timesheet_versions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Snapshot assinado é histórico: só pdf_path/content_hash podem ser preenchidos
  -- uma única vez (registo do ficheiro gerado). Nada mais muda, nunca.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TIMESHEET_VERSION_IMMUTABLE';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.period_id IS DISTINCT FROM OLD.period_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
     OR (OLD.pdf_path IS NOT NULL AND NEW.pdf_path IS DISTINCT FROM OLD.pdf_path) THEN
    RAISE EXCEPTION 'TIMESHEET_VERSION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS timesheet_versions_guard ON public.timesheet_period_versions;
CREATE TRIGGER timesheet_versions_guard
  BEFORE UPDATE OR DELETE ON public.timesheet_period_versions
  FOR EACH ROW EXECUTE FUNCTION public.timesheet_versions_append_only();

-- ---------- RLS ----------
DROP POLICY IF EXISTS "timesheet_periods_read" ON public.timesheet_periods;
CREATE POLICY "timesheet_periods_read" ON public.timesheet_periods
FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR public.is_company_manager(auth.uid(), company_id)
  OR public.is_super_admin(auth.uid())
  OR (public.is_company_accountant(auth.uid(), company_id) AND status = 'disponivel_contabilidade')
);

DROP POLICY IF EXISTS "timesheet_versions_read" ON public.timesheet_period_versions;
CREATE POLICY "timesheet_versions_read" ON public.timesheet_period_versions
FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR public.is_company_manager(auth.uid(), company_id)
  OR public.is_super_admin(auth.uid())
  OR (
    public.is_company_accountant(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM public.timesheet_periods p
      WHERE p.id = timesheet_period_versions.period_id
        AND p.status = 'disponivel_contabilidade'
    )
  )
);

DROP POLICY IF EXISTS "timesheet_day_confirmations_read" ON public.timesheet_day_confirmations;
CREATE POLICY "timesheet_day_confirmations_read" ON public.timesheet_day_confirmations
FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR public.is_company_manager(auth.uid(), company_id)
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "timesheet_audit_read" ON public.timesheet_audit_events;
CREATE POLICY "timesheet_audit_read" ON public.timesheet_audit_events
FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR public.is_company_manager(auth.uid(), company_id)
  OR public.is_super_admin(auth.uid())
);

-- Escrita é exclusivamente via RPC SECURITY DEFINER (nenhuma policy de INSERT/UPDATE/DELETE).

-- ---------- storage: bucket privado `timesheets` ----------
-- Caminho canónico: company_id/employee_id/YYYY-MM/vN.pdf
DROP POLICY IF EXISTS "timesheets read scoped" ON storage.objects;
CREATE POLICY "timesheets read scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'timesheets'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_company_manager(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR (
      (split_part(name, '/', 2))::uuid = auth.uid()
      AND public.is_company_member(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
    OR (
      public.is_company_accountant(auth.uid(), (split_part(name, '/', 1))::uuid)
      AND EXISTS (
        SELECT 1 FROM public.timesheet_periods p
        WHERE p.company_id = (split_part(name, '/', 1))::uuid
          AND p.employee_id = (split_part(name, '/', 2))::uuid
          AND p.status = 'disponivel_contabilidade'
      )
    )
  )
);

DROP POLICY IF EXISTS "timesheets write self or manager" ON storage.objects;
CREATE POLICY "timesheets write self or manager" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'timesheets'
  AND (
    public.is_company_manager(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR (
      (split_part(name, '/', 2))::uuid = auth.uid()
      AND public.is_company_member(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  )
);

-- ---------- snapshot (leitura pura dos dados canónicos) ----------
CREATE OR REPLACE FUNCTION public.timesheet_build_snapshot(
  _company_id uuid,
  _employee_id uuid,
  _year integer,
  _month integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_from date := make_date(_year, _month, 1);
  v_to date := (make_date(_year, _month, 1) + interval '1 month')::date;
  v_days jsonb;
  v_prof record;
  v_company record;
  v_comp jsonb;
  v_worked int := 0;
  v_paid_days int := 0;
  v_amount numeric := 0;
  v_currency text := 'EUR';
  v_pay_model text;
  v_rate numeric;
  v_rate_source text;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  v_allowed := v_uid = _employee_id
    OR public.is_company_manager(v_uid, _company_id)
    OR public.is_super_admin(v_uid)
    OR public.is_company_accountant(v_uid, _company_id);
  IF NOT v_allowed THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT p.full_name, p.job_title, p.work_location, p.team, p.signature_url, p.initials_url
    INTO v_prof
  FROM public.profiles p WHERE p.id = _employee_id;

  SELECT c.name, c.id INTO v_company FROM public.companies c WHERE c.id = _company_id;

  WITH entries AS (
    SELECT
      (te.started_at)::date AS work_date,
      te.id,
      te.started_at,
      te.ended_at,
      COALESCE(te.effective_minutes, 0) + COALESCE(te.paid_leave_minutes, 0) AS minutes,
      GREATEST(
        COALESCE(EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) / 60, 0)::int
          - COALESCE(te.effective_minutes, 0),
        0
      ) AS break_minutes
    FROM public.time_entries te
    WHERE te.company_id = _company_id
      AND te.user_id = _employee_id
      AND te.voided_at IS NULL
      AND te.started_at >= v_from
      AND te.started_at < v_to
  ), per_day AS (
    SELECT
      e.work_date,
      MIN(e.started_at) AS first_in,
      MAX(e.ended_at) AS last_out,
      SUM(e.minutes)::int AS worked_minutes,
      SUM(e.break_minutes)::int AS break_minutes,
      COUNT(*)::int AS entries_count
    FROM entries e
    GROUP BY e.work_date
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'work_date', d.work_date,
        'first_in', d.first_in,
        'last_out', d.last_out,
        'worked_minutes', d.worked_minutes,
        'break_minutes', d.break_minutes,
        'entries_count', d.entries_count,
        'confirmed_at', c.confirmed_at
      ) ORDER BY d.work_date
    ), '[]'::jsonb
  ), COALESCE(SUM(d.worked_minutes), 0), COUNT(*)
  INTO v_days, v_worked, v_paid_days
  FROM per_day d
  LEFT JOIN public.timesheet_day_confirmations c
    ON c.company_id = _company_id AND c.employee_id = _employee_id AND c.work_date = d.work_date;

  -- Financeiro: SEMPRE dos snapshots canónicos por registo. Sem recálculo aqui.
  SELECT COALESCE(SUM(v.amount), 0),
         COALESCE(MAX(v.currency), 'EUR'),
         MAX(v.pay_model_used),
         MAX(COALESCE(v.rate_applied, v.daily_applied, v.monthly_applied)),
         MAX(v.rate_source)
    INTO v_amount, v_currency, v_pay_model, v_rate, v_rate_source
  FROM public.time_entry_valuations v
  JOIN public.time_entries te ON te.id = v.time_entry_id
  WHERE v.company_id = _company_id
    AND v.user_id = _employee_id
    AND te.voided_at IS NULL
    AND te.started_at >= v_from
    AND te.started_at < v_to;

  IF v_pay_model IS NULL THEN
    BEGIN
      v_comp := to_jsonb(public.resolve_effective_compensation(_employee_id, NULL, _company_id));
      v_pay_model := v_comp->>'payment_type';
      v_rate := NULLIF(v_comp->>'applied_rate', '')::numeric;
      v_rate_source := v_comp->>'source';
      v_currency := COALESCE(v_comp->>'currency', v_currency);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'company', jsonb_build_object('id', _company_id, 'name', v_company.name),
    'employee', jsonb_build_object(
      'id', _employee_id,
      'full_name', v_prof.full_name,
      'job_title', v_prof.job_title,
      'work_location', v_prof.work_location,
      'team', v_prof.team,
      'signature_url', v_prof.signature_url,
      'initials_url', v_prof.initials_url
    ),
    'period', jsonb_build_object('year', _year, 'month', _month),
    'days', v_days,
    'summary', jsonb_build_object(
      'worked_minutes', v_worked,
      'paid_days', v_paid_days,
      'payment_type_used', v_pay_model,
      'rate_used', v_rate,
      'rate_source', v_rate_source,
      'calculated_amount', v_amount,
      'monthly_amount', CASE WHEN v_pay_model = 'monthly' THEN v_rate ELSE NULL END,
      'currency', v_currency
    ),
    'generated_at', now()
  );
END $$;
REVOKE ALL ON FUNCTION public.timesheet_build_snapshot(uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_build_snapshot(uuid, uuid, integer, integer) TO authenticated, service_role;

-- ---------- ensure período ----------
CREATE OR REPLACE FUNCTION public.timesheet_period_ensure(
  _company_id uuid,
  _employee_id uuid,
  _year integer,
  _month integer
)
RETURNS public.timesheet_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.timesheet_periods;
  v_snap jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (v_uid = _employee_id OR public.is_company_manager(v_uid, _company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_row FROM public.timesheet_periods
  WHERE company_id = _company_id AND employee_id = _employee_id
    AND period_year = _year AND period_month = _month;

  IF v_row.id IS NULL THEN
    INSERT INTO public.timesheet_periods (company_id, employee_id, period_year, period_month, status)
    VALUES (_company_id, _employee_id, _year, _month, 'aguardando_funcionario')
    RETURNING * INTO v_row;
  END IF;

  -- Totais informativos só são refrescados enquanto não há assinatura.
  IF v_row.status IN ('em_aberto', 'aguardando_funcionario', 'aguardando_correcao') THEN
    v_snap := public.timesheet_build_snapshot(_company_id, _employee_id, _year, _month);
    UPDATE public.timesheet_periods SET
      worked_minutes = (v_snap->'summary'->>'worked_minutes')::int,
      paid_days = (v_snap->'summary'->>'paid_days')::int,
      payment_type_used = v_snap->'summary'->>'payment_type_used',
      rate_used = NULLIF(v_snap->'summary'->>'rate_used','')::numeric,
      rate_source = v_snap->'summary'->>'rate_source',
      monthly_amount = NULLIF(v_snap->'summary'->>'monthly_amount','')::numeric,
      calculated_amount = NULLIF(v_snap->'summary'->>'calculated_amount','')::numeric,
      currency = COALESCE(v_snap->'summary'->>'currency', currency)
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.timesheet_period_ensure(uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_period_ensure(uuid, uuid, integer, integer) TO authenticated, service_role;

-- ---------- visto diário ----------
CREATE OR REPLACE FUNCTION public.timesheet_day_confirm(
  _company_id uuid,
  _work_date date,
  _confirm boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_company_member(v_uid, _company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF _confirm THEN
    INSERT INTO public.timesheet_day_confirmations (company_id, employee_id, work_date, confirmed_by)
    VALUES (_company_id, v_uid, _work_date, v_uid)
    ON CONFLICT (company_id, employee_id, work_date) DO UPDATE
      SET confirmed_at = now(), confirmed_by = v_uid;
  ELSE
    DELETE FROM public.timesheet_day_confirmations
    WHERE company_id = _company_id AND employee_id = v_uid AND work_date = _work_date;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.timesheet_day_confirm(uuid, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_day_confirm(uuid, date, boolean) TO authenticated, service_role;

-- ---------- assinatura do funcionário ----------
CREATE OR REPLACE FUNCTION public.timesheet_sign(_period_id uuid)
RETURNS public.timesheet_period_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.timesheet_periods;
  v_snap jsonb;
  v_ver public.timesheet_period_versions;
  v_name text;
  v_mgr record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_p FROM public.timesheet_periods WHERE id = _period_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND'; END IF;
  IF v_p.employee_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_p.status IN ('fechado_gestor', 'disponivel_contabilidade') THEN
    RAISE EXCEPTION 'PERIOD_CLOSED';
  END IF;

  v_snap := public.timesheet_build_snapshot(v_p.company_id, v_p.employee_id, v_p.period_year, v_p.period_month);

  INSERT INTO public.timesheet_period_versions
    (period_id, company_id, employee_id, version, snapshot, signed_at, created_by)
  VALUES (v_p.id, v_p.company_id, v_p.employee_id, v_p.current_version + 1, v_snap, now(), v_uid)
  RETURNING * INTO v_ver;

  UPDATE public.timesheet_periods SET
    status = 'assinado_funcionario',
    current_version = v_ver.version,
    signed_at = now(),
    signed_by = v_uid,
    correction_requested_at = NULL,
    correction_reason = NULL,
    worked_minutes = (v_snap->'summary'->>'worked_minutes')::int,
    paid_days = (v_snap->'summary'->>'paid_days')::int,
    payment_type_used = v_snap->'summary'->>'payment_type_used',
    rate_used = NULLIF(v_snap->'summary'->>'rate_used','')::numeric,
    rate_source = v_snap->'summary'->>'rate_source',
    monthly_amount = NULLIF(v_snap->'summary'->>'monthly_amount','')::numeric,
    calculated_amount = NULLIF(v_snap->'summary'->>'calculated_amount','')::numeric,
    currency = COALESCE(v_snap->'summary'->>'currency', currency)
  WHERE id = v_p.id;

  INSERT INTO public.timesheet_audit_events (company_id, period_id, employee_id, actor_user_id, event, version)
  VALUES (v_p.company_id, v_p.id, v_p.employee_id, v_uid,
          CASE WHEN v_ver.version > 1 THEN 'REPORT_REGENERATED' ELSE 'REPORT_GENERATED' END, v_ver.version),
         (v_p.company_id, v_p.id, v_p.employee_id, v_uid, 'EMPLOYEE_SIGNED', v_ver.version);

  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  FOR v_mgr IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    WHERE ur.company_id = v_p.company_id AND ur.role IN ('manager','owner')
  LOOP
    PERFORM public._notify(
      v_p.company_id, v_mgr.user_id, NULL, 'timesheet_employee_signed',
      'Folha de ponto assinada',
      COALESCE(v_name, 'Funcionário') || ' assinou a Folha de Ponto de ' ||
        lpad(v_p.period_month::text, 2, '0') || '/' || v_p.period_year::text || '.',
      'media',
      jsonb_build_object('period_id', v_p.id, 'version', v_ver.version)
    );
  END LOOP;

  RETURN v_ver;
END $$;
REVOKE ALL ON FUNCTION public.timesheet_sign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_sign(uuid) TO authenticated, service_role;

-- ---------- registo do PDF gerado ----------
CREATE OR REPLACE FUNCTION public.timesheet_register_pdf(
  _version_id uuid,
  _pdf_path text,
  _content_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_v public.timesheet_period_versions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_v FROM public.timesheet_period_versions WHERE id = _version_id;
  IF v_v.id IS NULL THEN RAISE EXCEPTION 'VERSION_NOT_FOUND'; END IF;
  IF NOT (v_v.employee_id = v_uid OR public.is_company_manager(v_uid, v_v.company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_v.pdf_path IS NOT NULL THEN RETURN; END IF;

  UPDATE public.timesheet_period_versions
  SET pdf_path = _pdf_path, content_hash = _content_hash
  WHERE id = _version_id;
END $$;
REVOKE ALL ON FUNCTION public.timesheet_register_pdf(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_register_pdf(uuid, text, text) TO authenticated, service_role;

-- ---------- pedido de correção ----------
CREATE OR REPLACE FUNCTION public.timesheet_request_correction(_period_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.timesheet_periods;
  v_is_mgr boolean;
  v_name text;
  v_mgr record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO v_p FROM public.timesheet_periods WHERE id = _period_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND'; END IF;
  v_is_mgr := public.is_company_manager(v_uid, v_p.company_id) OR public.is_super_admin(v_uid);
  IF NOT (v_p.employee_id = v_uid OR v_is_mgr) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_p.status = 'disponivel_contabilidade' THEN RAISE EXCEPTION 'PERIOD_RELEASED'; END IF;

  UPDATE public.timesheet_periods SET
    status = 'aguardando_correcao',
    correction_requested_at = now(),
    correction_reason = btrim(_reason)
  WHERE id = _period_id;

  INSERT INTO public.timesheet_audit_events (company_id, period_id, employee_id, actor_user_id, event, version, metadata)
  VALUES (v_p.company_id, v_p.id, v_p.employee_id, v_uid, 'CORRECTION_REQUESTED', v_p.current_version,
          jsonb_build_object('reason', btrim(_reason)));

  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_p.employee_id;

  IF v_is_mgr THEN
    PERFORM public._notify(
      v_p.company_id, v_p.employee_id, NULL, 'timesheet_correction_requested',
      'Correção solicitada na sua folha de ponto',
      'O gestor solicitou correção na Folha de Ponto de ' ||
        lpad(v_p.period_month::text, 2, '0') || '/' || v_p.period_year::text || '.',
      'alta', jsonb_build_object('period_id', v_p.id, 'reason', btrim(_reason))
    );
  ELSE
    FOR v_mgr IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.company_id = v_p.company_id AND ur.role IN ('manager','owner')
    LOOP
      PERFORM public._notify(
        v_p.company_id, v_mgr.user_id, NULL, 'timesheet_correction_requested',
        'Correção solicitada na folha de ponto',
        COALESCE(v_name, 'Funcionário') || ' solicitou correção na Folha de Ponto de ' ||
          lpad(v_p.period_month::text, 2, '0') || '/' || v_p.period_year::text || '.',
        'alta', jsonb_build_object('period_id', v_p.id, 'reason', btrim(_reason))
      );
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.timesheet_request_correction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_request_correction(uuid, text) TO authenticated, service_role;

-- ---------- fecho do gestor ----------
CREATE OR REPLACE FUNCTION public.timesheet_manager_close(_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.timesheet_periods;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_p FROM public.timesheet_periods WHERE id = _period_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND'; END IF;
  IF NOT (public.is_company_manager(v_uid, v_p.company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_p.status <> 'assinado_funcionario' AND v_p.status <> 'em_conferencia' THEN
    RAISE EXCEPTION 'PERIOD_NOT_SIGNED';
  END IF;

  UPDATE public.timesheet_periods
  SET status = 'fechado_gestor', closed_at = now(), closed_by = v_uid
  WHERE id = _period_id;

  INSERT INTO public.timesheet_audit_events (company_id, period_id, employee_id, actor_user_id, event, version)
  VALUES (v_p.company_id, v_p.id, v_p.employee_id, v_uid, 'MANAGER_CLOSED', v_p.current_version);

  PERFORM public._notify(
    v_p.company_id, v_p.employee_id, NULL, 'timesheet_manager_closed',
    'Folha de ponto fechada',
    'A sua Folha de Ponto de ' || lpad(v_p.period_month::text, 2, '0') || '/' ||
      v_p.period_year::text || ' foi fechada pelo gestor.',
    'media', jsonb_build_object('period_id', v_p.id)
  );
END $$;
REVOKE ALL ON FUNCTION public.timesheet_manager_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_manager_close(uuid) TO authenticated, service_role;

-- ---------- enviar para contabilidade ----------
CREATE OR REPLACE FUNCTION public.timesheet_send_to_accounting(_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.timesheet_periods;
  v_acc record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_p FROM public.timesheet_periods WHERE id = _period_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND'; END IF;
  IF NOT (public.is_company_manager(v_uid, v_p.company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_p.status NOT IN ('fechado_gestor', 'disponivel_contabilidade') THEN
    RAISE EXCEPTION 'PERIOD_NOT_CLOSED';
  END IF;
  IF v_p.status = 'disponivel_contabilidade' THEN RETURN; END IF;

  UPDATE public.timesheet_periods
  SET status = 'disponivel_contabilidade', released_at = now(), released_by = v_uid
  WHERE id = _period_id;

  INSERT INTO public.timesheet_audit_events (company_id, period_id, employee_id, actor_user_id, event, version)
  VALUES (v_p.company_id, v_p.id, v_p.employee_id, v_uid, 'SENT_TO_ACCOUNTING', v_p.current_version);

  FOR v_acc IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    WHERE ur.company_id = v_p.company_id AND ur.role = 'accountant'
  LOOP
    PERFORM public._notify(
      v_p.company_id, v_acc.user_id, NULL, 'timesheet_sent_to_accounting',
      'Novas folhas de ponto disponíveis',
      'Folhas de Ponto de ' || lpad(v_p.period_month::text, 2, '0') || '/' ||
        v_p.period_year::text || ' foram disponibilizadas pela empresa.',
      'media', jsonb_build_object('period_id', v_p.id)
    );
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.timesheet_send_to_accounting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_send_to_accounting(uuid) TO authenticated, service_role;

-- ---------- auditoria de visualização/download ----------
CREATE OR REPLACE FUNCTION public.timesheet_log_access(_period_id uuid, _event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.timesheet_periods;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF _event NOT IN ('REPORT_VIEWED', 'REPORT_DOWNLOADED') THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
  SELECT * INTO v_p FROM public.timesheet_periods WHERE id = _period_id;
  IF v_p.id IS NULL THEN RETURN; END IF;
  IF NOT (v_p.employee_id = v_uid
          OR public.is_company_manager(v_uid, v_p.company_id)
          OR public.is_super_admin(v_uid)
          OR (public.is_company_accountant(v_uid, v_p.company_id) AND v_p.status = 'disponivel_contabilidade')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  INSERT INTO public.timesheet_audit_events (company_id, period_id, employee_id, actor_user_id, event, version)
  VALUES (v_p.company_id, v_p.id, v_p.employee_id, v_uid, _event, v_p.current_version);
END $$;
REVOKE ALL ON FUNCTION public.timesheet_log_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_log_access(uuid, text) TO authenticated, service_role;

-- ---------- listagem para Gestor / Contabilista ----------
CREATE OR REPLACE FUNCTION public.timesheet_list(
  _company_id uuid,
  _year integer,
  _month integer
)
RETURNS TABLE (
  period_id uuid,
  employee_id uuid,
  employee_name text,
  employee_email text,
  job_title text,
  payment_type text,
  worked_minutes integer,
  paid_days integer,
  calculated_amount numeric,
  currency text,
  status public.timesheet_status,
  signed_at timestamptz,
  closed_at timestamptz,
  released_at timestamptz,
  current_version integer,
  pdf_path text,
  has_signature boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_mgr boolean;
  v_is_acc boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  v_is_mgr := public.is_company_manager(v_uid, _company_id) OR public.is_super_admin(v_uid);
  v_is_acc := public.is_company_accountant(v_uid, _company_id);
  IF NOT (v_is_mgr OR v_is_acc) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.employee_id,
    pr.full_name,
    u.email::text,
    pr.job_title,
    COALESCE(p.payment_type_used, pr.pay_model),
    p.worked_minutes,
    p.paid_days,
    p.calculated_amount,
    p.currency,
    p.status,
    p.signed_at,
    p.closed_at,
    p.released_at,
    p.current_version,
    v.pdf_path,
    pr.signature_url IS NOT NULL
  FROM public.timesheet_periods p
  JOIN public.profiles pr ON pr.id = p.employee_id
  LEFT JOIN auth.users u ON u.id = p.employee_id
  LEFT JOIN public.timesheet_period_versions v
    ON v.period_id = p.id AND v.version = p.current_version
  WHERE p.company_id = _company_id
    AND p.period_year = _year
    AND p.period_month = _month
    AND (v_is_mgr OR p.status = 'disponivel_contabilidade')
  ORDER BY pr.full_name NULLS LAST;
END $$;
REVOKE ALL ON FUNCTION public.timesheet_list(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_list(uuid, integer, integer) TO authenticated, service_role;

-- ---------- abertura em massa do mês (Gestor) ----------
CREATE OR REPLACE FUNCTION public.timesheet_open_month(
  _company_id uuid,
  _year integer,
  _month integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp record;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.is_company_manager(v_uid, _company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  FOR v_emp IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.company_id = _company_id AND ur.role = 'employee'
  LOOP
    PERFORM public.timesheet_period_ensure(_company_id, v_emp.user_id, _year, _month);
    v_count := v_count + 1;
    PERFORM public._notify(
      _company_id, v_emp.user_id, NULL, 'timesheet_report_available',
      'Folha de ponto disponível para conferência',
      'O seu relatório de ' || lpad(_month::text, 2, '0') || '/' || _year::text ||
        ' está disponível para conferência e assinatura.',
      'media', jsonb_build_object('year', _year, 'month', _month)
    );
  END LOOP;

  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.timesheet_open_month(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_open_month(uuid, integer, integer) TO authenticated, service_role;