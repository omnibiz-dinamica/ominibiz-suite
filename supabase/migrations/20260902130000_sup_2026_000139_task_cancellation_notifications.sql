-- SUP-2026-000139: notification de cancelamento com ator, contexto e motivo.
-- Reutiliza notifications/_notify; nao cria contagem ou tabela paralela.

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
      -- Recusa pelo responsavel: preserva o evento e o detalhe especifico existentes.
      SELECT full_name INTO v_employee FROM public.profiles WHERE id = NEW.refused_by;
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
         WHERE company_id = NEW.company_id AND role IN ('manager', 'owner')
           AND user_id <> NEW.refused_by
      LOOP
        PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
          'task_rejected', 'Tarefa recusada',
          COALESCE(v_employee, 'O funcionario') || ' recusou a tarefa ' || NEW.title
            || '. Motivo: ' || COALESCE(NEW.refusal_reason, '-'), 'alta',
          jsonb_build_object(
            'refused_by', NEW.refused_by, 'employee_name', v_employee,
            'refusal_reason', NEW.refusal_reason, 'refused_at', NEW.refused_at,
            'client_id', NEW.client_id, 'scheduled_for', NEW.scheduled_for,
            'task_id', NEW.id, 'link', '/app/tarefas?status=recusadas&task=' || NEW.id::text));
      END LOOP;

    ELSIF NEW.status = 'cancelado' THEN
      IF OLD.status = 'pendente' AND NOT public.is_company_manager(NEW.created_by, NEW.company_id) THEN
        PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
          'task_rejected', 'Solicitacao rejeitada', NEW.title, 'alta',
          jsonb_build_object('rejected_by', NEW.cancelled_by));
      ELSE
        -- O UUID do ator vem da coluna canonica; o nome e apenas uma projecao para a UI.
        SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'Usuario') INTO v_actor
          FROM public.profiles p WHERE p.id = NEW.cancelled_by;
        v_actor := COALESCE(v_actor, CASE WHEN NEW.cancelled_by IS NULL THEN 'Sistema' ELSE 'Usuario' END);
        v_actor_role := CASE
          WHEN NEW.cancelled_by IS NULL THEN 'Sistema'
          WHEN public.is_super_admin(NEW.cancelled_by) THEN 'SuperAdmin'
          WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = NEW.cancelled_by AND ur.company_id = NEW.company_id
               AND ur.role IN ('manager', 'owner')
          ) THEN 'Gestor'
          ELSE 'Funcionario'
        END;
        SELECT c.name INTO v_client FROM public.clients c
         WHERE c.id = NEW.client_id AND c.company_id = NEW.company_id;

        v_cancel_body := v_actor || ' (' || v_actor_role || ') cancelou a tarefa "' || NEW.title || '".'
          || CASE WHEN v_client IS NOT NULL THEN ' Cliente: ' || v_client || '.' ELSE '' END
          || ' Cancelada em: ' || to_char(COALESCE(NEW.cancelled_at, now()), 'DD/MM/YYYY HH24:MI') || '.'
          || ' Motivo: ' || COALESCE(NULLIF(btrim(NEW.cancellation_reason), ''), 'Nao informado') || '.';
        v_cancel_metadata := jsonb_build_object(
          'cancelled_by', NEW.cancelled_by, 'cancelled_by_name', v_actor,
          'cancelled_by_role', v_actor_role, 'cancellation_reason', NEW.cancellation_reason,
          'cancelled_at', NEW.cancelled_at, 'client_id', NEW.client_id, 'client_name', v_client,
          'scheduled_for', NEW.scheduled_for, 'recurrence_date', NEW.recurrence_date,
          'task_id', NEW.id, 'task_title', NEW.title, 'link', '/app/tarefas?task=' || NEW.id::text);

        IF NEW.assigned_to IS NOT NULL THEN
          PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
            'task_cancelled', 'Tarefa cancelada', v_cancel_body, 'media', v_cancel_metadata);
        END IF;
        IF NEW.created_by IS NOT NULL
           AND NEW.created_by <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) THEN
          PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
            'task_cancelled', 'Tarefa cancelada', v_cancel_body, 'media', v_cancel_metadata);
        END IF;
        -- Garante a entrega a Gestor/Owner; _notify espelha para SuperAdmin.
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
