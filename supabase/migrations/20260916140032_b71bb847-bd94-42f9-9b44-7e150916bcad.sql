CREATE OR REPLACE FUNCTION public.recurrence_materialize(_days_ahead integer DEFAULT 60, _company_id uuid DEFAULT NULL::uuid, _recurrence_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total int := 0;
  v_inserted int := 0;
  v_rec public.task_recurrences%ROWTYPE;
  v_horizon date;
  v_from date;
  v_err_msg text;
  v_err_state text;
BEGIN
  FOR v_rec IN
    SELECT *
    FROM public.task_recurrences
    WHERE status = 'active'
      AND assigned_to IS NOT NULL
      AND (_company_id IS NULL OR company_id = _company_id)
      AND (_recurrence_id IS NULL OR id = _recurrence_id)
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  LOOP
    BEGIN
      -- Horizonte de materializacao. Series sem end_date nunca passam de
      -- 12 meses a partir de hoje: o campo end_date NAO e alterado, o limite
      -- existe apenas na pre-geracao (janela rolante estendida por
      -- public.recurrence_extend_horizon).
      v_horizon := LEAST(
        (CURRENT_DATE + (_days_ahead || ' days')::interval)::date,
        COALESCE(v_rec.end_date, (CURRENT_DATE + interval '12 months')::date)
      );
      -- Catch-up nunca preenche o passado.
      v_from := GREATEST(v_rec.start_date, CURRENT_DATE);

      IF v_horizon >= v_from THEN
        WITH candidate AS (
          SELECT explicit_date::date AS day
          FROM unnest(COALESCE(v_rec.selected_dates, '{}'::date[])) AS date_value(explicit_date)
          WHERE v_rec.frequency = 'custom'
            AND explicit_date >= v_from
            AND explicit_date <= v_horizon

          UNION

          SELECT generated::date
          FROM generate_series(v_from::timestamp, v_horizon::timestamp, interval '1 day') AS g(generated)
          WHERE v_rec.frequency <> 'custom'
        ),
        kept AS (
          SELECT day, EXTRACT(DOW FROM day)::int AS dow
          FROM candidate
        ),
        matched AS (
          SELECT day, dow
          FROM kept
          WHERE
            v_rec.frequency IN ('custom', 'daily')
            OR (
              v_rec.frequency = 'weekly'
              AND dow = ANY(COALESCE(v_rec.weekdays, '{}'::int[]))
              AND (
                GREATEST(1, COALESCE(v_rec.interval_weeks, 1)) = 1
                OR (
                  (
                    ((day - dow) - (v_rec.start_date - EXTRACT(DOW FROM v_rec.start_date)::int)) / 7
                  ) % GREATEST(1, COALESCE(v_rec.interval_weeks, 1)) = 0
                )
              )
            )
            OR (
              v_rec.frequency = 'monthly'
              AND CASE
                WHEN NULLIF(v_rec.monthly_rule->>'position', '') IS NOT NULL
                     AND NULLIF(v_rec.monthly_rule->>'weekday', '') IS NOT NULL
                THEN dow = (v_rec.monthly_rule->>'weekday')::int
                     AND CASE
                       WHEN (v_rec.monthly_rule->>'position')::int = -1
                         THEN (day + 7) > (date_trunc('month', day::timestamp) + interval '1 month' - interval '1 day')::date
                       ELSE ((EXTRACT(DAY FROM day)::int - 1) / 7) + 1 = (v_rec.monthly_rule->>'position')::int
                     END
                ELSE EXTRACT(DAY FROM day)::int = COALESCE(
                  NULLIF(v_rec.monthly_rule->>'day_of_month', '')::int,
                  EXTRACT(DAY FROM v_rec.start_date)::int
                )
              END
            )
        ),
        resolved AS (
          SELECT
            m.day,
            COALESCE(NULLIF(r.rule->>'start_time', '')::time, v_rec.scheduled_time) AS s_time,
            COALESCE((r.rule->>'duration_minutes')::int, v_rec.duration_minutes) AS dur
          FROM matched m
          LEFT JOIN LATERAL (
            SELECT rule
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(v_rec.schedule_rules) = 'array' THEN v_rec.schedule_rules ELSE '[]'::jsonb END
            ) AS item(rule)
            WHERE COALESCE((rule->>'cycle_length_weeks')::int, 1) > 1
              AND COALESCE((rule->>'cycle_position')::int, 0) = (
                (
                  (
                    (
                      (
                        m.day
                        - (
                          (COALESCE(rule->>'cycle_anchor_date', v_rec.start_date::text))::date
                          - EXTRACT(DOW FROM (COALESCE(rule->>'cycle_anchor_date', v_rec.start_date::text))::date)::int
                        )
                      ) / 7
                    ) % COALESCE((rule->>'cycle_length_weeks')::int, 1)
                  ) + COALESCE((rule->>'cycle_length_weeks')::int, 1)
                ) % COALESCE((rule->>'cycle_length_weeks')::int, 1)
              )
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(rule->'weekdays', '[]'::jsonb)) AS day_value(value)
                WHERE (day_value.value #>> '{}')::int = m.dow
              )
            ORDER BY COALESCE((rule->>'cycle_position')::int, 0)
            LIMIT 1
          ) r ON true
        ),
        computed AS (
          SELECT
            day,
            CASE
              WHEN s_time IS NULL THEN NULL
              ELSE ((day::text || ' ' || s_time::text)::timestamp AT TIME ZONE 'UTC')
            END AS target,
            CASE
              WHEN s_time IS NULL THEN NULL
              WHEN COALESCE(dur, 0) > 0
                THEN ((day::text || ' ' || s_time::text)::timestamp AT TIME ZONE 'UTC') + (dur || ' minutes')::interval
              ELSE NULL
            END AS ends
          FROM resolved
        )
        INSERT INTO public.tasks (
          company_id, title, description, status, priority, assigned_to, created_by,
          client_id, scheduled_for, scheduled_end, due_at, absence_grace_minutes,
          location, punch_mode_override, recurrence_id, recurrence_date, task_group_id
        )
        SELECT
          v_rec.company_id, v_rec.title, v_rec.description, 'pendente',
          v_rec.priority::public.task_priority, v_rec.assigned_to,
          COALESCE(v_rec.created_by, v_rec.assigned_to), v_rec.client_id,
          c.target, c.ends,
          CASE
            WHEN c.target IS NULL THEN (c.day::timestamp + interval '1 day' - interval '1 second') AT TIME ZONE 'UTC'
            ELSE COALESCE(c.ends, c.target)
          END,
          v_rec.absence_grace_minutes, v_rec.location, v_rec.punch_mode_override,
          v_rec.id, c.day, v_rec.task_group_id
        FROM computed c
        -- Series antigas podem ter sido criadas com IDs diferentes antes da
        -- protecao canonica: nao materializar de novo a mesma tarefa viva.
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.tasks existing_task
          WHERE existing_task.deleted_at IS NULL
            AND existing_task.recurrence_id IS DISTINCT FROM v_rec.id
            AND existing_task.company_id = v_rec.company_id
            AND existing_task.client_id IS NOT DISTINCT FROM v_rec.client_id
            AND existing_task.assigned_to = v_rec.assigned_to
            AND existing_task.title = v_rec.title
            AND existing_task.recurrence_date = c.day
            AND existing_task.scheduled_for IS NOT DISTINCT FROM c.target
            AND existing_task.scheduled_end IS NOT DISTINCT FROM c.ends
        )
        ON CONFLICT (recurrence_id, recurrence_date)
        WHERE recurrence_id IS NOT NULL
          AND recurrence_date IS NOT NULL
        DO NOTHING;

        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        v_total := v_total + v_inserted;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
        INSERT INTO public.task_dedupe_audit (batch, kind, entity, entity_id, details)
        VALUES (
          'recurrence_materialize',
          'materialize_error',
          'task_recurrences',
          v_rec.id,
          jsonb_build_object(
            'company_id', v_rec.company_id,
            'title', v_rec.title,
            'client_id', v_rec.client_id,
            'assigned_to', v_rec.assigned_to,
            'sqlstate', v_err_state,
            'message', v_err_msg,
            'days_ahead', _days_ahead
          )
        );
    END;
  END LOOP;

  RETURN v_total;
END
$function$;

-- Janela rolante: estende o horizonte de materializacao serie por serie,
-- comecando pelas series com menor cobertura futura. Nunca reprocessa a
-- empresa inteira numa unica varredura.
CREATE OR REPLACE FUNCTION public.recurrence_extend_horizon(_limit integer DEFAULT 200, _days_ahead integer DEFAULT 365)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_total int := 0;
BEGIN
  FOR v_id IN
    SELECT r.id
    FROM public.task_recurrences r
    WHERE r.status = 'active'
      AND r.assigned_to IS NOT NULL
      AND (r.end_date IS NULL OR r.end_date >= CURRENT_DATE)
    ORDER BY COALESCE(
      (SELECT max(t.recurrence_date) FROM public.tasks t WHERE t.recurrence_id = r.id AND t.deleted_at IS NULL),
      CURRENT_DATE - 1
    ) ASC,
    r.created_at ASC
    LIMIT GREATEST(1, _limit)
  LOOP
    v_total := v_total + public.recurrence_materialize(_days_ahead, NULL, v_id);
  END LOOP;

  RETURN v_total;
END
$function$;

REVOKE ALL ON FUNCTION public.recurrence_extend_horizon(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recurrence_extend_horizon(integer, integer) TO service_role;