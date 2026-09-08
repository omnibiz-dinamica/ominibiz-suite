-- SUP-2026-000143: garante que o Cloud Database exponha os RPCs de alteração
-- de programação usados pelo aplicativo. A operação canônica continua sendo
-- task_cancel/task_transition; estes wrappers só registram o pedido por ocorrência.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS schedule_change_requested_date date,
  ADD COLUMN IF NOT EXISTS schedule_change_needs_reassignment boolean;

ALTER TABLE public.task_refusals
  ADD COLUMN IF NOT EXISTS schedule_change_requested_date date,
  ADD COLUMN IF NOT EXISTS schedule_change_needs_reassignment boolean;

ALTER TABLE public.task_audit_events
  ADD COLUMN IF NOT EXISTS schedule_change_requested_date date,
  ADD COLUMN IF NOT EXISTS schedule_change_needs_reassignment boolean;

-- Reaplica o trigger central caso o banco tenha recebido apenas parte das
-- migrations anteriores. O mesmo trigger atende atribuicao, autorizacao,
-- recusa, cancelamento e ausencia sem criar um segundo caminho de notificacao.
CREATE OR REPLACE FUNCTION public.tasks_notify_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mgr record;
  v_employee text;
  v_actor text;
  v_actor_role text;
  v_client text;
  v_cancel_body text;
  v_cancel_metadata jsonb;
  v_schedule_suffix text;
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
      'task_assigned', 'Tarefa atribuida a voce', NEW.title, 'media', '{}'::jsonb);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'autorizado' THEN
      PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
        'task_authorized', 'Tarefa autorizada', NEW.title, 'media',
        jsonb_build_object('authorized_by', NEW.authorized_by));
      IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> NEW.created_by THEN
        PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
          'task_authorized', 'Tarefa autorizada', NEW.title, 'media', '{}'::jsonb);
      END IF;

    ELSIF NEW.status = 'cancelado' AND NEW.refused_by IS NOT NULL AND OLD.refused_by IS NULL THEN
      SELECT full_name INTO v_employee FROM public.profiles WHERE id = NEW.refused_by;
      SELECT c.name INTO v_client FROM public.clients c
       WHERE c.id = NEW.client_id AND c.company_id = NEW.company_id;
      v_schedule_suffix := CASE WHEN NEW.schedule_change_requested_date IS NOT NULL
        THEN ' Nova data desejada: ' || to_char(NEW.schedule_change_requested_date, 'DD/MM/YYYY') || '.' ELSE '' END
        || CASE WHEN NEW.schedule_change_needs_reassignment IS NOT NULL
          THEN ' Reatribuicao necessaria: ' || CASE WHEN NEW.schedule_change_needs_reassignment THEN 'sim' ELSE 'nao' END || '.' ELSE '' END;
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
         WHERE company_id = NEW.company_id AND role IN ('manager', 'owner')
           AND user_id <> NEW.refused_by
      LOOP
        PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
          'task_rejected', 'Tarefa recusada',
          COALESCE(v_employee, 'O funcionario') || ' recusou a tarefa ' || NEW.title
            || CASE WHEN v_client IS NOT NULL THEN ' do cliente ' || v_client ELSE '' END
            || '. Motivo: ' || COALESCE(NEW.refusal_reason, '-') || '.' || v_schedule_suffix, 'alta',
          jsonb_build_object(
            'refused_by', NEW.refused_by, 'employee_name', v_employee,
            'refusal_reason', NEW.refusal_reason, 'refused_at', NEW.refused_at,
            'client_id', NEW.client_id, 'client_name', v_client,
            'scheduled_for', NEW.scheduled_for, 'task_id', NEW.id,
            'schedule_change_requested_date', NEW.schedule_change_requested_date,
            'schedule_change_needs_reassignment', NEW.schedule_change_needs_reassignment,
            'link', '/app/tarefas?status=recusadas&task=' || NEW.id::text));
      END LOOP;

    ELSIF NEW.status = 'cancelado' THEN
      IF OLD.status = 'pendente' AND NOT public.is_company_manager(NEW.created_by, NEW.company_id) THEN
        PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
          'task_rejected', 'Solicitacao rejeitada', NEW.title, 'alta',
          jsonb_build_object('rejected_by', NEW.cancelled_by));
      ELSE
        SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'Usuario') INTO v_actor
          FROM public.profiles p WHERE p.id = NEW.cancelled_by;
        v_actor := COALESCE(v_actor, CASE WHEN NEW.cancelled_by IS NULL THEN 'Sistema' ELSE 'Usuario' END);
        v_actor_role := CASE
          WHEN NEW.cancelled_by IS NULL THEN 'Sistema'
          WHEN public.is_super_admin(NEW.cancelled_by) THEN 'SuperAdmin'
          WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.cancelled_by
              AND ur.company_id = NEW.company_id AND ur.role IN ('manager', 'owner')
          ) THEN 'Gestor' ELSE 'Funcionario' END;
        SELECT c.name INTO v_client FROM public.clients c
         WHERE c.id = NEW.client_id AND c.company_id = NEW.company_id;
        v_schedule_suffix := CASE WHEN NEW.schedule_change_requested_date IS NOT NULL
          THEN ' Nova data desejada: ' || to_char(NEW.schedule_change_requested_date, 'DD/MM/YYYY') || '.' ELSE '' END
          || CASE WHEN NEW.schedule_change_needs_reassignment IS NOT NULL
            THEN ' Reatribuicao necessaria: ' || CASE WHEN NEW.schedule_change_needs_reassignment THEN 'sim' ELSE 'nao' END || '.' ELSE '' END;
        v_cancel_body := v_actor || ' (' || v_actor_role || ') cancelou a tarefa "' || NEW.title || '".'
          || CASE WHEN v_client IS NOT NULL THEN ' Cliente: ' || v_client || '.' ELSE '' END
          || ' Cancelada em: ' || to_char(COALESCE(NEW.cancelled_at, now()), 'DD/MM/YYYY HH24:MI') || '.'
          || ' Motivo: ' || COALESCE(NULLIF(btrim(NEW.cancellation_reason), ''), 'Nao informado') || '.'
          || v_schedule_suffix;
        v_cancel_metadata := jsonb_build_object(
          'cancelled_by', NEW.cancelled_by, 'cancelled_by_name', v_actor,
          'cancelled_by_role', v_actor_role, 'cancellation_reason', NEW.cancellation_reason,
          'cancelled_at', NEW.cancelled_at, 'client_id', NEW.client_id, 'client_name', v_client,
          'scheduled_for', NEW.scheduled_for, 'recurrence_date', NEW.recurrence_date,
          'schedule_change_requested_date', NEW.schedule_change_requested_date,
          'schedule_change_needs_reassignment', NEW.schedule_change_needs_reassignment,
          'task_id', NEW.id, 'task_title', NEW.title, 'link', '/app/tarefas?task=' || NEW.id::text);
        IF NEW.assigned_to IS NOT NULL THEN
          PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
            'task_cancelled', 'Tarefa cancelada', v_cancel_body, 'media', v_cancel_metadata);
        END IF;
        IF NEW.created_by IS NOT NULL AND NEW.created_by <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) THEN
          PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
            'task_cancelled', 'Tarefa cancelada', v_cancel_body, 'media', v_cancel_metadata);
        END IF;
        FOR v_mgr IN
          SELECT DISTINCT user_id FROM public.user_roles
           WHERE company_id = NEW.company_id AND role IN ('manager', 'owner')
        LOOP
          PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
            'task_cancelled', 'Tarefa cancelada', v_cancel_body, 'media', v_cancel_metadata);
        END LOOP;
      END IF;

    ELSIF NEW.status = 'ausente' THEN
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
         WHERE company_id = NEW.company_id AND role = 'manager'
      LOOP
        PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
          'task_marked_absent', 'Tarefa marcada como ausente', NEW.title, 'alta', '{}'::jsonb);
      END LOOP;
      IF NEW.assigned_to IS NOT NULL THEN
        PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
          'task_marked_absent', 'Sua tarefa foi marcada como ausente', NEW.title, 'alta', '{}'::jsonb);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tasks_notify_update ON public.tasks;
