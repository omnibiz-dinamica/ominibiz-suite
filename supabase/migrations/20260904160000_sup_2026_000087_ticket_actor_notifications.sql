-- SUP-2026-000087: keep the canonical ticket actor in every support notification.
-- Ticket identifiers remain in metadata.ticket_id; notifications.task_id is only
-- for public.tasks(id).

CREATE OR REPLACE FUNCTION public.support_ticket_notification_context(
  _company_id uuid,
  _ticket_id uuid,
  _event public.notification_event
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ticket_number text;
  v_actor_name text;
  v_actor_email text;
  v_message_id uuid;
BEGIN
  SELECT t.ticket_number INTO v_ticket_number
    FROM public.support_tickets t
   WHERE t.id = _ticket_id AND t.company_id = _company_id;

  IF v_uid IS NOT NULL THEN
    SELECT NULLIF(btrim(p.full_name), '') INTO v_actor_name
      FROM public.profiles p WHERE p.id = v_uid;
    SELECT NULLIF(btrim(u.email::text), '') INTO v_actor_email
      FROM auth.users u WHERE u.id = v_uid;

    IF _event = 'ticket_message_added'::public.notification_event THEN
      SELECT m.id INTO v_message_id
        FROM public.support_ticket_messages m
       WHERE m.ticket_id = _ticket_id
         AND m.company_id = _company_id
         AND m.author_user_id = v_uid
         AND NOT COALESCE(m.is_internal, false)
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ticket_id', _ticket_id,
    'ticket_number', v_ticket_number,
    'actor_id', v_uid,
    'actor_name', v_actor_name,
    'actor_email', v_actor_email,
    'message_id', v_message_id
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_notification_context(uuid, uuid, public.notification_event) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_ticket_notification_context(uuid, uuid, public.notification_event) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.support_ticket_notification_context(uuid, uuid, public.notification_event) TO service_role;

CREATE OR REPLACE FUNCTION public.support_notify_super_admins(
  _company_id uuid, _ticket_id uuid, _title text, _body text,
  _event public.notification_event,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target uuid;
  count_inserted integer := 0;
  v_metadata jsonb := public.support_ticket_notification_context(_company_id, _ticket_id, _event);
BEGIN
  FOR target IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.role = 'super_admin' AND ur.user_id IS DISTINCT FROM auth.uid()
  LOOP
    INSERT INTO public.notifications(company_id, user_id, task_id, event, title, body, priority, metadata)
    SELECT _company_id, target, NULL, _event, _title, _body, _priority, v_metadata
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.company_id = _company_id AND n.user_id = target
          AND n.task_id IS NULL AND n.event = _event
          AND n.metadata->>'ticket_id' = _ticket_id::text
          AND CASE
            WHEN _event = 'ticket_created'::public.notification_event THEN true
            WHEN _event = 'ticket_message_added'::public.notification_event
              THEN v_metadata->>'message_id' IS NOT NULL
               AND n.metadata->>'message_id' = v_metadata->>'message_id'
            ELSE n.title = _title AND n.body IS NOT DISTINCT FROM _body
          END
     );
    IF FOUND THEN count_inserted := count_inserted + 1; END IF;
  END LOOP;
  RETURN count_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_super_admins(uuid, uuid, text, text, public.notification_event, public.notification_priority) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_super_admins(uuid, uuid, text, text, public.notification_event, public.notification_priority) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.support_notify_user(
  _user_id uuid, _company_id uuid, _ticket_id uuid, _title text, _body text,
  _event public.notification_event,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
  v_metadata jsonb := public.support_ticket_notification_context(_company_id, _ticket_id, _event);
BEGIN
  IF _user_id IS NULL OR _user_id = auth.uid() THEN RETURN NULL; END IF;

  INSERT INTO public.notifications(company_id, user_id, task_id, event, title, body, priority, metadata)
  SELECT _company_id, _user_id, NULL, _event, _title, _body, _priority, v_metadata
   WHERE NOT EXISTS (
     SELECT 1 FROM public.notifications n
      WHERE n.company_id = _company_id AND n.user_id = _user_id
        AND n.task_id IS NULL AND n.event = _event
        AND n.metadata->>'ticket_id' = _ticket_id::text
        AND CASE
          WHEN _event = 'ticket_created'::public.notification_event THEN true
          WHEN _event = 'ticket_message_added'::public.notification_event
            THEN v_metadata->>'message_id' IS NOT NULL
             AND n.metadata->>'message_id' = v_metadata->>'message_id'
          ELSE n.title = _title AND n.body IS NOT DISTINCT FROM _body
        END
   )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_user(uuid, uuid, uuid, text, text, public.notification_event, public.notification_priority) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_user(uuid, uuid, uuid, text, text, public.notification_event, public.notification_priority) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.support_notify_managers(
  _company_id uuid, _ticket_id uuid, _title text, _body text,
  _event public.notification_event,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target uuid;
  count_inserted integer := 0;
  v_metadata jsonb := public.support_ticket_notification_context(_company_id, _ticket_id, _event);
BEGIN
  FOR target IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.company_id = _company_id AND ur.role IN ('manager', 'owner')
       AND ur.user_id IS DISTINCT FROM auth.uid()
    UNION
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.role = 'super_admin' AND ur.user_id IS DISTINCT FROM auth.uid()
  LOOP
    INSERT INTO public.notifications(company_id, user_id, task_id, event, title, body, priority, metadata)
    SELECT _company_id, target, NULL, _event, _title, _body, _priority, v_metadata
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.company_id = _company_id AND n.user_id = target
          AND n.task_id IS NULL AND n.event = _event
          AND n.metadata->>'ticket_id' = _ticket_id::text
          AND CASE
            WHEN _event = 'ticket_created'::public.notification_event THEN true
            WHEN _event = 'ticket_message_added'::public.notification_event
              THEN v_metadata->>'message_id' IS NOT NULL
               AND n.metadata->>'message_id' = v_metadata->>'message_id'
            ELSE n.title = _title AND n.body IS NOT DISTINCT FROM _body
          END
     );
    IF FOUND THEN count_inserted := count_inserted + 1; END IF;
  END LOOP;
  RETURN count_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_managers(uuid, uuid, text, text, public.notification_event, public.notification_priority) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_managers(uuid, uuid, text, text, public.notification_event, public.notification_priority) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.support_notify_destination(
  _company_id uuid, _ticket_id uuid, _destination_code text, _title text, _body text,
  _event public.notification_event DEFAULT 'ticket_created'::public.notification_event,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d public.support_destinations%ROWTYPE;
  target uuid;
  count_inserted integer := 0;
  v_metadata jsonb := public.support_ticket_notification_context(_company_id, _ticket_id, _event);
BEGIN
  SELECT * INTO d FROM public.support_destinations WHERE code = _destination_code;
  IF NOT FOUND OR d.target_role IS NULL THEN RETURN 0; END IF;
  IF d.is_technical THEN
    RETURN public.support_notify_super_admins(_company_id, _ticket_id, _title, _body, _event, _priority);
  END IF;

  FOR target IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.company_id = _company_id AND ur.role::text = d.target_role
       AND ur.user_id IS DISTINCT FROM auth.uid()
  LOOP
    INSERT INTO public.notifications(company_id, user_id, task_id, event, title, body, priority, metadata)
    SELECT _company_id, target, NULL, _event, _title, _body, _priority, v_metadata
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.company_id = _company_id AND n.user_id = target
          AND n.task_id IS NULL AND n.event = _event
          AND n.metadata->>'ticket_id' = _ticket_id::text
          AND CASE
            WHEN _event = 'ticket_created'::public.notification_event THEN true
            WHEN _event = 'ticket_message_added'::public.notification_event
              THEN v_metadata->>'message_id' IS NOT NULL
               AND n.metadata->>'message_id' = v_metadata->>'message_id'
            ELSE n.title = _title AND n.body IS NOT DISTINCT FROM _body
          END
     );
    IF FOUND THEN count_inserted := count_inserted + 1; END IF;
  END LOOP;
  RETURN count_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_destination(uuid, uuid, text, text, text, public.notification_event, public.notification_priority) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_destination(uuid, uuid, text, text, text, public.notification_event, public.notification_priority) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
