CREATE OR REPLACE FUNCTION public.calculate_time_entry_value(_time_entry_id uuid)
 RETURNS time_entry_valuations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  te record;
  rule jsonb;
  hr record;
  v_amount numeric(12,2) := 0;
  v_model text;
  v_minutes int;
  v_base_minutes int;
  v_extra_minutes int;
  v_hour_rate numeric(10,2);
  v_fixed numeric(10,2);
  v_mbase numeric(10,2);
  v_mextra numeric(10,2);
  v_mincluded int;
  v_ot_threshold int;
  v_ot_mult numeric(6,3);
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

  SELECT * INTO hr FROM company_hr_settings WHERE company_id = te.company_id;
  v_ot_threshold := COALESCE(hr.overtime_threshold_minutes, NULL);
  v_ot_mult := COALESCE(hr.overtime_multiplier, 1);

  v_model := rule->>'pay_model';
  v_minutes := te.effective_minutes;
  v_hour_rate := (rule->>'hour_rate')::numeric;
  v_fixed := (rule->>'fixed_rate')::numeric;
  v_mbase := (rule->>'mixed_base')::numeric;
  v_mextra := (rule->>'mixed_extra_rate')::numeric;
  v_mincluded := (rule->>'mixed_included_minutes')::int;

  IF v_model = 'hourly' THEN
    IF v_ot_threshold IS NOT NULL AND v_minutes > v_ot_threshold THEN
      v_base_minutes := v_ot_threshold;
      v_extra_minutes := v_minutes - v_ot_threshold;
    ELSE
      v_base_minutes := v_minutes;
      v_extra_minutes := 0;
    END IF;
    v_amount := round(
      (v_base_minutes::numeric / 60.0) * v_hour_rate
      + (v_extra_minutes::numeric / 60.0) * v_hour_rate * v_ot_mult
    , 2);
    v_breakdown := jsonb_build_object(
      'formula', 'base_minutes/60 * hour_rate + extra_minutes/60 * hour_rate * overtime_multiplier',
      'minutes', v_minutes, 'hour_rate', v_hour_rate,
      'base_minutes', v_base_minutes, 'extra_minutes', v_extra_minutes,
      'overtime_threshold_minutes', v_ot_threshold, 'overtime_multiplier', v_ot_mult);
  ELSIF v_model = 'fixed' THEN
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
$function$;