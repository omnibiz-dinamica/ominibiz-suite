-- SUP-2026-000103: include approved vacation days in read-only timesheet snapshots.
-- Vacations remain HR records; no time_entry is created or changed.
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
      te.started_at::date AS work_date,
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
  ), vacation_days AS (
    SELECT DISTINCT g.day::date AS work_date
    FROM public.vacation_requests vr
    CROSS JOIN LATERAL generate_series(
      GREATEST(vr.start_date, v_from)::timestamp,
      LEAST(vr.end_date, v_to - 1)::timestamp,
      interval '1 day'
    ) AS g(day)
    WHERE vr.company_id = _company_id
      AND vr.user_id = _employee_id
      AND vr.status = 'aprovado'
      AND vr.start_date < v_to
      AND vr.end_date >= v_from
  ), day_rows AS (
    SELECT
      COALESCE(p.work_date, v.work_date) AS work_date,
      p.first_in,
      p.last_out,
      COALESCE(p.worked_minutes, 0) AS worked_minutes,
      COALESCE(p.break_minutes, 0) AS break_minutes,
      COALESCE(p.entries_count, 0) AS entries_count,
      p.work_date IS NOT NULL AS has_entry,
      v.work_date IS NOT NULL AS is_vacation
    FROM per_day p
    FULL OUTER JOIN vacation_days v ON v.work_date = p.work_date
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
        'confirmed_at', c.confirmed_at,
        'day_type', CASE WHEN d.is_vacation THEN 'vacation' ELSE 'work' END,
        'vacation_status', CASE WHEN d.is_vacation THEN 'aprovado' ELSE NULL END
      ) ORDER BY d.work_date
    ), '[]'::jsonb
  ),
  COALESCE(SUM(CASE WHEN d.has_entry THEN d.worked_minutes ELSE 0 END), 0)::int,
  COUNT(*) FILTER (WHERE d.has_entry)::int
  INTO v_days, v_worked, v_paid_days
  FROM day_rows d
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
