-- OmniBiz: edição segura de faltas pelo Gestor/Super Admin.
-- Migration aditiva: não reescreve migrations anteriores nem cria time_entry.

CREATE OR REPLACE FUNCTION public.task_update_absence(_task_id uuid, _reason text, _justified boolean)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_is_manager boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da falta obrigatorio'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;
  v_is_manager := public.is_company_manager(v_uid, v_task.company_id) OR public.is_super_admin(v_uid);
  IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode editar uma falta'; END IF;
  IF v_task.status <> 'ausente' OR v_task.archived_at IS NOT NULL OR v_task.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Somente falta ativa pode ser editada';
  END IF;

  UPDATE public.tasks
     SET absence_reason = v_reason,
         absence_justified = COALESCE(_justified, false),
         updated_at = now()
   WHERE id = v_task.id
   RETURNING * INTO v_task;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event, previous_status, new_status,
    reason, recurrence_id, occurrence_date, action_scope
  ) VALUES (
    v_task.company_id, v_task.id, v_uid, 'manager', 'absence', v_task.status, v_task.status,
    CASE WHEN COALESCE(_justified, false) THEN 'Falta justificada atualizada: ' ELSE 'Falta injustificada atualizada: ' END || v_reason,
    v_task.recurrence_id,
    COALESCE(v_task.recurrence_date, v_task.scheduled_for::date, v_task.due_at::date),
    'single'
  );
  RETURN v_task;
END
$function$;

REVOKE ALL ON FUNCTION public.task_update_absence(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_update_absence(uuid, text, boolean) TO authenticated;
