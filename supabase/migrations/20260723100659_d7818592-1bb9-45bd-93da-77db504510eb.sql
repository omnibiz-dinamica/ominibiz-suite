
-- ============================================================
-- Central de Suporte · Fluxo em 2 Níveis (Nível 1 Empresa / Nível 2 Técnico)
-- ============================================================

-- 1. Estender enum de status (aditivo)
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'under_manager_review';
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'waiting_employee';
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'resolved_by_manager';
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'escalated';
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'under_technical_review';
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'waiting_manager';
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'returned_to_manager';

-- 2. Novas colunas em support_tickets
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS support_level text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS current_owner_role text NOT NULL DEFAULT 'manager',
  ADD COLUMN IF NOT EXISTS escalated_to_super_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS returned_to_manager_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_to_manager_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_role text,
  ADD COLUMN IF NOT EXISTS technical_summary text,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS internal_resolution text;

DO $$ BEGIN
  ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_level_chk CHECK (support_level IN ('company','technical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_owner_role_chk CHECK (current_owner_role IN ('manager','super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Backfill: tickets existentes preservam comportamento atual (visíveis a SA)
UPDATE public.support_tickets
   SET support_level = 'technical',
       current_owner_role = 'super_admin',
       escalated_to_super_admin = true,
       escalated_at = COALESCE(escalated_at, created_at)
 WHERE support_level = 'company' AND created_at < now();

UPDATE public.support_tickets t
   SET created_by_role = CASE
     WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = t.requester_user_id AND ur.role = 'super_admin') THEN 'super_admin'
     WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = t.requester_user_id AND ur.role IN ('owner','manager')) THEN 'manager'
     ELSE 'employee'
   END
 WHERE created_by_role IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_level_owner
  ON public.support_tickets(support_level, current_owner_role, created_at DESC);

-- 4. Ajustar policies de support_tickets

-- Remover a policy antiga que exigia gestor/super admin no INSERT
DROP POLICY IF EXISTS "managers insert own company support_tickets" ON public.support_tickets;

-- Funcionário: ver os próprios tickets
DROP POLICY IF EXISTS "employees view own support_tickets" ON public.support_tickets;
CREATE POLICY "employees view own support_tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

-- Insert: qualquer utilizador autenticado pertencente à empresa pode criar ticket
-- (Funcionário via profiles.current_company_id / company_id_primary; Gestor via helper).
DROP POLICY IF EXISTS "members insert own company support_tickets" ON public.support_tickets;
CREATE POLICY "members insert own company support_tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_company_manager(auth.uid(), company_id)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (p.current_company_id = company_id OR p.company_id_primary = company_id)
      )
    )
  );

-- Trigger: bloquear alterações proibidas (Funcionário jamais altera campos sensíveis;
-- ninguém troca company_id; escalonamento fora das RPCs é bloqueado).
CREATE OR REPLACE FUNCTION public.support_tickets_prevent_forbidden_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  v_is_mgr boolean;
  v_is_employee boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_sa := public.is_super_admin(v_uid);
  v_is_mgr := public.is_company_manager(v_uid, OLD.company_id);
  v_is_employee := NOT v_is_sa AND NOT v_is_mgr;

  -- Ninguém troca company_id
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id_immutable' USING ERRCODE = '42501';
  END IF;

  IF v_is_employee THEN
    IF NEW.support_level IS DISTINCT FROM OLD.support_level
       OR NEW.current_owner_role IS DISTINCT FROM OLD.current_owner_role
       OR NEW.escalated_to_super_admin IS DISTINCT FROM OLD.escalated_to_super_admin
       OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.escalated_at IS DISTINCT FROM OLD.escalated_at
       OR NEW.escalated_by IS DISTINCT FROM OLD.escalated_by
       OR NEW.returned_to_manager_at IS DISTINCT FROM OLD.returned_to_manager_at
       OR NEW.returned_to_manager_by IS DISTINCT FROM OLD.returned_to_manager_by
       OR NEW.created_by_role IS DISTINCT FROM OLD.created_by_role THEN
      RAISE EXCEPTION 'employee_cannot_update_sensitive_fields' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_prevent_forbidden ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_prevent_forbidden
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_prevent_forbidden_updates();