CREATE TRIGGER trg_tasks_notify_update
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_notify_update();

CREATE OR REPLACE FUNCTION public.task_cancel_with_schedule_request(
  _task_id uuid,
  _reason text,
  _requested_date date,
  _needs_reassignment boolean
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

  SELECT * INTO v_task
    FROM public.tasks
   WHERE id = _task_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.is_company_manager(v_uid, v_task.company_id)
    OR v_task.assigned_to = v_uid
  ) THEN
    RAISE EXCEPTION 'Sem permissao para cancelar esta tarefa';
  END IF;
  IF v_task.status = 'cancelado' THEN RETURN v_task; END IF;

  -- A flag permite a alteração controlada pela RPC sem liberar UPDATE direto
  -- do funcionário e mantém a solicitação vinculada à ocorrência atual.
  PERFORM set_config('omnibiz.task_rpc', 'on', true);
  UPDATE public.tasks
     SET schedule_change_requested_date = _requested_date,
         schedule_change_needs_reassignment = _needs_reassignment,
         updated_at = now()
   WHERE id = _task_id;
  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  v_result := public.task_cancel(_task_id, _reason);

  -- Compatibilidade com versões do cancelamento que ainda não copiavam os
  -- campos adicionais para o evento de auditoria.
  UPDATE public.task_audit_events
     SET schedule_change_requested_date = _requested_date,
         schedule_change_needs_reassignment = _needs_reassignment
   WHERE id = (
     SELECT id
       FROM public.task_audit_events
      WHERE task_id = _task_id
        AND actor_user_id = v_uid
        AND event = 'cancel'
      ORDER BY created_at DESC
      LIMIT 1
   );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.task_transition_with_schedule_request(
  _task_id uuid,
  _action text,
  _reason text,
  _requested_date date,
  _needs_reassignment boolean
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
  IF _action <> 'recusar' THEN RAISE EXCEPTION 'Acao invalida para pedido de alteracao'; END IF;
  IF _requested_date IS NULL THEN RAISE EXCEPTION 'Nova data desejada obrigatoria'; END IF;
  IF _needs_reassignment IS NULL THEN RAISE EXCEPTION 'Informe se necessita reatribuicao'; END IF;

  SELECT * INTO v_task
    FROM public.tasks
   WHERE id = _task_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;
  IF v_task.assigned_to <> v_uid THEN
    RAISE EXCEPTION 'Apenas o responsavel pode recusar a tarefa';
  END IF;

  PERFORM set_config('omnibiz.task_rpc', 'on', true);
  UPDATE public.tasks
     SET schedule_change_requested_date = _requested_date,
         schedule_change_needs_reassignment = _needs_reassignment,
         updated_at = now()
   WHERE id = _task_id;
  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  v_result := public.task_transition(_task_id, _action, _reason);

  UPDATE public.task_refusals
     SET schedule_change_requested_date = _requested_date,
         schedule_change_needs_reassignment = _needs_reassignment
   WHERE id = (
     SELECT id
       FROM public.task_refusals
      WHERE task_id = _task_id
        AND employee_id = v_uid
        AND actor_id = v_uid
      ORDER BY created_at DESC
      LIMIT 1
   );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.task_cancel_with_schedule_request(uuid, text, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.task_transition_with_schedule_request(uuid, text, text, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_cancel_with_schedule_request(uuid, text, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_transition_with_schedule_request(uuid, text, text, date, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
