ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS schedule_change_requested_time time;
ALTER TABLE public.task_refusals ADD COLUMN IF NOT EXISTS schedule_change_requested_time time;
ALTER TABLE public.task_audit_events ADD COLUMN IF NOT EXISTS schedule_change_requested_time time;

DROP FUNCTION IF EXISTS public.task_cancel_with_schedule_request(uuid, text, date, boolean, uuid);
CREATE OR REPLACE FUNCTION public.task_cancel_with_schedule_request(
  _task_id uuid,
  _reason text,
  _requested_date date,
  _needs_reassignment boolean,
  _suggested_employee_id uuid DEFAULT NULL,
  _requested_time time DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_result public.tasks%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF _requested_date IS NULL THEN RAISE EXCEPTION 'Nova data desejada obrigatoria'; END IF;
  IF _needs_reassignment IS NULL THEN RAISE EXCEPTION 'Informe se necessita reatribuicao'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  IF NOT (public.is_super_admin(v_uid) OR public.is_company_manager(v_uid, v_task.company_id)) THEN
    RAISE EXCEPTION 'TASK_CANCEL_MANAGER_ONLY: Apenas o gestor pode cancelar a tarefa. O responsavel deve recusar a tarefa.';
  END IF;
  IF v_task.status = 'cancelado' THEN RETURN v_task; END IF;

  IF _suggested_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _suggested_employee_id AND ur.company_id = v_task.company_id
  ) THEN
    RAISE EXCEPTION 'Funcionario sugerido nao pertence a empresa desta tarefa';
  END IF;

  PERFORM set_config('omnibiz.task_rpc', 'on', true);
  UPDATE public.tasks
     SET schedule_change_requested_date = _requested_date,
         schedule_change_requested_time = _requested_time,
         schedule_change_needs_reassignment = _needs_reassignment,
         schedule_change_suggested_employee_id = _suggested_employee_id,
         updated_at = now()
   WHERE id = _task_id;
  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  v_result := public.task_cancel(_task_id, _reason);

  UPDATE public.task_audit_events
     SET schedule_change_requested_date = _requested_date,
         schedule_change_requested_time = _requested_time,
         schedule_change_needs_reassignment = _needs_reassignment,
         schedule_change_suggested_employee_id = _suggested_employee_id
   WHERE id = (
     SELECT id FROM public.task_audit_events
      WHERE task_id = _task_id AND actor_user_id = v_uid AND event = 'cancel'
      ORDER BY created_at DESC LIMIT 1
   );

  RETURN v_result;
END;
$function$;

DROP FUNCTION IF EXISTS public.task_transition_with_schedule_request(uuid, text, text, date, boolean, uuid);
CREATE OR REPLACE FUNCTION public.task_transition_with_schedule_request(
  _task_id uuid,
  _action text,
  _reason text,
  _requested_date date,
  _needs_reassignment boolean,
  _suggested_employee_id uuid DEFAULT NULL,
  _requested_time time DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_result public.tasks%ROWTYPE;
  v_suggested text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF _action <> 'recusar' THEN RAISE EXCEPTION 'Acao invalida para pedido de alteracao'; END IF;
  IF _requested_date IS NULL THEN RAISE EXCEPTION 'Nova data desejada obrigatoria'; END IF;
  IF _needs_reassignment IS NULL THEN RAISE EXCEPTION 'Informe se necessita reatribuicao'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;
  IF v_task.assigned_to <> v_uid THEN
    RAISE EXCEPTION 'Apenas o responsavel pode recusar a tarefa';
  END IF;

  IF _suggested_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _suggested_employee_id AND ur.company_id = v_task.company_id
  ) THEN
    RAISE EXCEPTION 'Funcionario sugerido nao pertence a empresa desta tarefa';
  END IF;

  PERFORM set_config('omnibiz.task_rpc', 'on', true);
  UPDATE public.tasks
     SET schedule_change_requested_date = _requested_date,
         schedule_change_requested_time = _requested_time,
         schedule_change_needs_reassignment = _needs_reassignment,
         schedule_change_suggested_employee_id = _suggested_employee_id,
         updated_at = now()
   WHERE id = _task_id;
  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  v_result := public.task_transition(_task_id, _action, _reason);

  UPDATE public.task_refusals
     SET schedule_change_requested_date = _requested_date,
         schedule_change_requested_time = _requested_time,
         schedule_change_needs_reassignment = _needs_reassignment,
         schedule_change_suggested_employee_id = _suggested_employee_id
   WHERE id = (
     SELECT id FROM public.task_refusals
      WHERE task_id = _task_id AND employee_id = v_uid AND actor_id = v_uid
      ORDER BY created_at DESC LIMIT 1
   );

  SELECT full_name INTO v_suggested FROM public.profiles WHERE id = _suggested_employee_id;

  UPDATE public.notifications n
     SET metadata = COALESCE(n.metadata, '{}'::jsonb) || jsonb_build_object(
           'schedule_change_requested_date', _requested_date,
           'schedule_change_requested_time', _requested_time,
           'schedule_change_needs_reassignment', _needs_reassignment,
           'schedule_change_suggested_employee_id', _suggested_employee_id,
           'schedule_change_suggested_employee_name', v_suggested,
           'link', '/app/tarefas?task=' || _task_id::text
         )
   WHERE n.task_id = _task_id
     AND n.company_id = v_task.company_id
     AND n.created_at > now() - interval '2 minutes';

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.task_cancel_with_schedule_request(uuid, text, date, boolean, uuid, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.task_transition_with_schedule_request(uuid, text, text, date, boolean, uuid, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_cancel_with_schedule_request(uuid, text, date, boolean, uuid, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_transition_with_schedule_request(uuid, text, text, date, boolean, uuid, time) TO authenticated;

NOTIFY pgrst, 'reload schema';