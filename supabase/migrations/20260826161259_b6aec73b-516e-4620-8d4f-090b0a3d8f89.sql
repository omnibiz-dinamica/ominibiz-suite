CREATE OR REPLACE FUNCTION public.recurrence_materialize(_days_ahead integer DEFAULT 60, _company_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_rec public.task_recurrences%ROWTYPE;
  v_day date;
  v_dow int;
  v_target timestamptz;
  v_end timestamptz;
  v_due timestamptz;
  v_matches boolean;
  v_monthly_dom int;
  v_interval int;
  v_week_offset int;
  v_anchor_week date;
  v_pos int;
  v_pos_dow int;
  v_nth int;
BEGIN
  FOR v_rec IN
    SELECT * FROM public.task_recurrences
     WHERE status = 'active'
       AND assigned_to IS NOT NULL
       AND (_company_id IS NULL OR company_id = _company_id)
       AND start_date <= (CURRENT_DATE + (_days_ahead || ' days')::interval)
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  LOOP
    v_interval := GREATEST(1, COALESCE(v_rec.interval_weeks, 1));
    -- Ancora semanal (domingo da semana de start_date): base estavel para INTERVAL=n.
    v_anchor_week := v_rec.start_date - EXTRACT(DOW FROM v_rec.start_date)::int;
    v_pos := NULLIF(v_rec.monthly_rule->>'position', '')::int;
    v_pos_dow := NULLIF(v_rec.monthly_rule->>'weekday', '')::int;

    FOR v_day IN
      SELECT generate_series(
        GREATEST(v_rec.start_date, CURRENT_DATE),
        LEAST(COALESCE(v_rec.end_date, CURRENT_DATE + (_days_ahead || ' days')::interval)::date,
              (CURRENT_DATE + (_days_ahead || ' days')::interval)::date),
        '1 day'::interval
      )::date
    LOOP
      v_dow := EXTRACT(DOW FROM v_day)::int;
      v_matches := false;

      IF v_rec.frequency = 'daily' THEN
        v_matches := true;
      ELSIF v_rec.frequency = 'weekly' THEN
        v_matches := v_dow = ANY(v_rec.weekdays);
        IF v_matches AND v_interval > 1 THEN
          -- FREQ=WEEKLY;INTERVAL=n — semanas contadas desde a semana da data inicial.
          v_week_offset := ((v_day - EXTRACT(DOW FROM v_day)::int) - v_anchor_week) / 7;
          v_matches := (v_week_offset % v_interval) = 0;
        END IF;
      ELSIF v_rec.frequency = 'monthly' THEN
        IF v_pos IS NOT NULL AND v_pos_dow IS NOT NULL THEN
          -- FREQ=MONTHLY;BYDAY=<dow>;BYSETPOS=<pos> (pos = 1..4 ou -1 para "ultima").
          IF v_dow = v_pos_dow THEN
            IF v_pos = -1 THEN
              v_matches := (v_day + 7) > (date_trunc('month', v_day::timestamp) + interval '1 month' - interval '1 day')::date;
            ELSE
              v_nth := ((EXTRACT(DAY FROM v_day)::int - 1) / 7) + 1;
              v_matches := v_nth = v_pos;
            END IF;
          END IF;
        ELSE
          v_monthly_dom := COALESCE((v_rec.monthly_rule->>'day_of_month')::int, EXTRACT(DAY FROM v_rec.start_date)::int);
          v_matches := EXTRACT(DAY FROM v_day)::int = v_monthly_dom;
        END IF;
      END IF;

      IF NOT v_matches THEN CONTINUE; END IF;

      IF v_rec.scheduled_time IS NULL THEN
        v_target := NULL;
        v_end := NULL;
        v_due := (v_day::timestamp + interval '1 day' - interval '1 second') AT TIME ZONE 'UTC';
      ELSE
        v_target := (v_day::text || ' ' || v_rec.scheduled_time::text)::timestamptz;
        v_end := CASE
          WHEN COALESCE(v_rec.duration_minutes, 0) > 0
            THEN v_target + (v_rec.duration_minutes || ' minutes')::interval
          ELSE NULL
        END;
        v_due := COALESCE(v_end, v_target);
      END IF;

      INSERT INTO public.tasks (
        company_id, title, description, status, priority,
        assigned_to, created_by, client_id,
        scheduled_for, scheduled_end, due_at, absence_grace_minutes,
        location, punch_mode_override,
        recurrence_id, recurrence_date
      ) VALUES (
        v_rec.company_id, v_rec.title, v_rec.description, 'pendente',
        v_rec.priority::public.task_priority,
        v_rec.assigned_to, COALESCE(v_rec.created_by, v_rec.assigned_to), v_rec.client_id,
        v_target, v_end, v_due, v_rec.absence_grace_minutes,
        v_rec.location, v_rec.punch_mode_override,
        v_rec.id, v_day
      )
      ON CONFLICT (recurrence_id, recurrence_date) WHERE recurrence_id IS NOT NULL AND recurrence_date IS NOT NULL
      DO NOTHING;

      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END
$function$;

SELECT cron.schedule('tasks-recurrence-materialize-daily', '10 5 * * *', $$SELECT public.recurrence_materialize(60, NULL);$$);