-- 5. Policies de mensagens: permitir Funcionário responder no próprio ticket
DROP POLICY IF EXISTS "requester view own support_ticket_messages" ON public.support_ticket_messages;
CREATE POLICY "requester view own support_ticket_messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    NOT is_internal
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND t.requester_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "requester insert own support_ticket_messages" ON public.support_ticket_messages;
CREATE POLICY "requester insert own support_ticket_messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    is_internal = false
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.company_id = support_ticket_messages.company_id
        AND t.requester_user_id = auth.uid()
    )
  );

-- Attachments: permitir Funcionário ver/anexar no próprio ticket
DROP POLICY IF EXISTS "requester view own support_ticket_attachments" ON public.support_ticket_attachments;
CREATE POLICY "requester view own support_ticket_attachments" ON public.support_ticket_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.requester_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "requester insert own support_ticket_attachments" ON public.support_ticket_attachments;
CREATE POLICY "requester insert own support_ticket_attachments" ON public.support_ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.company_id = support_ticket_attachments.company_id
        AND t.requester_user_id = auth.uid()
    )
  );

-- Events: Funcionário vê eventos não-internos dos próprios tickets
DROP POLICY IF EXISTS "requester view own support_ticket_events" ON public.support_ticket_events;
CREATE POLICY "requester view own support_ticket_events" ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (
    event_type NOT IN ('internal_note_added')
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_events.ticket_id
        AND t.requester_user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. Helper: notificar gestores/owners de uma empresa
-- ============================================================
CREATE OR REPLACE FUNCTION public.support_notify_managers(
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
  FOR target IN
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role IN ('manager','owner')
       AND ur.company_id = _company_id
  LOOP
    INSERT INTO public.notifications(company_id, user_id, event, title, body, priority, metadata)
    VALUES (_company_id, target, _event, _title, _body, _priority,
            jsonb_build_object('ticket_id', _ticket_id));
    count_inserted := count_inserted + 1;
  END LOOP;
  RETURN count_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_managers(uuid, uuid, text, text, public.notification_event, public.notification_priority) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_managers(uuid, uuid, text, text, public.notification_event, public.notification_priority) TO authenticated;

-- ============================================================
-- 7. Reescreve create_support_ticket para detectar papel do criador
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
  v_is_sa boolean;
  v_is_mgr boolean;
  v_is_member boolean;
  v_created_by_role text;
  v_support_level text;
  v_owner_role text;
  v_escalated boolean;
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
    status
  ) VALUES (
    _company_id, auth.uid(), _type, _priority, _title, _description,
    NULLIF(_module, ''), NULLIF(_route, ''), NULLIF(_page_url, ''),
    COALESCE(_technical_context, '{}'::jsonb),
    v_support_level, v_owner_role, v_escalated, v_created_by_role,
    'aberto'::public.support_ticket_status
  )
  RETURNING * INTO new_ticket;

  PERFORM public.support_ticket_log_event(
    new_ticket.id, new_ticket.company_id,
    CASE v_created_by_role
      WHEN 'employee' THEN 'employee_ticket_created'
      WHEN 'super_admin' THEN 'super_admin_opened_ticket'
      ELSE 'manager_ticket_opened'
    END,
    NULL, to_jsonb(new_ticket), '{}'::jsonb
  );

  -- Notificações conforme o papel do criador
  IF v_created_by_role = 'employee' OR v_created_by_role = 'manager' THEN
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

  RETURN QUERY SELECT new_ticket.id, new_ticket.ticket_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket(uuid, public.support_ticket_type, public.support_ticket_priority, text, text, text, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid, public.support_ticket_type, public.support_ticket_priority, text, text, text, text, text, jsonb) TO authenticated;

-- ============================================================
-- 8. Escalate para Super Admin (Gestor/Owner)
-- ============================================================
CREATE OR REPLACE FUNCTION public.escalate_support_ticket(
  _ticket_id uuid,
  _reason text,
  _technical_summary text DEFAULT NULL,
  _impact text DEFAULT NULL,
  _suggested_priority public.support_ticket_priority DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin(auth.uid()) OR public.is_company_manager(auth.uid(), ticket.company_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF ticket.support_level = 'technical' AND ticket.escalated_to_super_admin THEN
    RAISE EXCEPTION 'ticket_already_escalated' USING ERRCODE = 'P0001';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'escalation_reason_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.support_tickets SET
    support_level = 'technical',
    current_owner_role = 'super_admin',
    escalated_to_super_admin = true,
    escalated_at = now(),
    escalated_by = auth.uid(),
    escalation_reason = _reason,
    technical_summary = COALESCE(_technical_summary, technical_summary),
    priority = COALESCE(_suggested_priority, priority),
    status = 'escalated'::public.support_ticket_status
  WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'manager_escalated_ticket',
    jsonb_build_object('status', ticket.status, 'support_level', ticket.support_level),
    jsonb_build_object('status', 'escalated', 'support_level', 'technical'),
    jsonb_build_object('reason', _reason, 'technical_summary', _technical_summary, 'impact', _impact)
  );

  PERFORM public.support_notify_super_admins(
    ticket.company_id, _ticket_id,
    'Encaminhado · ' || ticket.ticket_number, ticket.title,
    'ticket_updated'::public.notification_event,
    CASE COALESCE(_suggested_priority, ticket.priority)
      WHEN 'urgente' THEN 'urgente'::public.notification_priority
      WHEN 'alta' THEN 'alta'::public.notification_priority
      ELSE 'media'::public.notification_priority
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_support_ticket(uuid, text, text, text, public.support_ticket_priority) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.escalate_support_ticket(uuid, text, text, text, public.support_ticket_priority) TO authenticated;

-- ============================================================
-- 9. Resolver internamente (Gestor)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_support_ticket_by_manager(
  _ticket_id uuid,
  _resolution text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_company_manager(auth.uid(), ticket.company_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF ticket.support_level <> 'company' THEN
    RAISE EXCEPTION 'ticket_not_in_manager_scope' USING ERRCODE = 'P0001';
  END IF;

  IF _resolution IS NULL OR btrim(_resolution) = '' THEN
    RAISE EXCEPTION 'resolution_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.support_tickets SET
    status = 'resolved_by_manager'::public.support_ticket_status,
    internal_resolution = _resolution,
    resolved_at = now()
  WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'manager_resolved_ticket',
    jsonb_build_object('status', ticket.status),
    jsonb_build_object('status', 'resolved_by_manager'),
    jsonb_build_object('resolution', _resolution)
  );

  PERFORM public.support_notify_user(
    ticket.requester_user_id, ticket.company_id, _ticket_id,
    'Resolvido · ' || ticket.ticket_number, ticket.title,
    'ticket_resolved'::public.notification_event, 'media'::public.notification_priority
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_support_ticket_by_manager(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_support_ticket_by_manager(uuid, text) TO authenticated;

-- ============================================================
-- 10. Solicitar mais informações (Gestor → Funcionário)
-- ============================================================
CREATE OR REPLACE FUNCTION public.manager_request_information(
  _ticket_id uuid,
  _message text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  new_msg uuid;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_company_manager(auth.uid(), ticket.company_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF _message IS NULL OR btrim(_message) = '' THEN
    RAISE EXCEPTION 'message_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.support_ticket_messages(ticket_id, company_id, author_user_id, message, is_internal)
  VALUES (_ticket_id, ticket.company_id, auth.uid(), _message, false)
  RETURNING id INTO new_msg;

  UPDATE public.support_tickets SET
    status = 'waiting_employee'::public.support_ticket_status
  WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'manager_requested_information',
    jsonb_build_object('status', ticket.status),
    jsonb_build_object('status', 'waiting_employee', 'message_id', new_msg),
    '{}'::jsonb
  );

  PERFORM public.support_notify_user(
    ticket.requester_user_id, ticket.company_id, _ticket_id,
    'Aguardando informação · ' || ticket.ticket_number, ticket.title,
    'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manager_request_information(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.manager_request_information(uuid, text) TO authenticated;

-- ============================================================
-- 11. Devolver ao Gestor (Super Admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.return_support_ticket_to_manager(
  _ticket_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin_only' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'return_reason_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.support_tickets SET
    support_level = 'company',
    current_owner_role = 'manager',
    returned_to_manager_at = now(),
    returned_to_manager_by = auth.uid(),
    status = 'returned_to_manager'::public.support_ticket_status
  WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'super_admin_returned_ticket',
    jsonb_build_object('status', ticket.status, 'support_level', ticket.support_level),
    jsonb_build_object('status', 'returned_to_manager', 'support_level', 'company'),
    jsonb_build_object('reason', _reason)
  );

  PERFORM public.support_notify_managers(
    ticket.company_id, _ticket_id,
    'Devolvido pelo Suporte · ' || ticket.ticket_number, ticket.title,
    'ticket_updated'::public.notification_event, 'alta'::public.notification_priority
  );
END;
$$;

REVOKE ALL ON FUNCTION public.return_support_ticket_to_manager(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.return_support_ticket_to_manager(uuid, text) TO authenticated;
