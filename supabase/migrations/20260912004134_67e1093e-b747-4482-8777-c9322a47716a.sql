-- ADR-062 — Recusa (funcionário) vs Cancelamento (gestor) + sugestão informativa de reatribuição.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS schedule_change_suggested_employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.task_refusals
  ADD COLUMN IF NOT EXISTS schedule_change_suggested_employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.task_audit_events
  ADD COLUMN IF NOT EXISTS schedule_change_suggested_employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 1) Cancelamento é exclusivo de gestor/owner/super admin. O funcionário recusa.
CREATE OR REPLACE FUNCTION public.task_cancel(_task_id uuid, _reason text)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_is_manager boolean;
  v_is_sa boolean;
  v_open uuid;
  v_prev public.task_status;
  v_reason text := NULLIF(btrim(COALESCE(_reason,'')), '');
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo do cancelamento obrigatorio'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;
  IF v_task.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Tarefa excluida'; END IF;

  v_is_sa := public.is_super_admin(v_uid);
  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);

  IF NOT (v_is_sa OR v_is_manager) THEN
    RAISE EXCEPTION 'TASK_CANCEL_MANAGER_ONLY: Apenas o gestor pode cancelar a tarefa. O responsavel deve recusar a tarefa.';
  END IF;

  IF v_task.status = 'cancelado' THEN
    RETURN v_task;
  END IF;
  IF v_task.status = 'concluido' THEN
    RAISE EXCEPTION 'Tarefa concluida nao pode ser cancelada';
  END IF;

  SELECT id INTO v_open FROM public.time_entries
   WHERE task_id = v_task.id AND ended_at IS NULL AND voided_at IS NULL
   LIMIT 1;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'TASK_HAS_OPEN_PUNCH: Existe um ponto aberto nesta tarefa. Encerre ou regularize o ponto antes de continuar.';
  END IF;

  v_prev := v_task.status;
  v_role := CASE WHEN v_is_sa THEN 'super_admin' ELSE 'manager' END;

  PERFORM set_config('omnibiz.task_rpc', 'on', true);

  UPDATE public.tasks
     SET status = 'cancelado',
         cancelled_at = now(),
         cancelled_by = v_uid,
         cancellation_reason = v_reason,
         updated_at = now()
   WHERE id = _task_id
   RETURNING * INTO v_task;

  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, previous_archived, new_archived, reason
  ) VALUES (
    v_task.company_id, v_task.id, v_uid, v_role, 'cancel',
    v_prev, 'cancelado', v_task.archived_at IS NOT NULL, v_task.archived_at IS NOT NULL, v_reason
  );

  RETURN v_task;
END
$function$;

-- 2) Cancelamento com pedido de alteração: mesma fonte de verdade + sugestão informativa.
DROP FUNCTION IF EXISTS public.task_cancel_with_schedule_request(uuid, text, date, boolean);
CREATE OR REPLACE FUNCTION public.task_cancel_with_schedule_request(
  _task_id uuid,
  _reason text,
  _requested_date date,
  _needs_reassignment boolean,
  _suggested_employee_id uuid DEFAULT NULL
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
         schedule_change_needs_reassignment = _needs_reassignment,
         schedule_change_suggested_employee_id = _suggested_employee_id,
         updated_at = now()
   WHERE id = _task_id;
  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  v_result := public.task_cancel(_task_id, _reason);

  UPDATE public.task_audit_events
     SET schedule_change_requested_date = _requested_date,
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

-- 3) Recusa do funcionário com pedido de alteração (ocorrência atual, nunca a série).
DROP FUNCTION IF EXISTS public.task_transition_with_schedule_request(uuid, text, text, date, boolean);
CREATE OR REPLACE FUNCTION public.task_transition_with_schedule_request(
  _task_id uuid,
  _action text,
  _reason text,
  _requested_date date,
  _needs_reassignment boolean,
  _suggested_employee_id uuid DEFAULT NULL
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
         schedule_change_needs_reassignment = _needs_reassignment,
         schedule_change_suggested_employee_id = _suggested_employee_id,
         updated_at = now()
   WHERE id = _task_id;
  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  v_result := public.task_transition(_task_id, _action, _reason);

  UPDATE public.task_refusals
     SET schedule_change_requested_date = _requested_date,
         schedule_change_needs_reassignment = _needs_reassignment,
         schedule_change_suggested_employee_id = _suggested_employee_id
   WHERE id = (
     SELECT id FROM public.task_refusals
      WHERE task_id = _task_id AND employee_id = v_uid AND actor_id = v_uid
      ORDER BY created_at DESC LIMIT 1
   );

  SELECT full_name INTO v_suggested FROM public.profiles WHERE id = _suggested_employee_id;

  -- Notificação do gestor lê a mesma fonte do evento: acrescenta apenas o que faltava.
  UPDATE public.notifications n
     SET metadata = COALESCE(n.metadata, '{}'::jsonb) || jsonb_build_object(
           'schedule_change_requested_date', _requested_date,
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

REVOKE ALL ON FUNCTION public.task_cancel_with_schedule_request(uuid, text, date, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.task_transition_with_schedule_request(uuid, text, text, date, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_cancel_with_schedule_request(uuid, text, date, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_transition_with_schedule_request(uuid, text, text, date, boolean, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';