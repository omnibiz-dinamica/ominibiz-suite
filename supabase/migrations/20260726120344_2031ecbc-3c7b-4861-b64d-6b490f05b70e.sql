-- ============ 1. Fila: idempotência + máquina de estados ============
ALTER TABLE public.whatsapp_notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS http_status int,
  ADD COLUMN IF NOT EXISTS response_body text;

ALTER TABLE public.whatsapp_notifications
  DROP CONSTRAINT IF EXISTS whatsapp_notifications_status_check;
ALTER TABLE public.whatsapp_notifications
  ADD CONSTRAINT whatsapp_notifications_status_check
  CHECK (status IN ('pending','sending','sent','failed','skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_notifications_dedupe_uidx
  ON public.whatsapp_notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending','sending','sent');

CREATE INDEX IF NOT EXISTS whatsapp_notifications_claim_idx
  ON public.whatsapp_notifications (status, next_attempt_at);

-- ============ 2. enqueue idempotente ============
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
  final_payload jsonb;
  dkey text;
  new_id uuid;
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO r FROM public.resolve_ticket_whatsapp_recipient(_ticket_id);

  final_payload := COALESCE(_payload, '{}'::jsonb) || jsonb_build_object(
    'ticket_id', t.id,
    'ticket_number', t.ticket_number,
    'company_id', t.company_id,
    'title', t.title,
    'status', t.status::text,
    'priority', t.priority::text,
    'support_level', t.support_level,
    'current_owner_role', t.current_owner_role
  );

  dkey := t.id::text || ':' || _event || ':' || md5(final_payload::text);

  INSERT INTO public.whatsapp_notifications (
    company_id, ticket_id, event, recipient_user_id, recipient_phone,
    payload, status, last_error, dedupe_key
  ) VALUES (
    t.company_id, _ticket_id, _event, r.user_id, r.phone,
    final_payload,
    CASE WHEN r.user_id IS NULL THEN 'skipped' ELSE 'pending' END,
    r.reason,
    CASE WHEN r.user_id IS NULL THEN NULL ELSE dkey END
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_ticket_whatsapp(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_ticket_whatsapp(uuid, text, jsonb) TO service_role;

-- ============ 3. Trigger de tickets: eventos independentes ============
CREATE OR REPLACE FUNCTION public.support_tickets_whatsapp_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_states text[] := ARRAY['resolvido','fechado','resolved_by_manager','rejeitado'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_created', '{}'::jsonb);
    RETURN NEW;
  END IF;

  IF NEW.escalated_to_super_admin AND NOT COALESCE(OLD.escalated_to_super_admin, false) THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_escalated',
      jsonb_build_object('escalation_reason', NEW.escalation_reason));
  END IF;

  IF NEW.returned_to_manager_at IS DISTINCT FROM OLD.returned_to_manager_at
     AND NEW.returned_to_manager_at IS NOT NULL THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_returned_to_manager', '{}'::jsonb);
  END IF;

  IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id
     AND NEW.assigned_user_id IS NOT NULL THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_assigned', '{}'::jsonb);
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_priority_changed',
      jsonb_build_object('previous_priority', OLD.priority::text));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = ANY (closed_states) THEN
      PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_resolved',
        jsonb_build_object('previous_status', OLD.status::text));
    ELSIF OLD.status::text = ANY (closed_states) THEN
      PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_reopened',
        jsonb_build_object('previous_status', OLD.status::text));
    ELSE
      PERFORM public.enqueue_ticket_whatsapp(NEW.id, 'ticket_status_changed',
        jsonb_build_object('previous_status', OLD.status::text));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============ 4. Worker: claim / mark ============
CREATE OR REPLACE FUNCTION public.whatsapp_claim_batch(_limit int DEFAULT 10)
RETURNS SETOF public.whatsapp_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT n.id
    FROM public.whatsapp_notifications n
    WHERE (n.status = 'pending' AND n.next_attempt_at <= now())
       OR (n.status = 'sending' AND n.locked_at < now() - interval '10 minutes')
    ORDER BY n.next_attempt_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 10), 50))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_notifications w
  SET status = 'sending',
      locked_at = now(),
      attempts = w.attempts + 1
  FROM picked
  WHERE w.id = picked.id
  RETURNING w.*;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_claim_batch(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_claim_batch(int) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_mark_sent(
  _id uuid, _http_status int DEFAULT NULL, _response text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.whatsapp_notifications
  SET status = 'sent', sent_at = now(), locked_at = NULL,
      http_status = _http_status, response_body = left(COALESCE(_response,''), 2000),
      last_error = NULL
  WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_mark_sent(uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_mark_sent(uuid, int, text) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_mark_failed(
  _id uuid, _error text, _http_status int DEFAULT NULL, _response text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.whatsapp_notifications%ROWTYPE;
  delay_seconds int;
BEGIN
  SELECT * INTO n FROM public.whatsapp_notifications WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;

  IF n.attempts >= n.max_attempts THEN
    UPDATE public.whatsapp_notifications
    SET status = 'failed', locked_at = NULL, last_error = left(_error, 2000),
        http_status = _http_status, response_body = left(COALESCE(_response,''), 2000)
    WHERE id = _id;
  ELSE
    delay_seconds := LEAST(3600, 30 * power(2, GREATEST(n.attempts - 1, 0))::int);
    UPDATE public.whatsapp_notifications
    SET status = 'pending', locked_at = NULL, last_error = left(_error, 2000),
        http_status = _http_status, response_body = left(COALESCE(_response,''), 2000),
        next_attempt_at = now() + make_interval(secs => delay_seconds)
    WHERE id = _id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_mark_failed(uuid, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_mark_failed(uuid, text, int, text) TO service_role;

-- Reenfileirar manualmente (Super Admin)
CREATE OR REPLACE FUNCTION public.whatsapp_requeue(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas Super Admin pode reenfileirar notificações';
  END IF;
  UPDATE public.whatsapp_notifications
  SET status = 'pending', attempts = 0, next_attempt_at = now(),
      locked_at = NULL, last_error = NULL
  WHERE id = _id AND status IN ('failed','skipped');
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_requeue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_requeue(uuid) TO authenticated, service_role;

-- ============ 5. Dívida de segurança: search_path em funções antigas ============
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;