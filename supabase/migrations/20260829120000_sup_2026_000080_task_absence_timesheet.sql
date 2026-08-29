-- SUP-2026-000080 — falta por ocorrência e reflexo na folha de ponto.
-- Aditivo: reutiliza tasks, task_audit_events e o snapshot canónico.
-- Não cria time_entry, não altera dados históricos e não altera RLS/RBAC.

CREATE OR REPLACE FUNCTION public.task_mark_absent(
  _task_id uuid,
  _reason text,
  _justified boolean DEFAULT false
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_manager boolean;
  v_open_id uuid;
  v_prev public.task_status;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_occurrence_date date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da falta obrigatorio'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode marcar falta'; END IF;

  IF v_task.assigned_to IS NULL THEN
    RAISE EXCEPTION 'Tarefa sem responsavel nao permite marcacao de falta';
  END IF;

  IF v_task.status NOT IN ('pendente','autorizado') THEN
    RAISE EXCEPTION 'Somente tarefa pendente ou autorizada pode virar falta';
  END IF;

  v_occurrence_date := COALESCE(
    v_task.recurrence_date,
    v_task.scheduled_for::date,
    v_task.due_at::date
  );
  IF v_occurrence_date IS NULL THEN
    RAISE EXCEPTION 'Tarefa sem data nao permite marcacao de falta';
  END IF;

  -- Respeita a regra operacional existente: horário + 1h; sem horário, dia seguinte.
  IF v_task.scheduled_for IS NOT NULL THEN
    IF now() < v_task.scheduled_for + interval '1 hour' THEN
      RAISE EXCEPTION 'A tarefa ainda nao atingiu o horario permitido para marcacao de falta';
    END IF;
  ELSIF CURRENT_DATE <= v_occurrence_date THEN
    RAISE EXCEPTION 'Tarefa sem horario so pode virar falta no dia seguinte';
  END IF;

  SELECT id INTO v_open_id
    FROM public.time_entries
   WHERE task_id = v_task.id
     AND ended_at IS NULL
     AND voided_at IS NULL
   LIMIT 1;
  IF v_open_id IS NOT NULL THEN
    RAISE EXCEPTION 'TASK_HAS_OPEN_PUNCH';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.time_entries
     WHERE task_id = v_task.id
       AND ended_at IS NOT NULL
       AND voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TASK_HAS_COMPLETED_PUNCH';
  END IF;

  v_prev := v_task.status;

  UPDATE public.tasks
     SET status = 'ausente',
         marked_absent_at = now(),
         marked_absent_by = v_uid,
         absence_reason = v_reason,
         absence_justified = COALESCE(_justified, false),
         absence_source = 'manual'
   WHERE id = _task_id
   RETURNING * INTO v_task;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, reason,
    recurrence_id, occurrence_date, action_scope
  ) VALUES (
    v_task.company_id, v_task.id, v_uid, 'manager', 'absence',
    v_prev, 'ausente',
    CASE WHEN COALESCE(_justified, false) THEN 'Falta justificada: ' ELSE 'Falta injustificada: ' END || v_reason,
    v_task.recurrence_id, v_occurrence_date, 'single'
  );

  RETURN v_task;
END
$function$;

