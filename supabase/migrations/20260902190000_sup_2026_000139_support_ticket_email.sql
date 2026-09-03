-- SUP-2026-000139: automatic email notification for newly created support tickets.
-- The outbox is populated in the same transaction as the ticket, while the
-- actual managed delivery is dispatched asynchronously by the application.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS support_email_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_notification_email text;

CREATE TABLE IF NOT EXISTS public.support_ticket_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  event_type text NOT NULL DEFAULT 'ticket_created',
  recipient_email text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_email_outbox_event_chk CHECK (event_type = 'ticket_created'),
  CONSTRAINT support_ticket_email_outbox_status_chk CHECK (
    status IN ('pending', 'sending', 'sent', 'suppressed', 'failed')
  ),
  CONSTRAINT support_ticket_email_outbox_ticket_event_uniq UNIQUE (ticket_id, event_type)
);

CREATE INDEX IF NOT EXISTS support_ticket_email_outbox_status_idx
  ON public.support_ticket_email_outbox(status, created_at);

GRANT ALL ON public.support_ticket_email_outbox TO service_role;
ALTER TABLE public.support_ticket_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.support_enqueue_ticket_created_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_recipient text;
  v_company_name text;
  v_requester_name text;
BEGIN
  -- Email configuration must never be able to roll back ticket creation.
  BEGIN
    SELECT s.support_email_notifications_enabled,
           NULLIF(trim(s.support_notification_email), '')
      INTO v_enabled, v_recipient
      FROM public.platform_settings s
     WHERE s.id = 1;

    IF COALESCE(v_enabled, false) IS NOT TRUE
       OR v_recipient IS NULL
       OR length(v_recipient) > 254
       OR v_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
      RETURN NEW;
    END IF;

    SELECT c.name INTO v_company_name
      FROM public.companies c
     WHERE c.id = NEW.company_id;

    SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Utilizador')
      INTO v_requester_name
      FROM public.profiles p
     WHERE p.id = NEW.requester_user_id;

    INSERT INTO public.support_ticket_email_outbox (
      ticket_id, company_id, event_type, recipient_email, payload
    ) VALUES (
      NEW.id,
      NEW.company_id,
      'ticket_created',
      lower(v_recipient),
      jsonb_build_object(
        'ticket_number', NEW.ticket_number,
        'company_name', COALESCE(v_company_name, 'Empresa'),
        'requester_name', COALESCE(v_requester_name, 'Utilizador'),
        'priority', NEW.priority::text,
        'status', NEW.status::text,
        'title', NEW.title,
        'ticket_url', 'https://ominibiz-suite.lovable.app/app/suporte/' || NEW.id::text
      )
    )
    ON CONFLICT (ticket_id, event_type) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'support ticket email enqueue failed for ticket %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.support_enqueue_ticket_created_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_enqueue_ticket_created_email() TO service_role;

DROP TRIGGER IF EXISTS trg_support_tickets_enqueue_email ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_enqueue_email
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.support_enqueue_ticket_created_email();

DROP TRIGGER IF EXISTS trg_support_ticket_email_outbox_touch ON public.support_ticket_email_outbox;
CREATE TRIGGER trg_support_ticket_email_outbox_touch
  BEFORE UPDATE ON public.support_ticket_email_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_settings_touch();
