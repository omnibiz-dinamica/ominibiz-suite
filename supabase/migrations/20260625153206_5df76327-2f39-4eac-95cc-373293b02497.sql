
-- Minimal fix in resolver: avoid reading unassigned record when task has no client
CREATE OR REPLACE FUNCTION public.resolve_billing_rule(_time_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF te.client_id IS NOT NULL THEN
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
$function$;


CREATE OR REPLACE FUNCTION public._run_calc_tests()
RETURNS TABLE(scenario text, formula text, expected numeric, got numeric, diff numeric, rate_source text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_company uuid := 'eec32f9a-32ad-4af8-9c10-25eb9cd26099';
  v_emp_manual uuid := '58f72122-cd91-4db6-9fd0-55bd66885ce3';
  v_emp_inherit uuid := '02eb6cf4-a512-4e21-be27-3ad87e4c0dcf';
  v_task_hourly uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_task_fixed  uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  v_task_noclient uuid := 'de151dbc-3411-44a2-aa1a-5bd378491a7e';
  v_te uuid;
  v_a numeric; v_b jsonb; v_rs text;
  orig_hr record;
  orig_emp record;
  s jsonb;
  scenarios jsonb := '[
    {"n":"HOURLY 4h (240min) mult=1.5","minutes":240,"mult":1.5,"thr":480,"expected":40.00,"formula":"240/60*10"},
    {"n":"HOURLY 8h (480min) sem OT","minutes":480,"mult":1.5,"thr":480,"expected":80.00,"formula":"480/60*10"},
    {"n":"HOURLY 8h30 (510min) mult=1.5","minutes":510,"mult":1.5,"thr":480,"expected":85.00,"formula":"8*10 + 0.5*10*1.5"},
    {"n":"HOURLY 9h (540min) mult=1.5","minutes":540,"mult":1.5,"thr":480,"expected":95.00,"formula":"8*10 + 1*10*1.5"},
    {"n":"HOURLY 10h (600min) mult=1.5","minutes":600,"mult":1.5,"thr":480,"expected":110.00,"formula":"8*10 + 2*10*1.5"},
    {"n":"HOURLY 12h (720min) mult=1.5","minutes":720,"mult":1.5,"thr":480,"expected":140.00,"formula":"8*10 + 4*10*1.5"},
    {"n":"HOURLY 8h com pausa (effective=480)","minutes":480,"mult":1.5,"thr":480,"expected":80.00,"formula":"480/60*10"},
    {"n":"LIMIT 479min (sem OT)","minutes":479,"mult":1.5,"thr":480,"expected":79.83,"formula":"479/60*10"},
    {"n":"LIMIT 480min (sem OT)","minutes":480,"mult":1.5,"thr":480,"expected":80.00,"formula":"480/60*10"},
    {"n":"LIMIT 481min (OT 1min)","minutes":481,"mult":1.5,"thr":480,"expected":80.25,"formula":"8*10 + (1/60)*10*1.5"},
    {"n":"MULT 1.25 em 9h","minutes":540,"mult":1.25,"thr":480,"expected":92.50,"formula":"8*10 + 1*10*1.25"},
    {"n":"MULT 2.00 em 9h","minutes":540,"mult":2.0,"thr":480,"expected":100.00,"formula":"8*10 + 1*10*2.00"}
  ]'::jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _calc_results (scenario text, formula text, expected numeric, got numeric, diff numeric, rate_source text, status text) ON COMMIT DROP;
  TRUNCATE _calc_results;

  -- Snapshot originals
  SELECT * INTO orig_hr FROM company_hr_settings WHERE company_id = v_company;
  SELECT id, pay_model, pay_rate_source, manual_hour_rate, manual_fixed_rate
    INTO orig_emp FROM profiles WHERE id = v_emp_manual;

  -- Ensure baseline
  UPDATE profiles SET pay_rate_source='manual', pay_model='hourly', manual_hour_rate=10.00 WHERE id=v_emp_manual;
  UPDATE profiles SET pay_rate_source='inherit', pay_model='hourly' WHERE id=v_emp_inherit;

  -- HOURLY matrix
  FOR s IN SELECT * FROM jsonb_array_elements(scenarios) LOOP
    UPDATE company_hr_settings
       SET overtime_multiplier=(s->>'mult')::numeric,
           overtime_threshold_minutes=(s->>'thr')::int,
           default_hour_rate=10.00
     WHERE company_id=v_company;

    INSERT INTO time_entries(company_id, task_id, user_id, started_at, ended_at, effective_minutes, origin, notes)
    VALUES (v_company, v_task_hourly, v_emp_manual,
            now() - ((s->>'minutes')::int || ' minutes')::interval,
            now(), (s->>'minutes')::int, 'manager_manual', 'CALC-TEST:'||(s->>'n'))
    RETURNING id INTO v_te;

    SELECT amount, breakdown, v.rate_source INTO v_a, v_b, v_rs
    FROM time_entry_valuations v WHERE time_entry_id = v_te;

    INSERT INTO _calc_results VALUES (s->>'n', s->>'formula', (s->>'expected')::numeric, v_a,
      v_a-(s->>'expected')::numeric, v_rs,
      CASE WHEN v_a=(s->>'expected')::numeric THEN '✅' ELSE '🔴' END);
  END LOOP;

  -- FIXED model via client
  UPDATE profiles SET pay_rate_source='inherit' WHERE id=v_emp_manual;
  INSERT INTO time_entries(company_id, task_id, user_id, started_at, ended_at, effective_minutes, origin, notes)
  VALUES (v_company, v_task_fixed, v_emp_manual, now() - interval '600 minutes', now(), 600, 'manager_manual', 'CALC-TEST:FIXED')
  RETURNING id INTO v_te;
  SELECT amount, v.rate_source INTO v_a, v_rs FROM time_entry_valuations v WHERE time_entry_id=v_te;
  INSERT INTO _calc_results VALUES ('FIXED cliente 50€ (10h independente)', 'fixed_rate=50', 50.00, v_a, v_a-50.00, v_rs,
    CASE WHEN v_a=50.00 THEN '✅' ELSE '🔴' END);

  -- CLIENT hourly (rate_source=client) using inherit employee
  INSERT INTO time_entries(company_id, task_id, user_id, started_at, ended_at, effective_minutes, origin, notes)
  VALUES (v_company, v_task_hourly, v_emp_inherit, now() - interval '300 minutes', now(), 300, 'manager_manual', 'CALC-TEST:CLIENT')
  RETURNING id INTO v_te;
  SELECT amount, v.rate_source INTO v_a, v_rs FROM time_entry_valuations v WHERE time_entry_id=v_te;
  INSERT INTO _calc_results VALUES ('CLIENT hourly 10€ x 5h', '5*10', 50.00, v_a, v_a-50.00, v_rs,
    CASE WHEN v_a=50.00 THEN '✅' ELSE '🔴' END);

  -- COMPANY default (task sem cliente, employee inherit)
  INSERT INTO time_entries(company_id, task_id, user_id, started_at, ended_at, effective_minutes, origin, notes)
  VALUES (v_company, v_task_noclient, v_emp_inherit, now() - interval '120 minutes', now(), 120, 'manager_manual', 'CALC-TEST:COMPANY')
  RETURNING id INTO v_te;
  SELECT amount, v.rate_source INTO v_a, v_rs FROM time_entry_valuations v WHERE time_entry_id=v_te;
  INSERT INTO _calc_results VALUES ('COMPANY default 10€ x 2h', '2*10', 20.00, v_a, v_a-20.00, v_rs,
    CASE WHEN v_a=20.00 THEN '✅' ELSE '🔴' END);

  -- MANUAL employee 12€/h x 4h
  UPDATE profiles SET pay_rate_source='manual', manual_hour_rate=12.00 WHERE id=v_emp_manual;
  INSERT INTO time_entries(company_id, task_id, user_id, started_at, ended_at, effective_minutes, origin, notes)
  VALUES (v_company, v_task_hourly, v_emp_manual, now() - interval '240 minutes', now(), 240, 'manager_manual', 'CALC-TEST:MANUAL')
  RETURNING id INTO v_te;
  SELECT amount, v.rate_source INTO v_a, v_rs FROM time_entry_valuations v WHERE time_entry_id=v_te;
  INSERT INTO _calc_results VALUES ('MANUAL employee 12€/h x 4h', '4*12', 48.00, v_a, v_a-48.00, v_rs,
    CASE WHEN v_a=48.00 THEN '✅' ELSE '🔴' END);

  -- Cleanup test entries
  DELETE FROM time_entries WHERE notes LIKE 'CALC-TEST:%';

  -- Restore originals
  UPDATE company_hr_settings c SET
    overtime_multiplier = orig_hr.overtime_multiplier,
    overtime_threshold_minutes = orig_hr.overtime_threshold_minutes,
    default_hour_rate = orig_hr.default_hour_rate
   WHERE c.company_id = v_company;
  UPDATE profiles p SET
    pay_rate_source = orig_emp.pay_rate_source,
    pay_model = orig_emp.pay_model,
    manual_hour_rate = orig_emp.manual_hour_rate,
    manual_fixed_rate = orig_emp.manual_fixed_rate
   WHERE p.id = v_emp_manual;

  RETURN QUERY SELECT * FROM _calc_results;
END;
$fn$;

REVOKE ALL ON FUNCTION public._run_calc_tests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_calc_tests() TO service_role;
