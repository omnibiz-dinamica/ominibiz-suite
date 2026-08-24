ALTER TABLE public.task_recurrences
  ADD COLUMN IF NOT EXISTS interval_weeks smallint NOT NULL DEFAULT 1
    CHECK (interval_weeks BETWEEN 1 AND 8);

COMMENT ON COLUMN public.task_recurrences.interval_weeks IS
  'Intervalo em semanas para frequency=weekly (RRULE FREQ=WEEKLY;INTERVAL=n). Ancorado na semana de start_date. 1=toda semana, 2=semana sim/semana nao.';

CREATE OR REPLACE FUNCTION public.recurrence_materialize(_days_ahead integer DEFAULT 14, _company_id uuid DEFAULT NULL::uuid)
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
BEGIN
  FOR v_rec IN
    SELECT * FROM public.task_recurrences
     WHERE status = 'active'
       AND (_company_id IS NULL OR company_id = _company_id)
       AND start_date <= (CURRENT_DATE + (_days_ahead || ' days')::interval)
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  LOOP
    v_interval := GREATEST(1, COALESCE(v_rec.interval_weeks, 1));
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
          -- Ancora: semana (segunda-feira) da start_date. Preserva o dia da semana
          -- e conta semanas inteiras, nunca "data + 14 dias".
          v_week_offset := (date_trunc('week', v_day::timestamp)::date
                            - date_trunc('week', v_rec.start_date::timestamp)::date) / 7;
          v_matches := (v_week_offset % v_interval) = 0;
        END IF;
      ELSIF v_rec.frequency = 'monthly' THEN
        v_monthly_dom := COALESCE((v_rec.monthly_rule->>'day_of_month')::int, EXTRACT(DAY FROM v_rec.start_date)::int);
        v_matches := EXTRACT(DAY FROM v_day)::int = v_monthly_dom;
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