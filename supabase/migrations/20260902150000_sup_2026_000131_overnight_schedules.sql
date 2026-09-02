-- SUP-2026-000131
-- Horarios fixos podem atravessar a meia-noite. A data da ocorrencia continua
-- sendo a data de inicio; o fim e calculado pela duracao em minutos.

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
       AND (
         (
           frequency = 'custom'
           AND EXISTS (
             SELECT 1
             FROM unnest(COALESCE(selected_dates, '{}'::date[])) AS date_value(explicit_date)
             WHERE explicit_date >= start_date
               AND (end_date IS NULL OR explicit_date <= end_date)
           )
         )
         OR (
           frequency <> 'custom'
           AND start_date <= (CURRENT_DATE + (_days_ahead || ' days')::interval)
           AND (end_date IS NULL OR end_date >= CURRENT_DATE)
         )
       )
  LOOP
    v_interval := GREATEST(1, COALESCE(v_rec.interval_weeks, 1));
    v_anchor_week := v_rec.start_date - EXTRACT(DOW FROM v_rec.start_date)::int;
    v_pos := NULLIF(v_rec.monthly_rule->>'position', '')::int;
    v_pos_dow := NULLIF(v_rec.monthly_rule->>'weekday', '')::int;

    FOR v_day IN
      SELECT explicit_date::date
      FROM unnest(COALESCE(v_rec.selected_dates, '{}'::date[])) AS date_value(explicit_date)
      WHERE v_rec.frequency = 'custom'
        AND explicit_date >= v_rec.start_date
        AND (v_rec.end_date IS NULL OR explicit_date <= v_rec.end_date)
      UNION ALL
      SELECT value::date
      FROM generate_series(
        GREATEST(v_rec.start_date, CURRENT_DATE),
        LEAST(COALESCE(v_rec.end_date, CURRENT_DATE + (_days_ahead || ' days')::interval)::date,
              (CURRENT_DATE + (_days_ahead || ' days')::interval)::date),
        '1 day'::interval
      ) AS generated_date(value)
      WHERE v_rec.frequency <> 'custom'
      ORDER BY 1
    LOOP
      v_dow := EXTRACT(DOW FROM v_day)::int;
      v_matches := false;

      IF v_rec.frequency = 'custom' THEN
        v_matches := true;
      ELSIF v_rec.frequency = 'daily' THEN
        v_matches := true;
      ELSIF v_rec.frequency = 'weekly' THEN
        v_matches := v_dow = ANY(v_rec.weekdays);
        IF v_matches AND v_interval > 1 THEN
          v_week_offset := ((v_day - EXTRACT(DOW FROM v_day)::int) - v_anchor_week) / 7;
          v_matches := (v_week_offset % v_interval) = 0;
        END IF;
      ELSIF v_rec.frequency = 'monthly' THEN
        IF v_pos IS NOT NULL AND v_pos_dow IS NOT NULL THEN
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
        -- Cast explicitly as UTC so the stored wall-clock time is stable in
        -- every database/session timezone, including overnight intervals.
        v_target := ((v_day::text || ' ' || v_rec.scheduled_time::text)::timestamp AT TIME ZONE 'UTC');
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
