-- SUP-2026-000138: informa o inicio atrasado aos gestores e ao responsavel.
-- O evento continua sendo task_started; apenas o texto e os metadados ficam
-- enriquecidos quando o inicio efetivo ocorre depois do horario previsto.

CREATE OR REPLACE FUNCTION public.tasks_notify_late_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient record;
  v_timezone text;
  v_scheduled_wall timestamp;
  v_started_wall timestamp;
  v_delay_minutes integer;
  v_title text;
  v_body text;
  v_metadata jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'em_andamento'
     AND NEW.assigned_to IS NOT NULL
     AND NEW.started_at IS NOT NULL
     AND NEW.scheduled_for IS NOT NULL THEN
    SELECT COALESCE(NULLIF(c.timezone, ''), 'UTC')
      INTO v_timezone
      FROM public.companies c
     WHERE c.id = NEW.company_id;

    -- scheduled_for is stored as a wall-clock ISO value (UTC marker), while
    -- started_at is a real timestamptz. Compare both in the company's clock.
    v_scheduled_wall := NEW.scheduled_for AT TIME ZONE 'UTC';
    v_started_wall := NEW.started_at AT TIME ZONE COALESCE(v_timezone, 'UTC');

    IF v_started_wall > v_scheduled_wall THEN
      v_delay_minutes := GREATEST(
        1,
        FLOOR(EXTRACT(EPOCH FROM (v_started_wall - v_scheduled_wall)) / 60)::integer
      );
      v_title := 'Tarefa iniciada em atraso';
      v_body := NEW.title
        || '. Horario previsto: '
        || to_char(v_scheduled_wall, 'DD/MM/YYYY HH24:MI')
        || '. Inicio efetivo: '
        || to_char(v_started_wall, 'DD/MM/YYYY HH24:MI')
        || '. Atraso: '
        || v_delay_minutes::text
        || ' minuto(s).';
      v_metadata := jsonb_build_object(
        'started_late', true,
        'scheduled_for', NEW.scheduled_for,
        'started_at', NEW.started_at,
        'delay_minutes', v_delay_minutes,
        'task_id', NEW.id,
        'link', '/app/tarefas?task=' || NEW.id::text
      );

      -- Um unico evento por destinatario/tarefa. A funcao canonica _notify
      -- continua protegendo contra duplicidade e respeita o isolamento da empresa.
      FOR v_recipient IN
        SELECT NEW.assigned_to AS user_id
        UNION
        SELECT DISTINCT ur.user_id
          FROM public.user_roles ur
         WHERE ur.company_id = NEW.company_id
           AND ur.role IN ('manager', 'owner', 'super_admin')
      LOOP
        PERFORM public._notify(
          NEW.company_id,
          v_recipient.user_id,
          NEW.id,
          'task_started',
          v_title,
          v_body,
          'baixa',
          v_metadata
        );
      END LOOP;

      -- O trigger legado tambem cria task_started para gestores. Atualizar o
      -- registro existente torna o resultado independente da ordem dos triggers.
      UPDATE public.notifications n
         SET title = v_title,
             body = v_body,
             metadata = v_metadata
       WHERE n.company_id = NEW.company_id
         AND n.task_id = NEW.id
         AND n.event = 'task_started'
         AND n.user_id IN (
           SELECT NEW.assigned_to
           UNION
           SELECT DISTINCT ur.user_id
             FROM public.user_roles ur
            WHERE ur.company_id = NEW.company_id
              AND ur.role IN ('manager', 'owner', 'super_admin')
         );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tasks_notify_late_start ON public.tasks;
CREATE TRIGGER trg_tasks_notify_late_start
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_notify_late_start();

REVOKE ALL ON FUNCTION public.tasks_notify_late_start() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tasks_notify_late_start() TO authenticated;
