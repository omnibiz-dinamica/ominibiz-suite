
-- 1. Novos campos operacionais
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_id UUID NULL,
  ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS authorized_by UUID NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID NULL,
  ADD COLUMN IF NOT EXISTS marked_absent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS absence_grace_minutes INT NOT NULL DEFAULT 15;

CREATE INDEX IF NOT EXISTS idx_tasks_company_status ON public.tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON public.tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_for ON public.tasks(scheduled_for) WHERE status IN ('pendente','autorizado');

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_tasks_touch_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_touch_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Máquina de estados centralizada
CREATE OR REPLACE FUNCTION public.task_transition(_task_id UUID, _action TEXT)
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := (v_task.assigned_to = v_uid);

  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissão para esta tarefa';
  END IF;

  -- Transições permitidas
  IF _action = 'autorizar' THEN
    IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode autorizar'; END IF;
    IF v_task.status <> 'pendente' THEN RAISE EXCEPTION 'Só é possível autorizar tarefa pendente'; END IF;
    UPDATE public.tasks SET status = 'autorizado', authorized_at = now(), authorized_by = v_uid
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'iniciar' THEN
    IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Tarefa não pode ser iniciada no status atual: %', v_task.status;
    END IF;
    UPDATE public.tasks SET status = 'em_andamento', started_at = COALESCE(started_at, now())
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'concluir' THEN
    IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF v_task.status <> 'em_andamento' THEN
      RAISE EXCEPTION 'Apenas tarefa em andamento pode ser concluída';
    END IF;
    UPDATE public.tasks SET status = 'concluido', completed_at = now()
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'cancelar' THEN
    IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode cancelar'; END IF;
    IF v_task.status IN ('concluido','cancelado','ausente') THEN
      RAISE EXCEPTION 'Tarefa já finalizada';
    END IF;
    UPDATE public.tasks SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'marcar_ausente' THEN
    IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode marcar ausência'; END IF;
    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode virar ausente';
    END IF;
    UPDATE public.tasks SET status = 'ausente', marked_absent_at = now()
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSE
    RAISE EXCEPTION 'Ação inválida: %', _action;
  END IF;

  RETURN v_task;
END $$;

-- 3. Varredura de ausentes (executada por evento, nunca em loop)
CREATE OR REPLACE FUNCTION public.tasks_sweep_absent(_company_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  WITH upd AS (
    UPDATE public.tasks t
       SET status = 'ausente', marked_absent_at = now()
     WHERE t.status IN ('pendente','autorizado')
       AND t.scheduled_for IS NOT NULL
       AND t.scheduled_for + make_interval(mins => t.absence_grace_minutes) < now()
       AND (
         public.is_super_admin(v_uid)
         OR (_company_id IS NOT NULL AND t.company_id = _company_id AND public.is_company_manager(v_uid, t.company_id))
         OR (_company_id IS NULL AND public.is_company_manager(v_uid, t.company_id))
       )
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;
  RETURN COALESCE(v_count, 0);
END $$;

-- 4. Realtime apenas para sincronizar UI
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tasks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks';
  END IF;
END $$;
