
-- 1) Columns
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_tasks_not_deleted
  ON public.tasks (company_id)
  WHERE deleted_at IS NULL;

-- 2) Replace SELECT/manage policies to exclude soft-deleted rows
DROP POLICY IF EXISTS "employees view assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "employees update assigned task status" ON public.tasks;
DROP POLICY IF EXISTS "managers manage company tasks" ON public.tasks;
DROP POLICY IF EXISTS "super admin all tasks" ON public.tasks;

CREATE POLICY "employees view assigned tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "employees update assigned task status"
  ON public.tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (assigned_to = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "managers manage company tasks"
  ON public.tasks FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id) AND deleted_at IS NULL)
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin all tasks"
  ON public.tasks FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) AND deleted_at IS NULL)
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 3) Soft delete RPC
CREATE OR REPLACE FUNCTION public.task_soft_delete(_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_has_entries boolean;
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

  IF v_task.status NOT IN ('pendente','autorizado') THEN
    RAISE EXCEPTION 'Esta tarefa possui histórico operacional e não pode ser excluída.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.time_entries WHERE task_id = _task_id)
    INTO v_has_entries;
  IF v_has_entries THEN
    RAISE EXCEPTION 'Esta tarefa possui histórico operacional e não pode ser excluída.';
  END IF;

  UPDATE public.tasks
     SET deleted_at = now(),
         deleted_by = v_uid,
         updated_at = now()
   WHERE id = _task_id
   RETURNING * INTO v_task;

  -- Remove pending notifications tied to this task so they vanish from inboxes
  DELETE FROM public.notifications
   WHERE task_id = _task_id AND read_at IS NULL;

  RETURN v_task;
END
$$;

GRANT EXECUTE ON FUNCTION public.task_soft_delete(uuid) TO authenticated;

-- 4) Keep sweepers from touching deleted rows
CREATE OR REPLACE FUNCTION public.tasks_sweep_absent(_company_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  WITH upd AS (
    UPDATE public.tasks t
       SET status = 'ausente', marked_absent_at = now()
     WHERE t.status IN ('pendente','autorizado')
       AND t.deleted_at IS NULL
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
END $function$;

CREATE OR REPLACE FUNCTION public.notifications_sweep_late(_company_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_task RECORD;
  v_mgr RECORD;
  v_count INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  FOR v_task IN
    SELECT t.* FROM public.tasks t
    WHERE t.status IN ('pendente','autorizado')
      AND t.deleted_at IS NULL
      AND t.scheduled_for IS NOT NULL
      AND t.scheduled_for < now()
      AND t.late_notified_at IS NULL
      AND (
        public.is_super_admin(v_uid)
        OR (_company_id IS NOT NULL AND t.company_id = _company_id AND public.is_company_manager(v_uid, t.company_id))
        OR (_company_id IS NULL AND public.is_company_manager(v_uid, t.company_id))
      )
  LOOP
    UPDATE public.tasks SET late_notified_at = now() WHERE id = v_task.id;

    IF v_task.assigned_to IS NOT NULL THEN
      PERFORM public._notify(v_task.company_id, v_task.assigned_to, v_task.id,
        'task_late', 'Tarefa atrasada', v_task.title, 'alta',
        jsonb_build_object('scheduled_for', v_task.scheduled_for));
    END IF;
    FOR v_mgr IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE company_id = v_task.company_id AND role = 'manager'
    LOOP
      PERFORM public._notify(v_task.company_id, v_mgr.user_id, v_task.id,
        'task_late', 'Tarefa atrasada', v_task.title, 'alta',
        jsonb_build_object('scheduled_for', v_task.scheduled_for));
    END LOOP;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;
