-- 1) Geração por série: novo parâmetro opcional _recurrence_id
CREATE OR REPLACE FUNCTION public.recurrence_materialize(
  _days_ahead integer DEFAULT 60,
  _company_id uuid DEFAULT NULL::uuid,
  _recurrence_id uuid DEFAULT NULL::uuid
)
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
  v_rule jsonb;
  v_duration int;
  v_scheduled_time time;
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
      AND (
        (
          frequency = 'custom'
          AND EXISTS (
            SELECT 1
            FROM unnest(COALESCE(selected_dates, '{}'::date[]))
              AS date_value(explicit_date)
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
    BEGIN
      v_interval := GREATEST(1, COALESCE(v_rec.interval_weeks, 1));
      v_anchor_week := v_rec.start_date - EXTRACT(DOW FROM v_rec.start_date)::int;

      v_pos := NULLIF(v_rec.monthly_rule->>'position', '')::int;
      v_pos_dow := NULLIF(v_rec.monthly_rule->>'weekday', '')::int;

      FOR v_day IN
        SELECT explicit_date::date
        FROM unnest(COALESCE(v_rec.selected_dates, '{}'::date[]))
          AS date_value(explicit_date)
        WHERE v_rec.frequency = 'custom'
          AND explicit_date >= v_rec.start_date
          AND (v_rec.end_date IS NULL OR explicit_date <= v_rec.end_date)

        UNION ALL

        SELECT value::date
        FROM generate_series(
          GREATEST(v_rec.start_date, CURRENT_DATE),
          LEAST(
            COALESCE(
              v_rec.end_date,
              CURRENT_DATE + (_days_ahead || ' days')::interval
            )::date,
            (CURRENT_DATE + (_days_ahead || ' days')::interval)::date
          ),
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
                v_matches :=
                  (v_day + 7) >
                  (
                    date_trunc('month', v_day::timestamp)
                    + interval '1 month'
                    - interval '1 day'
                  )::date;
              ELSE
                v_nth := ((EXTRACT(DAY FROM v_day)::int - 1) / 7) + 1;
                v_matches := v_nth = v_pos;
              END IF;
            END IF;
          ELSE
            v_monthly_dom :=
              COALESCE(
                (v_rec.monthly_rule->>'day_of_month')::int,
                EXTRACT(DAY FROM v_rec.start_date)::int
              );

            v_matches := EXTRACT(DAY FROM v_day)::int = v_monthly_dom;
          END IF;
        END IF;

        IF NOT v_matches THEN
          CONTINUE;
        END IF;

        v_duration := v_rec.duration_minutes;
        v_scheduled_time := v_rec.scheduled_time;

        IF jsonb_typeof(v_rec.schedule_rules) = 'array' THEN
          SELECT rule
          INTO v_rule
          FROM jsonb_array_elements(v_rec.schedule_rules) AS item(rule)
          WHERE COALESCE((rule->>'cycle_length_weeks')::int, 1) > 1
            AND COALESCE((rule->>'cycle_position')::int, 0) = (
              (
                (
                  (
                    (
                      v_day
                      - (
                        (
                          COALESCE(rule->>'cycle_anchor_date', v_rec.start_date::text)
                        )::date
                        - EXTRACT(
                            DOW FROM (
                              COALESCE(rule->>'cycle_anchor_date', v_rec.start_date::text)
                            )::date
                          )::int
                      )
                    ) / 7
                  ) % COALESCE((rule->>'cycle_length_weeks')::int, 1)
                ) + COALESCE((rule->>'cycle_length_weeks')::int, 1)
              ) % COALESCE((rule->>'cycle_length_weeks')::int, 1)
            )
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(rule->'weekdays', '[]'::jsonb)) AS day_value(value)
              WHERE (day_value.value #>> '{}')::int = v_dow
            )
          ORDER BY COALESCE((rule->>'cycle_position')::int, 0)
          LIMIT 1;

          IF v_rule IS NOT NULL THEN
            v_duration := COALESCE((v_rule->>'duration_minutes')::int, v_duration);
            v_scheduled_time := COALESCE(NULLIF(v_rule->>'start_time', '')::time, v_scheduled_time);
          END IF;
        END IF;

        IF v_scheduled_time IS NULL THEN
          v_target := NULL;
          v_end := NULL;
          v_due := (v_day::timestamp + interval '1 day' - interval '1 second') AT TIME ZONE 'UTC';
        ELSE
          v_target := ((v_day::text || ' ' || v_scheduled_time::text)::timestamp AT TIME ZONE 'UTC');
          v_end :=
            CASE
              WHEN COALESCE(v_duration, 0) > 0 THEN v_target + (v_duration || ' minutes')::interval
              ELSE NULL
            END;
          v_due := COALESCE(v_end, v_target);
        END IF;

        INSERT INTO public.tasks (
          company_id, title, description, status, priority, assigned_to, created_by,
          client_id, scheduled_for, scheduled_end, due_at, absence_grace_minutes,
          location, punch_mode_override, recurrence_id, recurrence_date
        )
        VALUES (
          v_rec.company_id, v_rec.title, v_rec.description, 'pendente',
          v_rec.priority::public.task_priority, v_rec.assigned_to,
          COALESCE(v_rec.created_by, v_rec.assigned_to), v_rec.client_id,
          v_target, v_end, v_due, v_rec.absence_grace_minutes, v_rec.location,
          v_rec.punch_mode_override, v_rec.id, v_day
        )
        ON CONFLICT (recurrence_id, recurrence_date)
        WHERE recurrence_id IS NOT NULL
          AND recurrence_date IS NOT NULL
        DO NOTHING;

        IF FOUND THEN
          v_count := v_count + 1;
        END IF;
      END LOOP;
    EXCEPTION
      WHEN OTHERS THEN
        -- Uma serie invalida nunca pode abortar a geracao das demais.
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

  RETURN v_count;
END
$function$;

-- A versao de 2 argumentos sairia como sobrecarga ambigua; a nova assinatura
-- cobre as chamadas antigas pelos valores padrao.
DROP FUNCTION IF EXISTS public.recurrence_materialize(integer, uuid);

REVOKE ALL ON FUNCTION public.recurrence_materialize(integer, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recurrence_materialize(integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recurrence_materialize(integer, uuid, uuid) TO service_role;

-- 2) Janela coerente: fim nunca antes do inicio (linhas legadas preservadas)
ALTER TABLE public.task_recurrences
  ADD CONSTRAINT task_recurrences_window_order
  CHECK (end_date IS NULL OR end_date >= start_date) NOT VALID;

-- 3) Encerramento nunca produz janela invertida
CREATE OR REPLACE FUNCTION public.recurrence_end(_id uuid, _reason text, _cancel_future boolean DEFAULT true)
 RETURNS task_recurrences
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.task_recurrences%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM public.task_recurrences WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada'; END IF;
  IF NOT public.is_company_manager(v_uid, v_rec.company_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.task_recurrences
     SET status = 'ended',
         ended_reason = _reason,
         ended_at = now(),
         end_date = GREATEST(CURRENT_DATE, start_date)
   WHERE id = _id
   RETURNING * INTO v_rec;

  IF _cancel_future THEN
    UPDATE public.tasks
       SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid
     WHERE recurrence_id = _id
       AND status IN ('pendente','autorizado')
       AND scheduled_for > now();
  END IF;

  RETURN v_rec;
END $function$;

-- 4) Exclusao de ocorrencias futuras tambem preserva a ordem da janela
CREATE OR REPLACE FUNCTION public.task_series_delete(_task_id uuid, _scope text DEFAULT 'single'::text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_t public.tasks%ROWTYPE;
  v_cutoff date;
  v_role text;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_deleted int := 0;
  v_cancelled int := 0;
  v_kept int := 0;
  v_history boolean;
  v_open uuid;
  v_series_ended boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF _scope NOT IN ('single', 'future') THEN
    RAISE EXCEPTION 'Escopo invalido: %', _scope;
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;
  IF v_task.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Tarefa ja foi excluida'; END IF;

  IF NOT (public.is_super_admin(v_uid) OR public.is_company_manager(v_uid, v_task.company_id)) THEN
    RAISE EXCEPTION 'Apenas gestor ou super admin pode excluir tarefas';
  END IF;
  v_role := CASE WHEN public.is_super_admin(v_uid) THEN 'super_admin' ELSE 'manager' END;

  IF _scope = 'future' AND v_task.recurrence_id IS NULL THEN
    RAISE EXCEPTION 'Tarefa nao pertence a uma serie recorrente';
  END IF;

  v_cutoff := COALESCE(
    v_task.recurrence_date,
    (v_task.scheduled_for AT TIME ZONE 'UTC')::date,
    (v_task.due_at AT TIME ZONE 'UTC')::date,
    CURRENT_DATE
  );

  FOR v_t IN
    SELECT * FROM public.tasks
     WHERE deleted_at IS NULL
       AND (
         (_scope = 'single' AND id = _task_id)
         OR (
           _scope = 'future'
           AND recurrence_id = v_task.recurrence_id
           AND COALESCE(
                 recurrence_date,
                 (scheduled_for AT TIME ZONE 'UTC')::date,
                 (due_at AT TIME ZONE 'UTC')::date
               ) >= v_cutoff
         )
       )
     ORDER BY recurrence_date NULLS LAST
     FOR UPDATE
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.time_entries WHERE task_id = v_t.id)
        OR EXISTS (SELECT 1 FROM public.task_documents WHERE task_id = v_t.id)
      INTO v_history;

    IF v_history OR v_t.status IN ('em_andamento', 'concluido') THEN
      IF v_t.status IN ('concluido', 'cancelado', 'ausente') THEN
        v_kept := v_kept + 1;
        CONTINUE;
      END IF;

      SELECT id INTO v_open FROM public.time_entries
       WHERE task_id = v_t.id AND ended_at IS NULL AND voided_at IS NULL
       LIMIT 1;
      IF v_open IS NOT NULL THEN
        IF _scope = 'single' THEN
          RAISE EXCEPTION 'TASK_HAS_OPEN_PUNCH: Existe um ponto aberto nesta tarefa. Encerre ou regularize o ponto antes de continuar.';
        END IF;
        v_kept := v_kept + 1;
        CONTINUE;
      END IF;

      PERFORM set_config('omnibiz.task_rpc', 'on', true);
      UPDATE public.tasks
         SET status = 'cancelado',
             cancelled_at = now(),
             cancelled_by = v_uid,
             cancellation_reason = COALESCE(v_reason, 'Exclusao de serie recorrente'),
             updated_at = now()
       WHERE id = v_t.id;
      PERFORM set_config('omnibiz.task_rpc', 'off', true);

      INSERT INTO public.task_audit_events (
        company_id, task_id, actor_user_id, actor_role, event,
        previous_status, new_status, previous_archived, new_archived, reason,
        recurrence_id, occurrence_date, action_scope
      ) VALUES (
        v_t.company_id, v_t.id, v_uid, v_role, 'cancel',
        v_t.status, 'cancelado', v_t.archived_at IS NOT NULL, v_t.archived_at IS NOT NULL,
        COALESCE(v_reason, 'Exclusao de serie recorrente'),
        v_t.recurrence_id, v_t.recurrence_date, _scope
      );

      v_cancelled := v_cancelled + 1;
    ELSE
      PERFORM set_config('omnibiz.task_rpc', 'on', true);
      UPDATE public.tasks
         SET deleted_at = now(),
             deleted_by = v_uid,
             updated_at = now()
       WHERE id = v_t.id;
      PERFORM set_config('omnibiz.task_rpc', 'off', true);

      DELETE FROM public.notifications
       WHERE task_id = v_t.id AND read_at IS NULL;

      INSERT INTO public.task_audit_events (
        company_id, task_id, actor_user_id, actor_role, event,
        previous_status, new_status, previous_archived, new_archived, reason,
        recurrence_id, occurrence_date, action_scope
      ) VALUES (
        v_t.company_id, v_t.id, v_uid, v_role, 'delete',
        v_t.status, v_t.status, v_t.archived_at IS NOT NULL, v_t.archived_at IS NOT NULL,
        v_reason, v_t.recurrence_id, v_t.recurrence_date, _scope
      );

      v_deleted := v_deleted + 1;
    END IF;
  END LOOP;

  IF _scope = 'future' THEN
    UPDATE public.task_recurrences
       SET status = 'ended',
           ended_at = now(),
           ended_reason = COALESCE(v_reason, 'Exclusao de ocorrencias futuras'),
           end_date = GREATEST(v_cutoff - 1, start_date),
           updated_at = now()
     WHERE id = v_task.recurrence_id;
    v_series_ended := true;

    INSERT INTO public.task_audit_events (
      company_id, task_id, actor_user_id, actor_role, event,
      previous_status, new_status, previous_archived, new_archived, reason,
      recurrence_id, occurrence_date, action_scope
    ) VALUES (
      v_task.company_id, v_task.id, v_uid, v_role, 'series_end',
      v_task.status, v_task.status, v_task.archived_at IS NOT NULL, v_task.archived_at IS NOT NULL,
      COALESCE(v_reason, 'Serie encerrada na data de corte'),
      v_task.recurrence_id, v_cutoff, _scope
    );
  END IF;

  RETURN jsonb_build_object(
    'scope', _scope,
    'cutoff_date', v_cutoff,
    'deleted', v_deleted,
    'cancelled', v_cancelled,
    'kept', v_kept,
    'series_ended', v_series_ended
  );
END
$function$;