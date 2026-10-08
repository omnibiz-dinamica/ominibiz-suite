SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public._notify(_company_id uuid, _user_id uuid, _task_id uuid, _event notification_event, _title text, _body text, _priority notification_priority DEFAULT 'media'::notification_priority, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_super_admin uuid;
  v_metadata jsonb := COALESCE(_metadata, '{}'::jsonb);
  v_mirror_metadata jsonb := v_metadata || jsonb_build_object('super_admin_mirror', true);
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN
    RETURN;
  END IF;

  -- Mantem a idempotencia existente para eventos com task_id e tambem evita
  -- duplicacao para notificacoes sem task_id (periodos, tickets, etc.).
  IF _task_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      company_id, user_id, task_id, event, title, body, priority, metadata
    )
    SELECT _company_id, _user_id, _task_id, _event, _title, _body, _priority, v_metadata
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.company_id = _company_id
        AND n.user_id = _user_id
        AND n.task_id = _task_id
        AND n.event = _event
        AND n.title = _title
        AND n.body IS NOT DISTINCT FROM _body
        AND n.metadata = v_metadata
    )
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.notifications (
      company_id, user_id, task_id, event, title, body, priority, metadata
    )
    SELECT _company_id, _user_id, _task_id, _event, _title, _body, _priority, v_metadata
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.company_id = _company_id
        AND n.user_id = _user_id
        AND n.task_id IS NULL
        AND n.event = _event
        AND n.title = _title
        AND n.body IS NOT DISTINCT FROM _body
        AND n.metadata = v_metadata
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Super Admin e global; nao precisa de user_roles na empresa para receber
  -- eventos da empresa que esta sendo acompanhada.
  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.company_id = _company_id
      AND ur.role IN ('manager', 'owner')
  ) THEN
    FOR v_super_admin IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role = 'super_admin'
        AND ur.user_id <> _user_id
    LOOP
      IF _task_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          company_id, user_id, task_id, event, title, body, priority, metadata
        )
        SELECT _company_id, v_super_admin, _task_id, _event, _title, _body,
               _priority, v_mirror_metadata
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.notifications n
          WHERE n.company_id = _company_id
            AND n.user_id = v_super_admin
            AND n.task_id = _task_id
            AND n.event = _event
            AND n.title = _title
            AND n.body IS NOT DISTINCT FROM _body
            AND n.metadata = v_mirror_metadata
        )
        ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO public.notifications (
          company_id, user_id, task_id, event, title, body, priority, metadata
        )
        SELECT _company_id, v_super_admin, _task_id, _event, _title, _body,
               _priority, v_mirror_metadata
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.notifications n
          WHERE n.company_id = _company_id
            AND n.user_id = v_super_admin
            AND n.task_id IS NULL
            AND n.event = _event
            AND n.title = _title
            AND n.body IS NOT DISTINCT FROM _body
            AND n.metadata = v_mirror_metadata
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END;
$function$;