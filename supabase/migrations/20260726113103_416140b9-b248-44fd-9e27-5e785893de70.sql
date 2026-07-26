-- 1. profiles.whatsapp
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_whatsapp_e164_chk;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_whatsapp_e164_chk
  CHECK (whatsapp IS NULL OR whatsapp ~ '^\+[1-9][0-9]{7,14}$');

-- 2. default support manager per company
ALTER TABLE public.company_hr_settings
  ADD COLUMN IF NOT EXISTS default_support_manager_id uuid;

-- 3. platform_settings (singleton, global platform config)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id int PRIMARY KEY,
  default_support_super_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton_chk CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admin reads platform settings" ON public.platform_settings;
CREATE POLICY "super admin reads platform settings"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "super admin writes platform settings" ON public.platform_settings;
CREATE POLICY "super admin writes platform settings"
  ON public.platform_settings FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "super admin inserts platform settings" ON public.platform_settings;
CREATE POLICY "super admin inserts platform settings"
  ON public.platform_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_settings_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_settings_touch ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_touch
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.platform_settings_touch();

-- 4. whatsapp_notifications outbox
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  event text NOT NULL,
  recipient_user_id uuid,
  recipient_phone text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_notifications_status_idx
  ON public.whatsapp_notifications (status, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_notifications_company_idx
  ON public.whatsapp_notifications (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_notifications_ticket_idx
  ON public.whatsapp_notifications (ticket_id, created_at DESC);

GRANT SELECT ON public.whatsapp_notifications TO authenticated;
GRANT ALL ON public.whatsapp_notifications TO service_role;

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admin reads whatsapp notifications" ON public.whatsapp_notifications;
CREATE POLICY "super admin reads whatsapp notifications"
  ON public.whatsapp_notifications FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "managers read company whatsapp notifications" ON public.whatsapp_notifications;
CREATE POLICY "managers read company whatsapp notifications"
  ON public.whatsapp_notifications FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_manager(auth.uid(), company_id));

DROP TRIGGER IF EXISTS trg_whatsapp_notifications_touch ON public.whatsapp_notifications;
CREATE TRIGGER trg_whatsapp_notifications_touch
  BEFORE UPDATE ON public.whatsapp_notifications
  FOR EACH ROW EXECUTE FUNCTION public.platform_settings_touch();

-- 5. single-recipient resolution
CREATE OR REPLACE FUNCTION public.resolve_ticket_whatsapp_recipient(_ticket_id uuid)
RETURNS TABLE (user_id uuid, phone text, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.support_tickets%ROWTYPE;
  candidate uuid;
  prof RECORD;
  role_ok boolean;
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Ticket inexistente';
    RETURN;
  END IF;

  IF t.assigned_user_id IS NOT NULL THEN
    candidate := t.assigned_user_id;
  ELSIF t.current_owner_role = 'manager' THEN
    SELECT s.default_support_manager_id INTO candidate
    FROM public.company_hr_settings s WHERE s.company_id = t.company_id;
    IF candidate IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text,
        'Nenhum responsável único disponível para este ticket: responsável padrão de suporte não configurado para a empresa';
      RETURN;
    END IF;
  ELSIF t.current_owner_role = 'super_admin' THEN
    SELECT p.default_support_super_admin_id INTO candidate
    FROM public.platform_settings p WHERE p.id = 1;
    IF candidate IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text,
        'Nenhum responsável único disponível para este ticket: Super Admin de suporte padrão não configurado';
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text,
      'Nenhum responsável único disponível para este ticket';
    RETURN;
  END IF;

  SELECT pr.id, pr.is_active, pr.whatsapp INTO prof
  FROM public.profiles pr WHERE pr.id = candidate;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text,
      'Nenhum responsável único disponível para este ticket: perfil não encontrado';
    RETURN;
  END IF;

  IF prof.is_active IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text,
      'Nenhum responsável único disponível para este ticket: perfil inativo';
    RETURN;
  END IF;

  IF t.assigned_user_id IS NULL AND t.current_owner_role = 'super_admin' THEN
    SELECT public.is_super_admin(candidate) INTO role_ok;
    IF role_ok IS NOT TRUE THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text,
        'Nenhum responsável único disponível para este ticket: utilizador configurado não possui papel super_admin';
      RETURN;
    END IF;
  ELSIF t.assigned_user_id IS NULL AND t.current_owner_role = 'manager' THEN
    SELECT public.is_company_manager(candidate, t.company_id) INTO role_ok;
    IF role_ok IS NOT TRUE THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text,
        'Nenhum responsável único disponível para este ticket: utilizador configurado não é gestor ativo da empresa';
      RETURN;
    END IF;
  END IF;

  IF prof.whatsapp IS NULL OR prof.whatsapp !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text,
      'Nenhum responsável único disponível para este ticket: WhatsApp ausente ou inválido';
    RETURN;
  END IF;

  RETURN QUERY SELECT prof.id, prof.whatsapp, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_ticket_whatsapp_recipient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_ticket_whatsapp_recipient(uuid) TO authenticated, service_role;

-- 6. enqueue helper (transactional outbox)
CREATE OR REPLACE FUNCTION public.enqueue_ticket_whatsapp(
  _ticket_id uuid,
  _event text,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.support_tickets%ROWTYPE;
  r RECORD;
  new_id uuid;
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO r FROM public.resolve_ticket_whatsapp_recipient(_ticket_id);

  INSERT INTO public.whatsapp_notifications (
    company_id, ticket_id, event, recipient_user_id, recipient_phone,
    payload, status, last_error
  ) VALUES (
    t.company_id, _ticket_id, _event, r.user_id, r.phone,
    COALESCE(_payload, '{}'::jsonb) || jsonb_build_object(
      'ticket_number', t.ticket_number,
      'title', t.title,
      'status', t.status::text,
      'priority', t.priority::text,
      'support_level', t.support_level,
      'current_owner_role', t.current_owner_role
    ),
    CASE WHEN r.user_id IS NULL THEN 'skipped' ELSE 'pending' END,
    r.reason
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_ticket_whatsapp(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_ticket_whatsapp(uuid, text, jsonb) TO service_role;

-- 7. instrumentation triggers on tickets/messages
CREATE OR REPLACE FUNCTION public.support_tickets_whatsapp_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_created', '{}'::jsonb);
    RETURN NEW;
  END IF;

  IF NEW.escalated_to_super_admin AND NOT COALESCE(OLD.escalated_to_super_admin, false) THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_escalated',
      jsonb_build_object('escalation_reason', NEW.escalation_reason));
  ELSIF NEW.returned_to_manager_at IS DISTINCT FROM OLD.returned_to_manager_at
        AND NEW.returned_to_manager_at IS NOT NULL THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_returned_to_manager', '{}'::jsonb);
  ELSIF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id
        AND NEW.assigned_user_id IS NOT NULL THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_assigned', '{}'::jsonb);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_status_changed',
      jsonb_build_object('previous_status', OLD.status::text));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_whatsapp ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_whatsapp
  AFTER INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_whatsapp_trigger();

CREATE OR REPLACE FUNCTION public.support_messages_whatsapp_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_internal THEN RETURN NEW; END IF;
  PERFORM public.enqueue_ticket_whatsapp(NEW.ticket_id, 'ticket_message',
    jsonb_build_object('author_user_id', NEW.author_user_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_messages_whatsapp ON public.support_ticket_messages;
CREATE TRIGGER trg_support_messages_whatsapp
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_messages_whatsapp_trigger();