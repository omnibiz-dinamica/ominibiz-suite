ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_company_archived
  ON public.support_tickets (company_id, archived_at);

-- Quem pode atender/assumir o ticket (distinto de support_can_close_ticket,
-- que também autoriza o solicitante a validar o próprio ticket).
CREATE OR REPLACE FUNCTION public.support_can_serve_ticket(_user_id uuid, _ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t public.support_tickets%ROWTYPE;
  v_tech boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;

  SELECT COALESCE(d.is_technical, false) INTO v_tech
    FROM public.support_destinations d WHERE d.code = t.destination_code;
  IF COALESCE(v_tech, false) THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user_id
       AND ur.company_id = t.company_id
       AND ur.role IN ('manager', 'owner')
  );
END;
$function$;

-- Sincroniza os avisos de um ticket com o claim: some para os outros, fica
-- em tratamento para quem assumiu. Nunca toca no estado operacional do ticket.
CREATE OR REPLACE FUNCTION public.support_sync_ticket_notifications(_ticket_id uuid, _claimed_by uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n int := 0;
BEGIN
  UPDATE public.notifications
     SET state = 'resolvida',
         state_changed_at = now(),
         state_changed_by = _claimed_by
   WHERE metadata->>'ticket_id' = _ticket_id::text
     AND state NOT IN ('resolvida', 'arquivada')
     AND (_claimed_by IS NULL OR user_id IS DISTINCT FROM _claimed_by);
  n := n + COALESCE(ROW_COUNT_SAFE(), 0);

  IF _claimed_by IS NOT NULL THEN
    UPDATE public.notifications
       SET state = 'em_tratamento',
           state_changed_at = now(),
           state_changed_by = _claimed_by
     WHERE metadata->>'ticket_id' = _ticket_id::text
       AND user_id = _claimed_by
       AND state = 'nova';
  END IF;

  RETURN n;
END;
$function$;

-- helper simples: ROW_COUNT não é expressão em plpgsql; evita dependência
CREATE OR REPLACE FUNCTION public.row_count_safe()
RETURNS integer LANGUAGE plpgsql AS $function$
BEGIN RETURN 0; END;
$function$;

-- Assumir ticket: responsável + claim do aviso numa única operação atómica.
CREATE OR REPLACE FUNCTION public.support_claim_ticket(_ticket_id uuid)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.support_tickets%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF NOT public.support_can_serve_ticket(v_uid, _ticket_id) THEN
    RAISE EXCEPTION 'Sem permissao para assumir este ticket' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_t FROM public.support_tickets WHERE id = _ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket nao encontrado' USING ERRCODE = 'P0002'; END IF;

  IF v_t.assigned_user_id IS NOT NULL AND v_t.assigned_user_id <> v_uid THEN
    RAISE EXCEPTION 'Este ticket ja foi assumido por outro gestor' USING ERRCODE = 'P0001';
  END IF;

  IF v_t.assigned_user_id IS NULL THEN
    UPDATE public.support_tickets
       SET assigned_user_id = v_uid, updated_at = now()
     WHERE id = _ticket_id
     RETURNING * INTO v_t;

    PERFORM public.support_ticket_log_event(
      _ticket_id, v_t.company_id, 'assignee_changed',
      jsonb_build_object('assigned_user_id', NULL),
      jsonb_build_object('assigned_user_id', v_uid),
      jsonb_build_object('source', 'claim')
    );
  END IF;

  PERFORM public.support_sync_ticket_notifications(_ticket_id, v_uid);
  RETURN v_t;
END;
$function$;

-- Arquivar: só visibilidade. NUNCA altera status.
CREATE OR REPLACE FUNCTION public.support_archive_ticket(_ticket_id uuid, _reason text DEFAULT NULL::text)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.support_tickets%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT * INTO v_t FROM public.support_tickets WHERE id = _ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket nao encontrado' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.support_can_close_ticket(v_uid, _ticket_id) THEN
    RAISE EXCEPTION 'Sem permissao para arquivar este ticket' USING ERRCODE = '42501';
  END IF;

  IF v_t.archived_at IS NOT NULL THEN
    RETURN v_t;
  END IF;

  UPDATE public.support_tickets
     SET archived_at = now(), archived_by = v_uid, updated_at = now()
   WHERE id = _ticket_id
   RETURNING * INTO v_t;

  PERFORM public.support_ticket_log_event(
    _ticket_id, v_t.company_id, 'archived',
    jsonb_build_object('archived_at', NULL),
    jsonb_build_object('archived_at', v_t.archived_at, 'archived_by', v_uid),
    jsonb_build_object('reason', v_reason, 'source', 'manual', 'status', v_t.status::text)
  );

  PERFORM public.support_sync_ticket_notifications(_ticket_id, NULL);
  RETURN v_t;
END;
$function$;

REVOKE ALL ON FUNCTION public.support_sync_ticket_notifications(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.row_count_safe() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_claim_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_archive_ticket(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_can_serve_ticket(uuid, uuid) TO authenticated;

-- Gatilho 3: com responsável definido, a resposta do solicitante avisa
-- apenas o responsável; sem responsável, continua a avisar a fila.
CREATE OR REPLACE FUNCTION public.post_support_ticket_message(_ticket_id uuid, _message text, _is_internal boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  is_sa boolean;
  is_queue boolean;
  new_msg_id uuid;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  is_sa := public.is_super_admin(auth.uid());
  is_queue := public.support_has_destination_access(auth.uid(), ticket.company_id, ticket.destination_code);

  IF NOT (is_sa OR public.is_company_manager(auth.uid(), ticket.company_id) OR is_queue
          OR ticket.requester_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF _is_internal AND NOT is_sa THEN
    RAISE EXCEPTION 'internal_notes_super_admin_only' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.support_ticket_messages(ticket_id, company_id, author_user_id, message, is_internal)
  VALUES (_ticket_id, ticket.company_id, auth.uid(), btrim(_message), COALESCE(_is_internal, false))
  RETURNING id INTO new_msg_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id,
    CASE WHEN _is_internal THEN 'internal_note_added' ELSE 'message_added' END,
    NULL,
    jsonb_build_object('message_id', new_msg_id, 'is_internal', _is_internal),
    '{}'::jsonb
  );

  IF (is_sa OR is_queue) AND ticket.first_response_at IS NULL AND NOT _is_internal THEN
    UPDATE public.support_tickets SET first_response_at = now() WHERE id = _ticket_id;
  END IF;

  IF NOT COALESCE(_is_internal, false) THEN
    IF ticket.requester_user_id IS DISTINCT FROM auth.uid() THEN
      PERFORM public.support_notify_user(
        ticket.requester_user_id, ticket.company_id, _ticket_id,
        'Resposta · ' || ticket.ticket_number, ticket.title,
        'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
      );
    ELSIF ticket.assigned_user_id IS NOT NULL THEN
      -- Responsável definido (claim): notificação de pessoa, não de papel.
      PERFORM public.support_notify_user(
        ticket.assigned_user_id, ticket.company_id, _ticket_id,
        'Nova mensagem · ' || ticket.ticket_number, ticket.title,
        'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
      );
    ELSE
      PERFORM public.support_notify_destination(
        ticket.company_id, _ticket_id, COALESCE(ticket.destination_code, 'tech'),
        'Nova mensagem · ' || ticket.ticket_number, ticket.title,
        'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
      );
    END IF;
  END IF;

  RETURN new_msg_id;
END;
$function$;