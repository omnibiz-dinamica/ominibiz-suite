-- SUP-2026-000093
-- Consolida o relogio operacional das tarefas no fuso da empresa.
-- Repara apenas ausencias automaticas prematuras; faltas manuais/funcionario
-- e dados historicos sem evidencia automatica permanecem intactos.

UPDATE public.tasks t
   SET status = 'pendente',
       marked_absent_at = NULL,
       absence_source = NULL,
       updated_at = now()
  FROM public.companies c
 WHERE c.id = t.company_id
   AND t.status = 'ausente'
   AND (
     t.absence_source = 'automatica'
     OR (
       t.absence_source IS NULL
       AND t.absence_reason IS NULL
       AND t.marked_absent_by IS NULL
     )
   )
   AND t.scheduled_for IS NOT NULL
   AND (
     now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'UTC')
   ) < (
     (t.scheduled_for AT TIME ZONE 'UTC') + interval '24 hours'
   );

-- O responsavel pode iniciar uma tarefa que ficou com status ausente por uma
-- versao antiga do sweep, desde que ainda nao tenha atingido o prazo canonico.
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
  v_timezone text;
  v_legacy_auto_absence boolean;
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

  -- Corrige a linha antiga dentro da propria transacao de inicio. A ausencia
  -- manual ou registrada pelo funcionario nunca entra nesta normalizacao.
  IF _action = 'iniciar' AND v_task.status = 'ausente' THEN
    v_legacy_auto_absence := v_task.absence_source = 'automatica'
      OR (
        v_task.absence_source IS NULL
        AND v_task.absence_reason IS NULL
        AND v_task.marked_absent_by IS NULL
      );
    IF v_legacy_auto_absence AND v_task.scheduled_for IS NOT NULL THEN
      SELECT COALESCE(NULLIF(c.timezone, ''), 'UTC') INTO v_timezone
        FROM public.companies c WHERE c.id = v_task.company_id;
      IF (
        now() AT TIME ZONE COALESCE(v_timezone, 'UTC')
      ) < (
        (v_task.scheduled_for AT TIME ZONE 'UTC') + interval '24 hours'
      ) THEN
        UPDATE public.tasks
           SET status = 'pendente', marked_absent_at = NULL,
               absence_source = NULL, updated_at = now()
         WHERE id = v_task.id
         RETURNING * INTO v_task;
      END IF;
    END IF;
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

-- O prazo da falta manual segue o mesmo horario civil da empresa, com a
-- tolerancia operacional existente de uma hora.
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
  v_is_assignee boolean;
  v_open_id uuid;
  v_prev public.task_status;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_occurrence_date date;
  v_timezone text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da falta obrigatorio'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := v_task.assigned_to = v_uid;
  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissao para marcar falta nesta tarefa';
  END IF;
  IF v_task.assigned_to IS NULL THEN
    RAISE EXCEPTION 'Tarefa sem responsavel nao permite marcacao de falta';
  END IF;
  IF v_task.status NOT IN ('pendente','autorizado') THEN
    RAISE EXCEPTION 'Somente tarefa pendente ou autorizada pode virar falta';
  END IF;

  v_occurrence_date := COALESCE(v_task.recurrence_date, v_task.scheduled_for::date, v_task.due_at::date);
  IF v_occurrence_date IS NULL THEN
    RAISE EXCEPTION 'Tarefa sem data nao permite marcacao de falta';
  END IF;

  SELECT COALESCE(NULLIF(c.timezone, ''), 'UTC') INTO v_timezone
    FROM public.companies c WHERE c.id = v_task.company_id;
  IF v_task.scheduled_for IS NOT NULL THEN
    IF (now() AT TIME ZONE COALESCE(v_timezone, 'UTC')) <
       ((v_task.scheduled_for AT TIME ZONE 'UTC') + interval '1 hour') THEN
      RAISE EXCEPTION 'A tarefa ainda nao atingiu o horario permitido para marcacao de falta';
    END IF;
  ELSIF (now() AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date <= v_occurrence_date THEN
    RAISE EXCEPTION 'Tarefa sem horario so pode virar falta no dia seguinte';
  END IF;

  SELECT id INTO v_open_id FROM public.time_entries
   WHERE task_id = v_task.id AND ended_at IS NULL AND voided_at IS NULL LIMIT 1;
  IF v_open_id IS NOT NULL THEN RAISE EXCEPTION 'TASK_HAS_OPEN_PUNCH'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.time_entries
     WHERE task_id = v_task.id AND ended_at IS NOT NULL AND voided_at IS NULL
  ) THEN RAISE EXCEPTION 'TASK_HAS_COMPLETED_PUNCH'; END IF;

  v_prev := v_task.status;
  UPDATE public.tasks
     SET status = 'ausente', marked_absent_at = now(), marked_absent_by = v_uid,
         absence_reason = v_reason, absence_justified = COALESCE(_justified, false),
         absence_source = CASE WHEN v_is_manager THEN 'manual' ELSE 'employee' END
   WHERE id = _task_id RETURNING * INTO v_task;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, reason, recurrence_id, occurrence_date, action_scope
  ) VALUES (
    v_task.company_id, v_task.id, v_uid,
    CASE WHEN v_is_manager THEN 'manager' ELSE 'employee' END,
    'absence', v_prev, 'ausente',
    CASE WHEN COALESCE(_justified, false) THEN 'Falta justificada: ' ELSE 'Falta injustificada: ' END || v_reason,
    v_task.recurrence_id, v_occurrence_date, 'single'
  );

  RETURN v_task;
END
$function$;

REVOKE ALL ON FUNCTION public.task_mark_absent(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.task_mark_absent(uuid, text, boolean) TO authenticated;
