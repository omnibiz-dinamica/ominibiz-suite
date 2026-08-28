-- OmniBiz · Super Admin com heranca operacional de Gestor
-- Apenas notificacoes in-app. RBAC, RLS e dados historicos permanecem intactos.

-- O helper central e usado pelos fluxos de tarefas, ponto, ferias, despesas,
-- documentos e demais modulos operacionais. Quando o destinatario original e
-- gestor/owner, os Super Admins recebem a mesma notificacao para auditoria e
-- acompanhamento global, sempre preservando o company_id do evento.
CREATE OR REPLACE FUNCTION public._notify(
  _company_id uuid,
  _user_id uuid,
  _task_id uuid,
  _event public.notification_event,
  _title text,
  _body text,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  INSERT INTO public.notifications (
    company_id, user_id, task_id, event, title, body, priority, metadata
  )
  SELECT _company_id, _user_id, _task_id, _event, _title, _body, _priority, v_metadata
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.company_id = _company_id
      AND n.user_id = _user_id
      AND n.task_id IS NOT DISTINCT FROM _task_id
      AND n.event = _event
      AND n.title = _title
      AND n.body IS NOT DISTINCT FROM _body
      AND n.metadata = v_metadata
  )
  ON CONFLICT DO NOTHING;

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
          AND n.task_id IS NOT DISTINCT FROM _task_id
          AND n.event = _event
          AND n.title = _title
          AND n.body IS NOT DISTINCT FROM _body
          AND n.metadata = v_mirror_metadata
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._notify(
  uuid, uuid, uuid, public.notification_event, text, text,
  public.notification_priority, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._notify(
  uuid, uuid, uuid, public.notification_event, text, text,
  public.notification_priority, jsonb
) TO authenticated, service_role;

-- Este helper historicamente inseria direto em notifications. Passa a usar o
-- helper central e inclui os Super Admins uma unica vez, sem duplicar eventos.
CREATE OR REPLACE FUNCTION public.support_notify_managers(
  _company_id uuid,
  _ticket_id uuid,
  _title text,
  _body text,
  _event public.notification_event,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
  count_inserted integer := 0;
BEGIN
  FOR target IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.company_id = _company_id
      AND ur.role IN ('manager', 'owner')
    UNION
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'super_admin'
  LOOP
    PERFORM public._notify(
      _company_id, target, _ticket_id, _event, _title, _body, _priority,
      jsonb_build_object('ticket_id', _ticket_id)
    );
    count_inserted := count_inserted + 1;
  END LOOP;
  RETURN count_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_managers(
  uuid, uuid, text, text, public.notification_event, public.notification_priority
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_managers(
  uuid, uuid, text, text, public.notification_event, public.notification_priority
) TO authenticated, service_role;
