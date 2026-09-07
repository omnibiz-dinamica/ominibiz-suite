-- SUP-2026-000105: employees do not choose a support queue.
-- Their tickets are always opened in the Secretary queue. Managers, owners and
-- Super Admins retain the existing destination selection flow.
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  _company_id uuid,
  _type public.support_ticket_type,
  _priority public.support_ticket_priority,
  _title text,
  _description text,
  _module text,
  _route text,
  _page_url text,
  _technical_context jsonb,
  _destination_code text DEFAULT 'tech'
) RETURNS TABLE(id uuid, ticket_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  new_ticket public.support_tickets%ROWTYPE;
  v_is_sa boolean;
  v_is_mgr boolean;
  v_is_member boolean;
  v_created_by_role text;
  v_support_level text;
  v_owner_role text;
  v_escalated boolean;
  v_destination_code text;
  v_dest public.support_destinations%ROWTYPE;
BEGIN
  v_is_sa := public.is_super_admin(auth.uid());
  v_is_mgr := public.is_company_manager(auth.uid(), _company_id);
  v_is_member := v_is_mgr OR v_is_sa OR EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND (p.current_company_id = _company_id OR p.company_id_primary = _company_id)
  );

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- The queue is an administrative choice. Never trust a destination submitted
  -- by an employee client, including requests made directly against the RPC.
  v_destination_code := CASE
    WHEN v_is_sa OR v_is_mgr THEN COALESCE(NULLIF(_destination_code, ''), 'tech')
    ELSE 'secretary'
  END;

  SELECT * INTO v_dest FROM public.support_destinations
   WHERE code = v_destination_code AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'destination_required' USING ERRCODE = 'P0001';
  END IF;

  IF (
    SELECT count(*) FROM public.support_tickets
    WHERE requester_user_id = auth.uid()
      AND created_at > now() - interval '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  IF v_is_sa THEN
    v_created_by_role := 'super_admin';
    v_support_level := 'technical';
    v_owner_role := 'super_admin';
    v_escalated := true;
  ELSIF v_is_mgr THEN
    v_created_by_role := 'manager';
    v_support_level := 'company';
    v_owner_role := 'manager';
    v_escalated := false;
  ELSE
    v_created_by_role := 'employee';
    v_support_level := 'company';
    v_owner_role := 'manager';
    v_escalated := false;
  END IF;

  INSERT INTO public.support_tickets(
    company_id, requester_user_id, type, priority, title, description,
    module, route, page_url, technical_context,
    support_level, current_owner_role, escalated_to_super_admin, created_by_role,
    status, destination_code
  ) VALUES (
    _company_id, auth.uid(), _type, _priority, _title, _description,
    NULLIF(_module, ''), NULLIF(_route, ''), NULLIF(_page_url, ''),
    COALESCE(_technical_context, '{}'::jsonb),
    v_support_level, v_owner_role, v_escalated, v_created_by_role,
    'aberto'::public.support_ticket_status, v_dest.code
  )
  RETURNING * INTO new_ticket;

  PERFORM public.support_ticket_log_event(
    new_ticket.id, new_ticket.company_id,
    CASE v_created_by_role
      WHEN 'employee' THEN 'employee_ticket_created'
      WHEN 'super_admin' THEN 'super_admin_opened_ticket'
      ELSE 'manager_ticket_opened'
    END,
    NULL, to_jsonb(new_ticket),
    jsonb_build_object('destination_code', v_dest.code, 'destination_label', v_dest.label)
  );

  -- Gestores continuam a ser notificados (fluxo existente preservado).
  IF v_created_by_role IN ('employee','manager') THEN
    PERFORM public.support_notify_managers(
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
  ELSIF v_created_by_role = 'super_admin' THEN
    PERFORM public.support_notify_managers(
      new_ticket.company_id, new_ticket.id,
      'Novo ticket técnico · ' || new_ticket.ticket_number,
      new_ticket.title,
      'ticket_created'::public.notification_event,
      'alta'::public.notification_priority
    );
  END IF;

  -- Notificação específica da fila de destino.
  PERFORM public.support_notify_destination(
    new_ticket.company_id, new_ticket.id, v_dest.code,
    'Novo ticket destinado a ' || v_dest.label || ' · ' || new_ticket.ticket_number,
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
