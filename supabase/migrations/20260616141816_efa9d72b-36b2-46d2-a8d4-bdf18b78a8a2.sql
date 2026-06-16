
CREATE OR REPLACE FUNCTION public.task_soft_delete(_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_has_history boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada';
  END IF;

  IF v_task.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tarefa já foi excluída';
  END IF;

  IF NOT (public.is_super_admin(v_uid) OR public.is_company_manager(v_uid, v_task.company_id)) THEN
    RAISE EXCEPTION 'Apenas gestor ou super admin pode excluir tarefas';
  END IF;

  -- Status que possuem execução em curso ou histórico fechado não podem ser excluídos.
  IF v_task.status IN ('em_andamento','concluido') THEN
    RAISE EXCEPTION 'Esta tarefa possui histórico operacional e não pode ser excluída.';
  END IF;

  -- Mesmo em status permitidos (pendente, autorizado, cancelado, ausente),
  -- bloquear se existirem registos operacionais relacionados.
  SELECT
    EXISTS (SELECT 1 FROM public.time_entries WHERE task_id = _task_id)
    OR EXISTS (SELECT 1 FROM public.task_documents WHERE task_id = _task_id)
  INTO v_has_history;

  IF v_has_history THEN
    RAISE EXCEPTION 'Esta tarefa possui histórico operacional e não pode ser excluída.';
  END IF;

  UPDATE public.tasks
     SET deleted_at = now(),
         deleted_by = v_uid,
         updated_at = now()
   WHERE id = _task_id
   RETURNING * INTO v_task;

  -- Remove notificações não lidas associadas para não ficarem órfãs na inbox.
  DELETE FROM public.notifications
   WHERE task_id = _task_id AND read_at IS NULL;

  RETURN v_task;
END
$$;