REVOKE ALL ON FUNCTION public.task_mark_absent(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.task_mark_absent(uuid, text, boolean) TO authenticated;

-- Compatibilidade: qualquer chamada legada de task_transition para ausência
-- passa pelo fluxo canónico acima, sem permitir uma segunda implementação.
CREATE OR REPLACE FUNCTION public.task_transition(_task_id uuid, _action text, _reason text DEFAULT NULL::text)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_manager boolean;
  v_is_assignee boolean;
  v_open_id uuid;
  v_punch_user uuid;
  v_started timestamptz;
  v_paused timestamptz;
  v_resumed timestamptz;
  v_total_sec numeric;
  v_pause_sec numeric;
  v_prev_status public.task_status;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := v_task.assigned_to = v_uid;

  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissao para esta tarefa';
  END IF;

  IF _action = 'marcar_ausente' THEN
    RETURN public.task_mark_absent(_task_id, v_reason, false);
  END IF;

  IF _action = 'autorizar' THEN
    IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode autorizar'; END IF;
    IF v_task.status <> 'pendente' THEN RAISE EXCEPTION 'So e possivel autorizar tarefa pendente'; END IF;
    UPDATE public.tasks SET status = 'autorizado', authorized_at = now(), authorized_by = v_uid
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'iniciar' THEN
    IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissao'; END IF;

    v_punch_user := v_task.assigned_to;
    IF v_punch_user IS NULL THEN
      RAISE EXCEPTION 'Tarefa precisa de um responsavel antes de iniciar';
    END IF;

    SELECT id INTO v_open_id FROM public.time_entries
     WHERE user_id = v_punch_user AND task_id = v_task.id AND ended_at IS NULL
     LIMIT 1;
    IF v_task.status = 'em_andamento' AND v_open_id IS NOT NULL THEN
      RETURN v_task;
    END IF;

    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Tarefa nao pode ser iniciada no status atual: %', v_task.status;
    END IF;

    SELECT id INTO v_open_id FROM public.time_entries
     WHERE user_id = v_punch_user AND ended_at IS NULL
     LIMIT 1;
    IF v_open_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ja existe um ponto aberto para este usuario. Conclua-o antes de iniciar outra tarefa.';
    END IF;

    UPDATE public.tasks SET status = 'em_andamento', started_at = COALESCE(started_at, now())
      WHERE id = _task_id RETURNING * INTO v_task;

    INSERT INTO public.time_entries (company_id, task_id, user_id, started_at)
    VALUES (v_task.company_id, v_task.id, v_punch_user, now());

  ELSIF _action = 'recusar' THEN
    IF NOT v_is_assignee THEN RAISE EXCEPTION 'Apenas o responsavel pode recusar a tarefa'; END IF;
    IF v_task.status = 'cancelado' AND v_task.refused_by = v_uid THEN RETURN v_task; END IF;

    SELECT id INTO v_open_id FROM public.time_entries
     WHERE task_id = v_task.id AND ended_at IS NULL LIMIT 1;
    IF v_open_id IS NOT NULL THEN
      RAISE EXCEPTION 'Esta tarefa ja foi iniciada. Finalize ou regularize o ponto antes de recusa-la.';
    END IF;
    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode ser recusada';
    END IF;
    IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da recusa obrigatorio'; END IF;

    v_prev_status := v_task.status;
    UPDATE public.tasks
       SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid,
           refusal_reason = v_reason, refused_at = now(), refused_by = v_uid
     WHERE id = _task_id RETURNING * INTO v_task;

    INSERT INTO public.task_refusals (
      company_id, task_id, employee_id, actor_id, reason, previous_status, new_status
    ) VALUES (v_task.company_id, v_task.id, v_uid, v_uid, v_reason, v_prev_status, 'cancelado');

  ELSIF _action IN ('concluir','cancelar') THEN
    IF _action = 'concluir' THEN
      IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissao'; END IF;
      IF v_task.status <> 'em_andamento' THEN
        RAISE EXCEPTION 'Apenas tarefa em andamento pode ser concluida';
      END IF;
      UPDATE public.tasks SET status = 'concluido', completed_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSE
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode cancelar'; END IF;
      IF v_task.status IN ('concluido','cancelado','ausente') THEN
        RAISE EXCEPTION 'Tarefa ja finalizada';
      END IF;
      UPDATE public.tasks SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid
        WHERE id = _task_id RETURNING * INTO v_task;
    END IF;

    FOR v_open_id, v_started, v_paused, v_resumed IN
      SELECT id, started_at, paused_at, resumed_at
        FROM public.time_entries
       WHERE task_id = v_task.id AND ended_at IS NULL
    LOOP
      v_pause_sec := 0;
      IF v_paused IS NOT NULL AND v_resumed IS NULL THEN
        v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_paused)));
      ELSIF v_paused IS NOT NULL AND v_resumed IS NOT NULL THEN
        v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_resumed - v_paused)));
      END IF;
      v_total_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_started)) - v_pause_sec);

      UPDATE public.time_entries
         SET ended_at = now(), effective_minutes = public.effective_minutes_round(v_total_sec, 0)
       WHERE id = v_open_id;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Acao invalida: %', _action;
  END IF;

  RETURN v_task;
END
$function$;

REVOKE ALL ON FUNCTION public.task_transition(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_transition(uuid, text, text) TO authenticated;

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
  ), absent_tasks AS (
    SELECT
      t.id AS task_id,
      t.title,
      t.client_id,
      COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) AS work_date
    FROM public.tasks t
    WHERE t.company_id = _company_id
      AND t.assigned_to = _employee_id
      AND t.status = 'ausente'
      AND t.deleted_at IS NULL
      AND COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) >= v_from
      AND COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) < v_to
  ), absence_days AS (
    SELECT
      a.work_date,
      COUNT(*)::int AS absence_task_count,
      jsonb_agg(
        jsonb_build_object(
          'task_id', a.task_id,
          'title', a.title,
          'client_id', a.client_id,
          'work_date', a.work_date
        ) ORDER BY a.task_id
      ) AS absence_tasks
    FROM absent_tasks a
    GROUP BY a.work_date
  ), day_rows AS (
    SELECT
      COALESCE(p.work_date, v.work_date, a.work_date) AS work_date,
      p.first_in,
      p.last_out,
      COALESCE(p.worked_minutes, 0) AS worked_minutes,
      COALESCE(p.break_minutes, 0) AS break_minutes,
      COALESCE(p.entries_count, 0) AS entries_count,
      p.work_date IS NOT NULL AS has_entry,
      v.work_date IS NOT NULL AS is_vacation,
      a.work_date IS NOT NULL AS has_absence,
      COALESCE(a.absence_task_count, 0) AS absence_task_count,
      COALESCE(a.absence_tasks, '[]'::jsonb) AS absence_tasks
    FROM per_day p
    FULL OUTER JOIN vacation_days v ON v.work_date = p.work_date
    FULL OUTER JOIN absence_days a ON a.work_date = COALESCE(p.work_date, v.work_date)
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
        'vacation_status', CASE WHEN d.is_vacation THEN 'aprovado' ELSE NULL END,
        'absence_task_count', d.absence_task_count,
        'absence_tasks', d.absence_tasks,
        'attendance_status', CASE
          WHEN d.has_absence AND d.has_entry THEN 'mixed'
          WHEN d.has_absence AND d.is_vacation THEN 'vacation_absence'
          WHEN d.has_absence THEN 'absence'
          WHEN d.is_vacation THEN 'vacation'
          ELSE 'work'
        END
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
