-- SUP-2026-000142: persist completion notes and enrich the canonical task notification.
-- The note remains in task_audit_events; this migration does not add a second source.

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
  v_employee text;
  v_completion_at timestamptz;
  v_title text;
  v_body text;
  v_metadata jsonb;
  v_mgr record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_note IS NULL THEN RAISE EXCEPTION 'Observacao vazia'; END IF;
  IF char_length(v_note) > 2000 THEN RAISE EXCEPTION 'Observacao excede 2000 caracteres'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;
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

  -- Idempotencia: retries reutilizam o evento e ainda reparam a notificacao.
  SELECT * INTO v_existing
    FROM public.task_audit_events
   WHERE task_id = v_task.id
     AND event = 'completion_note'
     AND actor_user_id = v_uid
     AND reason = v_note
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    v_event := v_existing;
  ELSE
    INSERT INTO public.task_audit_events (
      company_id, task_id, actor_user_id, actor_role, event,
      previous_status, new_status, previous_archived, new_archived, reason
    ) VALUES (
      v_task.company_id, v_task.id, v_uid, v_role, 'completion_note',
      'em_andamento', 'concluido', v_task.archived_at IS NOT NULL, v_task.archived_at IS NOT NULL, v_note
    )
    RETURNING * INTO v_event;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'Funcionario')
    INTO v_employee
    FROM public.profiles p
   WHERE p.id = v_uid;
  v_employee := COALESCE(v_employee, 'Funcionario');
  v_completion_at := COALESCE(v_task.completed_at, v_event.created_at, now());
  v_title := 'Tarefa concluida com observacao';
  v_body := v_employee || ' concluiu a tarefa "' || v_task.title || '". '
    || 'Observacao: ' || v_note || '. '
    || 'Concluida em: ' || to_char(v_completion_at, 'DD/MM/YYYY HH24:MI') || '.';
  v_metadata := jsonb_build_object(
    'completion_note', v_note,
    'completion_note_by', v_uid,
    'completion_note_at', v_completion_at,
    'employee_name', v_employee,
    'client_id', v_task.client_id,
    'scheduled_for', v_task.scheduled_for,
    'task_id', v_task.id,
    'task_title', v_task.title,
    'link', '/app/tarefas?task=' || v_task.id::text
  );

  -- A conclusao ja pode ter criado uma notificacao. Atualiza-a em vez de duplicar.
  UPDATE public.notifications n
     SET title = v_title,
         body = v_body,
         priority = 'media',
         metadata = COALESCE(n.metadata, '{}'::jsonb) || v_metadata
   WHERE n.company_id = v_task.company_id
     AND n.task_id = v_task.id
     AND n.event = 'task_completed';

  -- Se a notificacao de conclusao nao existia, _notify cria uma por gestor e
  -- preserva a heranca para SuperAdmin definida no helper central.
  FOR v_mgr IN
    SELECT DISTINCT user_id
      FROM public.user_roles
     WHERE company_id = v_task.company_id
       AND role IN ('manager', 'owner')
       AND user_id <> v_uid
  LOOP
    PERFORM public._notify(
      v_task.company_id, v_mgr.user_id, v_task.id,
      'task_completed', v_title, v_body, 'media', v_metadata
    );
  END LOOP;

  RETURN v_event;
END;
$function$;

REVOKE ALL ON FUNCTION public.task_add_completion_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_add_completion_note(uuid, text) TO authenticated;
