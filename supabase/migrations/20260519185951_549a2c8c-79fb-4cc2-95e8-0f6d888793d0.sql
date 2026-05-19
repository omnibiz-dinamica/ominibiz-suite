
-- RPC central para solicitar (re)autorização de uma tarefa.
-- Funcionário ou gestor pode chamar quando a tarefa está 'ausente'
-- (perdeu o slot) ou 'cancelado' (rejeitada). A tarefa volta a 'pendente'
-- para que o gestor decida novamente. Toda regra vive no banco.
CREATE OR REPLACE FUNCTION public.task_request_authorization(_task_id uuid, _note text DEFAULT NULL)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_uid UUID := auth.uid();
  v_is_manager BOOLEAN;
  v_is_assignee BOOLEAN;
  v_mgr RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := (v_task.assigned_to = v_uid);

  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissão para solicitar autorização';
  END IF;

  IF v_task.status NOT IN ('ausente','cancelado') THEN
    RAISE EXCEPTION 'Só é possível solicitar autorização de tarefa ausente ou rejeitada';
  END IF;

  UPDATE public.tasks
     SET status = 'pendente',
         marked_absent_at = NULL,
         cancelled_at = NULL,
         cancelled_by = NULL,
         late_notified_at = NULL,
         notes = COALESCE(notes,'') ||
                 CASE WHEN _note IS NOT NULL
                      THEN E'\n[reautorização solicitada] ' || _note
                      ELSE E'\n[reautorização solicitada]' END
   WHERE id = _task_id
   RETURNING * INTO v_task;

  -- Notifica gestores da empresa
  FOR v_mgr IN
    SELECT DISTINCT user_id FROM public.user_roles
     WHERE company_id = v_task.company_id AND role IN ('manager','super_admin')
  LOOP
    PERFORM public._notify(
      v_task.company_id, v_mgr.user_id, v_task.id,
      'task_authorization_requested', 'Solicitação de autorização',
      v_task.title, 'alta',
      jsonb_build_object('requested_by', v_uid));
  END LOOP;

  RETURN v_task;
END $$;
