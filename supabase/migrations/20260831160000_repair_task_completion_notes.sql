-- SUP-2026-000112: repair the completion-note contract after schema drift.
-- Additive and idempotent: no task, point or historical audit row is changed.
ALTER TABLE public.task_audit_events DROP CONSTRAINT IF EXISTS task_audit_events_event_check;
ALTER TABLE public.task_audit_events
  ADD CONSTRAINT task_audit_events_event_check
  CHECK (event IN ('cancel','archive','unarchive','absence','delete','series_end','completion_note','no_start_reason'));

CREATE OR REPLACE FUNCTION public.task_add_completion_note(_task_id uuid, _note text)
RETURNS public.task_audit_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_existing public.task_audit_events%ROWTYPE;
  v_event public.task_audit_events%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(_note, '')), '');
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Observacao vazia';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Observacao excede 2000 caracteres';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa nao encontrada';
  END IF;
  IF v_task.status <> 'concluido' THEN
    RAISE EXCEPTION 'A observacao de conclusao exige tarefa concluida';
  END IF;

  IF public.is_super_admin(v_uid) THEN
    v_role := 'super_admin';
  ELSIF public.is_company_manager(v_uid, v_task.company_id) THEN
    v_role := 'manager';
  ELSIF v_task.assigned_to = v_uid THEN
    v_role := 'employee';
  ELSE
    RAISE EXCEPTION 'Sem permissao para registrar observacao nesta tarefa';
  END IF;

  SELECT * INTO v_existing
    FROM public.task_audit_events
   WHERE task_id = v_task.id
     AND event = 'completion_note'
     AND actor_user_id = v_uid
     AND reason = v_note
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, previous_archived, new_archived, reason
  ) VALUES (
    v_task.company_id, v_task.id, v_uid, v_role, 'completion_note',
    'em_andamento', 'concluido', v_task.archived_at IS NOT NULL, v_task.archived_at IS NOT NULL, v_note
  )
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$function$;

REVOKE ALL ON FUNCTION public.task_add_completion_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_add_completion_note(uuid, text) TO authenticated;
