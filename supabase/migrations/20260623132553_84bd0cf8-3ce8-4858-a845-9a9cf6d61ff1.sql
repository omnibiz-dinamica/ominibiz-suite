-- Archival columns + RPC for tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_company_archived
  ON public.tasks(company_id, archived_at) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.task_archive(_task_id uuid, _archive boolean DEFAULT true)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada';
  END IF;

  IF v_task.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tarefa excluída não pode ser arquivada';
  END IF;

  IF NOT (public.is_super_admin(v_uid) OR public.is_company_manager(v_uid, v_task.company_id)) THEN
    RAISE EXCEPTION 'Apenas gestor ou super admin pode arquivar tarefas';
  END IF;

  IF _archive THEN
    IF v_task.archived_at IS NOT NULL THEN
      RETURN v_task;
    END IF;
    -- Só arquivar tarefas em estado terminal (concluído, cancelado, ausente)
    IF v_task.status NOT IN ('concluido','cancelado','ausente') THEN
      RAISE EXCEPTION 'Apenas tarefas concluídas, canceladas ou ausentes podem ser arquivadas';
    END IF;
    UPDATE public.tasks
       SET archived_at = now(),
           archived_by = v_uid,
           updated_at  = now()
     WHERE id = _task_id
     RETURNING * INTO v_task;
  ELSE
    UPDATE public.tasks
       SET archived_at = NULL,
           archived_by = NULL,
           updated_at  = now()
     WHERE id = _task_id
     RETURNING * INTO v_task;
  END IF;

  RETURN v_task;
END
$$;

GRANT EXECUTE ON FUNCTION public.task_archive(uuid, boolean) TO authenticated;