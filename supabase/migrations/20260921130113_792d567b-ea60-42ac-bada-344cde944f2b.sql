CREATE OR REPLACE FUNCTION public.support_notify_destination(
  _company_id uuid,
  _ticket_id uuid,
  _destination_code text,
  _title text,
  _body text,
  _event public.notification_event DEFAULT 'ticket_created'::public.notification_event,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.support_destinations%ROWTYPE;
  target uuid;
  n int := 0;
  v_meta jsonb;
  v_has_target boolean;
BEGIN
  SELECT * INTO d FROM public.support_destinations WHERE code = _destination_code;
  IF NOT FOUND OR d.target_role IS NULL THEN RETURN 0; END IF;

  IF d.is_technical THEN
    RETURN public.support_notify_super_admins(_company_id, _ticket_id, _title, _body, _event, _priority);
  END IF;

  v_meta := jsonb_build_object('ticket_id', _ticket_id, 'destination_code', _destination_code);

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.role::text = d.target_role
       AND ur.company_id = _company_id
  ) INTO v_has_target;

  -- Filas administrativas (Secretaria/Contabilista) sem titular na empresa
  -- recaem na gestao: hoje esses papeis sao exercidos pelo Gestor.
  IF NOT v_has_target THEN
    RETURN public.support_notify_managers(_company_id, _ticket_id, _title, _body, _event, _priority);
  END IF;

  FOR target IN
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role::text = d.target_role
       AND ur.company_id = _company_id
       AND ur.user_id IS DISTINCT FROM auth.uid()
  LOOP
    INSERT INTO public.notifications(company_id, user_id, event, title, body, priority, metadata)
    SELECT _company_id, target, _event, _title, _body, _priority, v_meta
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.company_id = _company_id
         AND n.user_id = target
         AND n.event = _event
         AND n.title = _title
         AND n.body IS NOT DISTINCT FROM _body
         AND n.metadata = v_meta
         AND n.created_at > now() - interval '1 minute'
    );
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_destination(uuid, uuid, text, text, text, public.notification_event, public.notification_priority) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.support_notify_destination(uuid, uuid, text, text, text, public.notification_event, public.notification_priority) TO authenticated, service_role;