-- 1) Permitir o novo evento 'created' no histórico de tarefas
ALTER TABLE public.task_audit_events DROP CONSTRAINT task_audit_events_event_check;
ALTER TABLE public.task_audit_events ADD CONSTRAINT task_audit_events_event_check
  CHECK (event = ANY (ARRAY['created','cancel','archive','unarchive','absence','delete','series_end','completion_note','no_start_reason']));

-- 2) Trigger de auditoria de criação
CREATE OR REPLACE FUNCTION public.tasks_audit_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_origin text;
  v_actor uuid;
  v_role text;
BEGIN
  IF NEW.recurrence_id IS NULL THEN
    v_origin := 'manual';
    v_actor := NEW.created_by;
  ELSIF EXISTS (
    SELECT 1 FROM public.task_recurrences r
    WHERE r.id = NEW.recurrence_id
      AND r.created_at > now() - interval '5 seconds'
  ) THEN
    -- Primeira geração, no mesmo momento em que a série foi salva
    v_origin := 'recurrence_seed';
    v_actor := NULL;
  ELSE
    -- Gerada pela rotina automática de extensão de horizonte
    v_origin := 'recurrence';
    v_actor := NULL;
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT ur.role::text INTO v_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_actor AND ur.company_id = NEW.company_id
    ORDER BY CASE ur.role::text WHEN 'super_admin' THEN 0 WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END
    LIMIT 1;
  END IF;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event, reason,
    recurrence_id, occurrence_date
  ) VALUES (
    NEW.company_id, NEW.id, v_actor, v_role, 'created', v_origin,
    NEW.recurrence_id, NEW.recurrence_date
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER tasks_audit_created_trigger
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_audit_created();

-- 3) Texto da notificação distingue origem automática
CREATE OR REPLACE FUNCTION public.tasks_notify_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mgr RECORD;
  v_prio public.notification_priority;
  v_first_of_group boolean;
  v_client text;
  v_day text;
  v_time text;
  v_body text;
  v_meta jsonb;
  v_title text;
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
    'recurrence_id', NEW.recurrence_id,
    'due_at', NEW.due_at,
    'origin', CASE WHEN NEW.recurrence_id IS NULL THEN 'manual' ELSE 'recurrence' END,
    'link', '/app/tarefas?task=' || NEW.id::text
  );

  -- Ocorrências de recorrência são geradas pelo sistema, não por uma pessoa.
  v_title := CASE WHEN NEW.recurrence_id IS NULL
                  THEN 'Nova tarefa atribuída'
                  ELSE 'Tarefa gerada automaticamente pela recorrência' END;

  -- Cada responsável recebe a sua própria notificação (uma única vez).
  -- _notify é idempotente, portanto reload/reconexão não duplicam.
  -- Um gestor só recebe aqui por ser responsável, nunca por ser criador.
  IF NEW.assigned_to IS NOT NULL THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
      'task_assigned', v_title, v_body, v_prio, v_meta);
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
$function$;