-- 1) Helper central: cliente da tarefa em modo de apontamento manual
CREATE OR REPLACE FUNCTION public.task_timing_is_manual(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT c.timing_mode = 'manual' FROM public.clients c WHERE c.id = _client_id),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.task_timing_is_manual(uuid) TO authenticated, service_role;

-- 2) Sweep de ausencia: nunca aplicar a clientes manuais
CREATE OR REPLACE FUNCTION public.tasks_sweep_absent(_company_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  WITH upd AS (
    UPDATE public.tasks t
       SET status = 'ausente',
           marked_absent_at = now(),
           updated_at = now()
     WHERE t.status IN ('pendente','autorizado')
       AND t.deleted_at IS NULL
       AND t.assigned_to IS NOT NULL
       AND NOT public.task_timing_is_manual(t.client_id)
       AND public.task_absence_allowed_at(t.scheduled_for, t.recurrence_date, t.due_at) IS NOT NULL
       AND now() >= public.task_absence_allowed_at(t.scheduled_for, t.recurrence_date, t.due_at)
       AND (
         public.is_super_admin(v_uid)
         OR (_company_id IS NOT NULL AND t.company_id = _company_id AND public.is_company_manager(v_uid, t.company_id))
         OR (_company_id IS NULL AND public.is_company_manager(v_uid, t.company_id))
       )
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN COALESCE(v_count, 0);
END
$function$;

-- 3) Sweep de atraso (notificacoes): nunca aplicar a clientes manuais
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
      AND NOT public.task_timing_is_manual(t.client_id)
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

-- 4) Correcao de registros existentes (mantendo historico na descricao)
WITH fixed AS (
  UPDATE public.tasks t
     SET status = 'pendente',
         description = COALESCE(t.description || E'\n\n', '')
           || '[Auditoria ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
           || '] Ausencia automatica revertida: cliente em modo de apontamento manual (registada em '
           || COALESCE(to_char(t.marked_absent_at, 'YYYY-MM-DD HH24:MI'), 'data desconhecida') || ').',
         marked_absent_at = NULL,
         updated_at = now()
   WHERE t.status = 'ausente'
     AND t.deleted_at IS NULL
     AND public.task_timing_is_manual(t.client_id)
  RETURNING 1
)
SELECT count(*) FROM fixed;