-- Etapa A — encerramento de tickets por papel + notificações sem auto-aviso e idempotentes.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 1) Regra canónica de quem pode encerrar
CREATE OR REPLACE FUNCTION public.support_can_close_ticket(_user_id uuid, _ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t public.support_tickets%ROWTYPE;
  v_tech boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Super Admin: sempre, qualquer categoria, qualquer estado.
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;

  -- Solicitante valida/arquiva o seu próprio ticket (regra existente preservada).
  IF t.requester_user_id = _user_id THEN RETURN true; END IF;

  SELECT COALESCE(d.is_technical, false) INTO v_tech
    FROM public.support_destinations d
   WHERE d.code = t.destination_code;

  -- Fila Suporte/Desenvolvimento: apenas super_admin (até existir papel Desenvolvedor).
  IF COALESCE(v_tech, false) THEN RETURN false; END IF;

  -- Secretaria / Contabilidade: qualquer gestor (ou proprietário) da empresa do ticket.
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user_id
       AND ur.company_id = t.company_id
       AND ur.role IN ('manager', 'owner')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.support_can_close_ticket(uuid, uuid) TO authenticated;

-- 2) Notificações: nunca notificar o próprio autor da ação + idempotência
CREATE OR REPLACE FUNCTION public.support_notify_user(_user_id uuid, _company_id uuid, _ticket_id uuid, _title text, _body text, _event notification_event, _priority notification_priority DEFAULT 'media'::notification_priority)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
  v_meta jsonb := jsonb_build_object('ticket_id', _ticket_id);
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN RETURN NULL; END IF;
  IF _user_id = auth.uid() THEN RETURN NULL; END IF;

  INSERT INTO public.notifications(company_id, user_id, event, title, body, priority, metadata)
  SELECT _company_id, _user_id, _event, _title, _body, _priority, v_meta
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.company_id = _company_id
       AND n.user_id = _user_id
       AND n.event = _event
       AND n.title = _title
       AND n.body IS NOT DISTINCT FROM _body
       AND n.metadata = v_meta
       AND n.created_at > now() - interval '1 minute'
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_notify_super_admins(_company_id uuid, _ticket_id uuid, _title text, _body text, _event notification_event, _priority notification_priority DEFAULT 'media'::notification_priority)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target uuid;
  count_inserted int := 0;
  v_meta jsonb := jsonb_build_object('ticket_id', _ticket_id);
BEGIN
  FOR target IN
    SELECT DISTINCT user_id FROM public.user_roles
     WHERE role = 'super_admin' AND user_id IS DISTINCT FROM auth.uid()
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
    IF FOUND THEN count_inserted := count_inserted + 1; END IF;
  END LOOP;
  RETURN count_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_notify_destination(_company_id uuid, _ticket_id uuid, _destination_code text, _title text, _body text, _event notification_event DEFAULT 'ticket_created'::notification_event, _priority notification_priority DEFAULT 'media'::notification_priority)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d public.support_destinations%ROWTYPE;
  target uuid;
  n int := 0;
  v_meta jsonb;
BEGIN
  SELECT * INTO d FROM public.support_destinations WHERE code = _destination_code;
  IF NOT FOUND OR d.target_role IS NULL THEN RETURN 0; END IF;

  IF d.is_technical THEN
    RETURN public.support_notify_super_admins(_company_id, _ticket_id, _title, _body, _event, _priority);
  END IF;

  v_meta := jsonb_build_object('ticket_id', _ticket_id, 'destination_code', _destination_code);

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
$function$;

CREATE OR REPLACE FUNCTION public.support_notify_managers(_company_id uuid, _ticket_id uuid, _title text, _body text, _event notification_event, _priority notification_priority DEFAULT 'media'::notification_priority)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target uuid;
  count_inserted integer := 0;
  v_meta jsonb := jsonb_build_object('ticket_id', _ticket_id);
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
    CONTINUE WHEN target IS NOT DISTINCT FROM auth.uid();

    INSERT INTO public.notifications (
      company_id, user_id, task_id, event, title, body, priority, metadata
    )
    SELECT _company_id, target, NULL, _event, _title, _body, _priority, v_meta
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.company_id = _company_id
         AND n.user_id = target
         AND n.task_id IS NULL
         AND n.event = _event
         AND n.title = _title
         AND n.body IS NOT DISTINCT FROM _body
         AND n.metadata = v_meta
    );

    IF FOUND THEN count_inserted := count_inserted + 1; END IF;
  END LOOP;

  RETURN count_inserted;
END;
$function$;

-- 3) Encerramento: permissão por papel/categoria + auditoria + aviso ao solicitante
CREATE OR REPLACE FUNCTION public.close_support_ticket(_ticket_id uuid, _reason text DEFAULT NULL::text)
RETURNS support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ticket public.support_tickets%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_prev text;
  v_is_sa boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  SELECT * INTO v_ticket
    FROM public.support_tickets
   WHERE id = _ticket_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket nao encontrado';
  END IF;

  IF NOT public.support_can_close_ticket(v_uid, _ticket_id) THEN
    RAISE EXCEPTION 'Sem permissao para arquivar este ticket' USING ERRCODE = '42501';
  END IF;

  IF v_ticket.status = 'fechado' THEN
    RETURN v_ticket;
  END IF;

  v_is_sa := public.is_super_admin(v_uid);

  -- Super Admin encerra em qualquer estado; restantes papéis mantêm o fluxo de validação.
  IF NOT v_is_sa AND v_ticket.status NOT IN (
       'resolvido', 'resolved_by_manager', 'rejeitado',
       'waiting_manager', 'waiting_employee', 'aguardando_cliente',
       'returned_to_manager', 'em_validacao'
     ) THEN
    RAISE EXCEPTION 'Apenas tickets resolvidos, rejeitados ou a aguardar validacao podem ser arquivados';
  END IF;

  v_prev := v_ticket.status::text;

  UPDATE public.support_tickets
     SET status = 'fechado',
         closed_at = now(),
         closed_by = v_uid,
         updated_at = now()
   WHERE id = _ticket_id
   RETURNING * INTO v_ticket;

  PERFORM public.support_ticket_log_event(
    _ticket_id,
    v_ticket.company_id,
    'status_changed',
    jsonb_build_object('status', v_prev),
    jsonb_build_object('status', 'fechado'),
    jsonb_build_object(
      'reason', COALESCE(v_reason, 'Validado pelo solicitante'),
      'closed_by', v_uid,
      'closed_at', v_ticket.closed_at
    )
  );

  PERFORM public.support_notify_user(
    v_ticket.requester_user_id, v_ticket.company_id, _ticket_id,
    'Ticket encerrado · ' || v_ticket.ticket_number,
    COALESCE(v_reason, v_ticket.title),
    'ticket_status_changed'::public.notification_event,
    'media'::public.notification_priority
  );

  RETURN v_ticket;
END;
$function$;

-- 4) Resposta: solicitante é sempre avisado; resposta do solicitante avisa a fila responsável
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
  VALUES (_ticket_id, ticket.company_id, auth.uid(), _message, COALESCE(_is_internal, false))
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
      -- Resposta do atendimento (gestor, fila ou super_admin) -> avisa o solicitante.
      PERFORM public.support_notify_user(
        ticket.requester_user_id, ticket.company_id, _ticket_id,
        'Resposta · ' || ticket.ticket_number, ticket.title,
        'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
      );
    ELSE
      -- Resposta do solicitante -> avisa a fila responsável (técnica cai no super_admin).
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