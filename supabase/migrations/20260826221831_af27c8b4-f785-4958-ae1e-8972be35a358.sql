-- ADR-052: constraint de eventos de auditoria de tarefas passa a aceitar
-- 'delete' (exclusão logica de ocorrência) e 'series_end' (encerramento da série).
-- Aditiva: nenhum valor existente é removido; nenhum registo histórico é alterado.
ALTER TABLE public.task_audit_events DROP CONSTRAINT IF EXISTS task_audit_events_event_check;
ALTER TABLE public.task_audit_events
  ADD CONSTRAINT task_audit_events_event_check
  CHECK (event IN ('cancel','archive','unarchive','absence','delete','series_end'));

-- Registo único do encerramento da série no fluxo "esta e todas as futuras".
CREATE OR REPLACE FUNCTION public.task_series_delete(
  _task_id uuid,
  _scope text DEFAULT 'single',
  _reason text DEFAULT NULL
)
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
           end_date = GREATEST(v_cutoff - 1, start_date - 1),
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

REVOKE ALL ON FUNCTION public.task_series_delete(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.task_series_delete(uuid, text, text) TO authenticated;
