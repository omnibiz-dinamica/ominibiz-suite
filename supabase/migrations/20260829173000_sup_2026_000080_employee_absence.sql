-- SUP-2026-000080 — permitir que o responsável registre falta na própria tarefa.
-- A permissão é limitada ao UUID autenticado e à tarefa atribuída a ele.
-- Gestores mantêm o fluxo existente. Não cria time_entry nem altera RLS.

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

  v_occurrence_date := COALESCE(
    v_task.recurrence_date,
    v_task.scheduled_for::date,
    v_task.due_at::date
  );
  IF v_occurrence_date IS NULL THEN
    RAISE EXCEPTION 'Tarefa sem data nao permite marcacao de falta';
  END IF;

  -- Horário + 1h; sem horário, somente no dia seguinte.
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
         absence_source = CASE WHEN v_is_manager THEN 'manual' ELSE 'employee' END
   WHERE id = _task_id
   RETURNING * INTO v_task;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, reason,
    recurrence_id, occurrence_date, action_scope
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
