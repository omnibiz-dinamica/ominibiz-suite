CREATE OR REPLACE FUNCTION public.tasks_notify_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mgr RECORD;
  v_prio public.notification_priority;
  v_first_of_group boolean;
  v_client text;
  v_day text;
  v_time text;
  v_body text;
  v_meta jsonb;
BEGIN
  v_prio := CASE NEW.priority::text
              WHEN 'urgente' THEN 'urgente'::public.notification_priority
              WHEN 'alta' THEN 'alta'::public.notification_priority
              WHEN 'baixa' THEN 'baixa'::public.notification_priority
              ELSE 'media'::public.notification_priority END;

  SELECT c.name INTO v_client FROM public.clients c WHERE c.id = NEW.client_id;

  v_day := to_char(
    COALESCE(NEW.scheduled_for, NEW.recurrence_date::timestamptz, NEW.due_at),
    'DD/MM/YYYY'
  );
  v_time := CASE WHEN NEW.scheduled_for IS NOT NULL
                 THEN to_char(NEW.scheduled_for, 'HH24:MI') END;

  v_body := NEW.title
    || COALESCE(' · ' || v_client, '')
    || COALESCE(' · ' || v_day, '')
    || COALESCE(' ' || v_time, '');

  v_meta := jsonb_build_object(
    'status', NEW.status,
    'task_group_id', NEW.task_group_id,
    'client_id', NEW.client_id,
    'client_name', v_client,
    'company_id', NEW.company_id,
    'scheduled_for', NEW.scheduled_for,
    'recurrence_date', NEW.recurrence_date,
    'due_at', NEW.due_at,
    'link', '/app/tarefas?task=' || NEW.id::text
  );

  -- Cada responsável recebe a sua própria notificação (uma única vez).
  -- _notify é idempotente, portanto reload/reconexão não duplicam.
  -- Um gestor só recebe aqui por ser responsável, nunca por ser criador.
  IF NEW.assigned_to IS NOT NULL THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
      'task_assigned', 'Nova tarefa atribuída', v_body, v_prio, v_meta);
  END IF;

  -- Num lote multi-responsável, os gestores recebem UMA notificação.
  v_first_of_group := NEW.task_group_id IS NULL
    OR NEW.id::text = (
      SELECT min(t.id::text) FROM public.tasks t WHERE t.task_group_id = NEW.task_group_id
    );

  -- Tarefa criada por funcionário continua a exigir autorização do gestor.
  IF NOT public.is_company_manager(NEW.created_by, NEW.company_id) AND v_first_of_group THEN
    FOR v_mgr IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE company_id = NEW.company_id AND role IN ('manager','super_admin')
    LOOP
      PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
        'task_authorization_requested', 'Solicitação de autorização',
        v_body, 'alta', v_meta || jsonb_build_object('created_by', NEW.created_by));
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;