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
BEGIN
  v_prio := CASE NEW.priority::text
              WHEN 'urgente' THEN 'urgente'::public.notification_priority
              WHEN 'alta' THEN 'alta'::public.notification_priority
              WHEN 'baixa' THEN 'baixa'::public.notification_priority
              ELSE 'media'::public.notification_priority END;

  -- Cada responsável recebe a sua própria notificação (uma única vez).
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> NEW.created_by THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
      'task_assigned', 'Nova tarefa atribuída', NEW.title, v_prio,
      jsonb_build_object('status', NEW.status, 'task_group_id', NEW.task_group_id));
  END IF;

  -- Fase B: num lote multi-responsável, gestores recebem UMA notificação.
  -- AFTER ROW triggers de um INSERT multi-linha disparam com todas as linhas já
  -- visíveis, por isso o vencedor é determinístico (menor id do grupo).
  v_first_of_group := NEW.task_group_id IS NULL
    OR NEW.id = (
      SELECT min(t.id) FROM public.tasks t WHERE t.task_group_id = NEW.task_group_id
    );

  IF NOT public.is_company_manager(NEW.created_by, NEW.company_id) THEN
    IF v_first_of_group THEN
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
        WHERE company_id = NEW.company_id AND role IN ('manager','super_admin')
      LOOP
        PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
          'task_authorization_requested', 'Solicitação de autorização',
          NEW.title, 'alta', jsonb_build_object('created_by', NEW.created_by));
      END LOOP;
    END IF;
  ELSIF v_first_of_group THEN
    FOR v_mgr IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE company_id = NEW.company_id AND role = 'manager' AND user_id <> NEW.created_by
    LOOP
      PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
        'task_created', 'Nova tarefa criada', NEW.title, v_prio, '{}'::jsonb);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;