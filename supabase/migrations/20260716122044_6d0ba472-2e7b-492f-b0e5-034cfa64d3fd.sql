
-- ============================================================
-- OmniBiz · Suporte — RPCs de negócio
-- ============================================================

-- Helper: append event
CREATE OR REPLACE FUNCTION public.support_ticket_log_event(
  _ticket_id uuid,
  _company_id uuid,
  _event_type text,
  _before jsonb,
  _after jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.support_ticket_events(
    ticket_id, company_id, actor_user_id, event_type, before_data, after_data, metadata
  ) VALUES (
    _ticket_id, _company_id, auth.uid(), _event_type, _before, _after, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_log_event(uuid, uuid, text, jsonb, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_log_event(uuid, uuid, text, jsonb, jsonb, jsonb) TO authenticated;

-- Helper: notify all super admins
CREATE OR REPLACE FUNCTION public.support_notify_super_admins(
  _company_id uuid,
  _ticket_id uuid,
  _title text,
  _body text,
  _event public.notification_event,
  _priority public.notification_priority DEFAULT 'media'
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
  count_inserted int := 0;
BEGIN
  FOR target IN SELECT user_id FROM public.user_roles WHERE role = 'super_admin' LOOP
    INSERT INTO public.notifications(company_id, user_id, event, title, body, priority, metadata)
    VALUES (_company_id, target, _event, _title, _body, _priority,
            jsonb_build_object('ticket_id', _ticket_id));
    count_inserted := count_inserted + 1;
  END LOOP;
  RETURN count_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_super_admins(uuid, uuid, text, text, public.notification_event, public.notification_priority) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_super_admins(uuid, uuid, text, text, public.notification_event, public.notification_priority) TO authenticated;

-- Helper: notify a single user
CREATE OR REPLACE FUNCTION public.support_notify_user(
  _user_id uuid,
  _company_id uuid,
  _ticket_id uuid,
  _title text,
  _body text,
  _event public.notification_event,
  _priority public.notification_priority DEFAULT 'media'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.notifications(company_id, user_id, event, title, body, priority, metadata)
  VALUES (_company_id, _user_id, _event, _title, _body, _priority,
          jsonb_build_object('ticket_id', _ticket_id))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_user(uuid, uuid, uuid, text, text, public.notification_event, public.notification_priority) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_user(uuid, uuid, uuid, text, text, public.notification_event, public.notification_priority) TO authenticated;

-- ============================================================
-- Create ticket
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  _company_id uuid,
  _type public.support_ticket_type,
  _priority public.support_ticket_priority,
  _title text,
  _description text,
  _module text,
  _route text,
  _page_url text,
  _technical_context jsonb
) RETURNS TABLE (id uuid, ticket_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_ticket public.support_tickets%ROWTYPE;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.is_company_manager(auth.uid(), _company_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Rate limit: max 20 tickets per user per 24h
  IF (
    SELECT count(*) FROM public.support_tickets
    WHERE requester_user_id = auth.uid()
      AND created_at > now() - interval '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.support_tickets(
    company_id, requester_user_id, type, priority, title, description,
    module, route, page_url, technical_context
  ) VALUES (
    _company_id, auth.uid(), _type, _priority, _title, _description,
    NULLIF(_module, ''), NULLIF(_route, ''), NULLIF(_page_url, ''),
    COALESCE(_technical_context, '{}'::jsonb)
  )
  RETURNING * INTO new_ticket;

  PERFORM public.support_ticket_log_event(
    new_ticket.id, new_ticket.company_id, 'ticket_created', NULL,
    to_jsonb(new_ticket), '{}'::jsonb
  );

  PERFORM public.support_notify_super_admins(
    new_ticket.company_id, new_ticket.id,
    'Novo ticket · ' || new_ticket.ticket_number,
    new_ticket.title,
    'ticket_created'::public.notification_event,
    CASE new_ticket.priority
      WHEN 'urgente' THEN 'urgente'::public.notification_priority
      WHEN 'alta' THEN 'alta'::public.notification_priority
      ELSE 'media'::public.notification_priority
    END
  );

  RETURN QUERY SELECT new_ticket.id, new_ticket.ticket_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket(uuid, public.support_ticket_type, public.support_ticket_priority, text, text, text, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid, public.support_ticket_type, public.support_ticket_priority, text, text, text, text, text, jsonb) TO authenticated;

-- ============================================================
-- Post message
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_support_ticket_message(
  _ticket_id uuid,
  _message text,
  _is_internal boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  is_sa boolean;
  new_msg_id uuid;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  is_sa := public.is_super_admin(auth.uid());

  IF NOT (is_sa OR public.is_company_manager(auth.uid(), ticket.company_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF _is_internal AND NOT is_sa THEN
    RAISE EXCEPTION 'internal_notes_super_admin_only' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.support_ticket_messages(ticket_id, company_id, author_user_id, message, is_internal)
  VALUES (_ticket_id, ticket.company_id, auth.uid(), _message, COALESCE(_is_internal, false))
  RETURNING id INTO new_msg_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id,
    CASE WHEN _is_internal THEN 'internal_note_added' ELSE 'message_added' END,
    NULL,
    jsonb_build_object('message_id', new_msg_id, 'is_internal', _is_internal),
    '{}'::jsonb
  );

  -- First-response tracking
  IF is_sa AND ticket.first_response_at IS NULL AND NOT _is_internal THEN
    UPDATE public.support_tickets SET first_response_at = now() WHERE id = _ticket_id;
  END IF;

  IF NOT COALESCE(_is_internal, false) THEN
    IF is_sa THEN
      -- Notify requester
      PERFORM public.support_notify_user(
        ticket.requester_user_id, ticket.company_id, _ticket_id,
        'Resposta · ' || ticket.ticket_number, ticket.title,
        'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
      );
    ELSE
      -- Notify super admins
      PERFORM public.support_notify_super_admins(
        ticket.company_id, _ticket_id,
        'Nova mensagem · ' || ticket.ticket_number, ticket.title,
        'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
      );
    END IF;
  END IF;

  RETURN new_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_support_ticket_message(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.post_support_ticket_message(uuid, text, boolean) TO authenticated;

-- ============================================================
-- Update status (Super Admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_support_ticket_status(
  _ticket_id uuid,
  _new_status public.support_ticket_status,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  old_status public.support_ticket_status;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  old_status := ticket.status;

  UPDATE public.support_tickets SET
    status = _new_status,
    resolved_at = CASE WHEN _new_status = 'resolvido' THEN now() ELSE resolved_at END,
    closed_at = CASE WHEN _new_status = 'fechado' THEN now() ELSE closed_at END
  WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'status_changed',
    jsonb_build_object('status', old_status),
    jsonb_build_object('status', _new_status),
    COALESCE(jsonb_build_object('reason', _reason), '{}'::jsonb)
  );

  PERFORM public.support_notify_user(
    ticket.requester_user_id, ticket.company_id, _ticket_id,
    'Status atualizado · ' || ticket.ticket_number,
    'Novo status: ' || _new_status::text,
    CASE WHEN _new_status = 'resolvido' THEN 'ticket_resolved'::public.notification_event
         ELSE 'ticket_status_changed'::public.notification_event END,
    'media'::public.notification_priority
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_support_ticket_status(uuid, public.support_ticket_status, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_support_ticket_status(uuid, public.support_ticket_status, text) TO authenticated;

-- ============================================================
-- Update priority (Super Admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_support_ticket_priority(
  _ticket_id uuid,
  _new_priority public.support_ticket_priority
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  old_priority public.support_ticket_priority;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  old_priority := ticket.priority;
  UPDATE public.support_tickets SET priority = _new_priority WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'priority_changed',
    jsonb_build_object('priority', old_priority),
    jsonb_build_object('priority', _new_priority),
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_support_ticket_priority(uuid, public.support_ticket_priority) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_support_ticket_priority(uuid, public.support_ticket_priority) TO authenticated;

-- ============================================================
-- Assign responsible (Super Admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_support_ticket(
  _ticket_id uuid,
  _assignee_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  old_assignee uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  old_assignee := ticket.assigned_user_id;
  UPDATE public.support_tickets SET assigned_user_id = _assignee_user_id WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'assignee_changed',
    jsonb_build_object('assigned_user_id', old_assignee),
    jsonb_build_object('assigned_user_id', _assignee_user_id),
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_support_ticket(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_support_ticket(uuid, uuid) TO authenticated;

-- ============================================================
-- Reopen ticket (Manager within 7 days, or Super Admin any time)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reopen_support_ticket(
  _ticket_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  is_sa boolean;
  reference_close_at timestamptz;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  is_sa := public.is_super_admin(auth.uid());

  IF NOT (is_sa OR public.is_company_manager(auth.uid(), ticket.company_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF ticket.status NOT IN ('resolvido','fechado','rejeitado') THEN
    RAISE EXCEPTION 'ticket_not_closed' USING ERRCODE = 'P0001';
  END IF;

  reference_close_at := COALESCE(ticket.closed_at, ticket.resolved_at);

  IF NOT is_sa AND (reference_close_at IS NULL OR reference_close_at < now() - interval '7 days') THEN
    RAISE EXCEPTION 'reopen_window_expired' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.support_tickets SET
    status = 'em_analise',
    closed_at = NULL,
    resolved_at = NULL
  WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'ticket_reopened',
    jsonb_build_object('status', ticket.status),
    jsonb_build_object('status', 'em_analise'),
    jsonb_build_object('reason', _reason)
  );

  PERFORM public.support_notify_super_admins(
    ticket.company_id, _ticket_id,
    'Ticket reaberto · ' || ticket.ticket_number, ticket.title,
    'ticket_reopened'::public.notification_event, 'alta'::public.notification_priority
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_support_ticket(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reopen_support_ticket(uuid, text) TO authenticated;

-- ============================================================
-- Register attachment (after upload to storage)
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_support_attachment(
  _ticket_id uuid,
  _storage_path text,
  _file_name text,
  _mime_type text,
  _size_bytes bigint,
  _sha256_hex text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  new_id uuid;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin(auth.uid()) OR public.is_company_manager(auth.uid(), ticket.company_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.support_ticket_attachments(
    ticket_id, company_id, uploaded_by, storage_path, file_name, mime_type, size_bytes, sha256_hex
  ) VALUES (
    _ticket_id, ticket.company_id, auth.uid(),
    _storage_path, _file_name, _mime_type, _size_bytes, _sha256_hex
  )
  RETURNING id INTO new_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'attachment_added',
    NULL,
    jsonb_build_object('attachment_id', new_id, 'file_name', _file_name, 'size_bytes', _size_bytes),
    '{}'::jsonb
  );

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_support_attachment(uuid, text, text, text, bigint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_support_attachment(uuid, text, text, text, bigint, text) TO authenticated;
