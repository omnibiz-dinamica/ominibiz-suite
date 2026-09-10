-- SUP-2026-000144: separate the client's habitual team from backup resources.
-- Existing links remain habitual by default; task history is unchanged.
ALTER TABLE public.client_assignees
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'habitual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_assignees_assignment_type_check'
       AND conrelid = 'public.client_assignees'::regclass
  ) THEN
    ALTER TABLE public.client_assignees
      ADD CONSTRAINT client_assignees_assignment_type_check
      CHECK (assignment_type IN ('habitual', 'recurso'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_assignees_client_type
  ON public.client_assignees(client_id, assignment_type);

COMMENT ON COLUMN public.client_assignees.assignment_type IS
  'habitual = executor default do cliente; recurso = substituição/back-up, sem tarefas automáticas.';

-- Keep the existing RPC name and authorization contract, but make its default
-- result habitual-only. Legacy rows are already normalized by the column default.
DROP FUNCTION IF EXISTS public.client_default_assignees(uuid);
CREATE FUNCTION public.client_default_assignees(_client_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  is_primary boolean,
  is_active boolean,
  assignment_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT c.company_id INTO v_company FROM public.clients c WHERE c.id = _client_id;
  IF v_company IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.is_company_manager(auth.uid(), v_company) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para consultar a equipe do cliente';
  END IF;

  RETURN QUERY
  SELECT ca.user_id,
         p.full_name,
         ca.is_primary,
         COALESCE(p.is_active, true) AS is_active,
         ca.assignment_type
    FROM public.client_assignees ca
    LEFT JOIN public.profiles p ON p.id = ca.user_id
   WHERE ca.client_id = _client_id
     AND ca.company_id = v_company
     AND ca.assignment_type = 'habitual'
     AND COALESCE(p.is_active, true) = true
   ORDER BY ca.is_primary DESC, p.full_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.client_default_assignees(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.client_default_assignees(uuid) TO authenticated;

-- Re-running the completion-note RPC must repair the canonical notification,
-- never create a second task_completed row for the same recipient.
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
  v_client text;
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
      'em_andamento', 'concluido', v_task.archived_at IS NOT NULL,
      v_task.archived_at IS NOT NULL, v_note
    )
    RETURNING * INTO v_event;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'Funcionario')
    INTO v_employee FROM public.profiles p WHERE p.id = v_uid;
  v_employee := COALESCE(v_employee, 'Funcionario');
  SELECT c.name INTO v_client FROM public.clients c
   WHERE c.id = v_task.client_id AND c.company_id = v_task.company_id;
  v_completion_at := COALESCE(v_task.completed_at, v_event.created_at, now());
  v_title := 'TAREFA CONCLUÍDA COM OBSERVAÇÃO';
  v_body := v_employee || ' concluiu a tarefa "' || v_task.title || '".'
    || CASE WHEN v_client IS NOT NULL THEN ' Cliente: ' || v_client || '.' ELSE '' END
    || ' Observação: ' || v_note || '.'
    || ' Concluída em: ' || to_char(v_completion_at, 'DD/MM/YYYY HH24:MI') || '.';
  v_metadata := jsonb_build_object(
    'completion_note', v_note, 'completion_note_by', v_uid,
    'completion_note_at', v_completion_at, 'employee_name', v_employee,
    'client_id', v_task.client_id, 'client_name', v_client,
    'scheduled_for', v_task.scheduled_for, 'task_id', v_task.id,
    'task_title', v_task.title, 'link', '/app/tarefas?task=' || v_task.id::text
  );

  UPDATE public.notifications n
     SET title = v_title,
         body = v_body,
         priority = 'media',
         metadata = COALESCE(n.metadata, '{}'::jsonb) || v_metadata
   WHERE n.company_id = v_task.company_id
     AND n.task_id = v_task.id
     AND n.event = 'task_completed';

  FOR v_mgr IN
    SELECT DISTINCT user_id
      FROM public.user_roles
     WHERE company_id = v_task.company_id
       AND role IN ('manager', 'owner')
       AND user_id <> v_uid
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.company_id = v_task.company_id
         AND n.user_id = v_mgr.user_id
         AND n.task_id = v_task.id
         AND n.event = 'task_completed'
    ) THEN
      PERFORM public._notify(
        v_task.company_id, v_mgr.user_id, v_task.id,
        'task_completed', v_title, v_body, 'media', v_metadata
      );
    ELSE
      UPDATE public.notifications n
         SET title = v_title,
             body = v_body,
             priority = 'media',
             metadata = COALESCE(n.metadata, '{}'::jsonb) || v_metadata
       WHERE n.company_id = v_task.company_id
         AND n.user_id = v_mgr.user_id
         AND n.task_id = v_task.id
         AND n.event = 'task_completed';
    END IF;
  END LOOP;

  RETURN v_event;
END;
$function$;

REVOKE ALL ON FUNCTION public.task_add_completion_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_add_completion_note(uuid, text) TO authenticated;
