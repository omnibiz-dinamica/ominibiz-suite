ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS destination_type text;

CREATE OR REPLACE FUNCTION public.reopen_support_ticket_with_message(
  _ticket_id uuid,
  _message text,
  _destination_type text,
  _assigned_user_id uuid DEFAULT NULL,
  _technical_context jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  is_sa boolean;
  new_msg_id uuid;
  target_user uuid;
  dest text;
  requester_is_employee boolean;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  is_sa := public.is_super_admin(auth.uid());

  IF NOT (is_sa OR public.is_company_manager(auth.uid(), ticket.company_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF ticket.status NOT IN ('resolvido','fechado','rejeitado','resolved_by_manager') THEN
    RAISE EXCEPTION 'ticket_not_closed' USING ERRCODE = 'P0001';
  END IF;

  IF _message IS NULL OR btrim(_message) = '' THEN
    RAISE EXCEPTION 'message_required' USING ERRCODE = 'P0001';
  END IF;

  requester_is_employee := NOT (
    public.is_company_manager(ticket.requester_user_id, ticket.company_id)
    OR public.is_super_admin(ticket.requester_user_id)
  );

  IF requester_is_employee THEN
    dest := 'employee';
    target_user := ticket.requester_user_id;
  ELSE
    dest := COALESCE(NULLIF(btrim(_destination_type), ''), 'technical');
    IF dest NOT IN ('employee','technical') THEN
      RAISE EXCEPTION 'invalid_destination_type' USING ERRCODE = 'P0001';
    END IF;
    IF dest = 'employee' THEN
      IF _assigned_user_id IS NULL THEN
        RAISE EXCEPTION 'assigned_user_required' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _assigned_user_id
          AND COALESCE(p.is_active, true)
          AND public.is_company_member(p.id, ticket.company_id)
      ) THEN
        RAISE EXCEPTION 'employee_not_valid' USING ERRCODE = 'P0001';
      END IF;
      target_user := _assigned_user_id;
    ELSE
      target_user := NULL;
    END IF;
  END IF;

  INSERT INTO public.support_ticket_messages(ticket_id, company_id, author_user_id, message, is_internal)
  VALUES (_ticket_id, ticket.company_id, auth.uid(), btrim(_message), false)
  RETURNING id INTO new_msg_id;

  IF dest = 'employee' THEN
    UPDATE public.support_tickets SET
      status = 'aberto'::public.support_ticket_status,
      destination_type = 'employee',
      support_level = 'company',
      current_owner_role = 'employee',
      assigned_user_id = target_user,
      closed_at = NULL,
      resolved_at = NULL,
      archived_at = NULL
    WHERE id = _ticket_id;
  ELSE
    UPDATE public.support_tickets SET
      status = 'aberto'::public.support_ticket_status,
      destination_type = 'technical',
      support_level = 'technical',
      current_owner_role = 'super_admin',
      escalated_to_super_admin = true,
      escalated_by = auth.uid(),
      escalated_at = now(),
      technical_context = CASE
        WHEN _technical_context IS NULL THEN technical_context
        ELSE COALESCE(technical_context, '{}'::jsonb) || _technical_context
      END,
      closed_at = NULL,
      resolved_at = NULL,
      archived_at = NULL
    WHERE id = _ticket_id;
  END IF;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'ticket_reopened',
    jsonb_build_object('status', ticket.status, 'support_level', ticket.support_level,
                       'assigned_user_id', ticket.assigned_user_id),
    jsonb_build_object('status', 'aberto', 'destination_type', dest,
                       'assigned_user_id', target_user),
    jsonb_build_object(
      'previous_status', ticket.status,
      'new_status', 'aberto',
      'destination_type', dest,
      'assigned_user_id', target_user,
      'technical_context', _technical_context,
      'reopened_at', now(),
      'message', btrim(_message)
    )
  );

  IF dest = 'employee' THEN
    PERFORM public.support_notify_user(
      target_user, ticket.company_id, _ticket_id,
      'Ticket reaberto · ' || ticket.ticket_number,
      'Seu ticket foi reaberto pelo Gestor.',
      'ticket_reopened'::public.notification_event, 'alta'::public.notification_priority
    );
  ELSE
    PERFORM public.support_notify_super_admins(
      ticket.company_id, _ticket_id,
      'Encaminhado ao Suporte Técnico · ' || ticket.ticket_number,
      'Novo ticket encaminhado para Suporte Técnico.',
      'ticket_reopened'::public.notification_event, 'alta'::public.notification_priority
    );
  END IF;

  PERFORM public.enqueue_ticket_whatsapp(
    _ticket_id, 'ticket_reopened',
    jsonb_build_object('destination_type', dest, 'assigned_user_id', target_user)
  );

  RETURN new_msg_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_support_ticket_with_message(uuid, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_support_ticket_with_message(uuid, text, text, uuid, jsonb) TO authenticated;