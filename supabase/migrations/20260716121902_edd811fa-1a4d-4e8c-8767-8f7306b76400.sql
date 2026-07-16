
-- ============================================================
-- OmniBiz · Módulo Central de Suporte — Fase 1
-- ============================================================

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.support_ticket_type AS ENUM (
    'erro','alteracao','inclusao','duvida','acesso',
    'financeiro','rh','tarefas','ponto','ferias','despesas',
    'recibos','clientes','geolocalizacao','outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_ticket_priority AS ENUM ('baixa','normal','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_ticket_status AS ENUM (
    'aberto','em_analise','aguardando_cliente','em_desenvolvimento',
    'em_validacao','resolvido','rejeitado','fechado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend notification_event enum with ticket events
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'ticket_created';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'ticket_updated';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'ticket_message_added';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'ticket_status_changed';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'ticket_resolved';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'ticket_reopened';

-- 2. Human-readable ticket number: SUP-YYYY-NNNNNN
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq;

CREATE OR REPLACE FUNCTION public.generate_support_ticket_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('public.support_ticket_number_seq');
  RETURN 'SUP-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 6, '0');
END;
$$;

-- 3. support_tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE DEFAULT public.generate_support_ticket_number(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  requester_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type public.support_ticket_type NOT NULL DEFAULT 'outro',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  status public.support_ticket_status NOT NULL DEFAULT 'aberto',
  title text NOT NULL,
  description text NOT NULL,
  module text,
  route text,
  page_url text,
  technical_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_title_len CHECK (char_length(title) BETWEEN 3 AND 200),
  CONSTRAINT support_tickets_desc_len CHECK (char_length(description) BETWEEN 5 AND 10000)
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON public.support_tickets(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_requester ON public.support_tickets(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON public.support_tickets(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, priority, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT USAGE ON SEQUENCE public.support_ticket_number_seq TO authenticated, service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "super admin all support_tickets" ON public.support_tickets
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Managers/Owners: read tickets of their company
CREATE POLICY "managers view company support_tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id));

-- Requester (any role): read own tickets (fallback)
CREATE POLICY "requester view own support_tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

-- Managers: create tickets in their own company; requester must be self
CREATE POLICY "managers insert own company support_tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_manager(auth.uid(), company_id)
    AND requester_user_id = auth.uid()
  );

-- Managers: limited updates on their tickets (title/description/priority pre-response, cannot change status)
-- Business-level restriction on which columns/statuses is enforced in server functions.
CREATE POLICY "managers update own company support_tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.support_tickets_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_touch ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_touch
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_touch_updated_at();

-- 4. support_ticket_messages
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_messages_len CHECK (char_length(message) BETWEEN 1 AND 10000)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON public.support_ticket_messages(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin all support_ticket_messages" ON public.support_ticket_messages
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Managers: see NON-INTERNAL messages of company tickets
CREATE POLICY "managers view company support_ticket_messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    NOT is_internal
    AND public.is_company_manager(auth.uid(), company_id)
  );

-- Managers: post non-internal messages on their company tickets
CREATE POLICY "managers insert company support_ticket_messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    is_internal = false
    AND public.is_company_manager(auth.uid(), company_id)
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.company_id = company_id
    )
  );

-- 5. support_ticket_attachments
CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 21000000),
  sha256_hex text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_attachments_ticket ON public.support_ticket_attachments(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_attachments TO authenticated;
GRANT ALL ON public.support_ticket_attachments TO service_role;

ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin all support_ticket_attachments" ON public.support_ticket_attachments
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "managers view company support_ticket_attachments" ON public.support_ticket_attachments
  FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "managers insert company support_ticket_attachments" ON public.support_ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_manager(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.company_id = company_id
    )
  );

-- 6. support_ticket_events (append-only)
CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_events_ticket ON public.support_ticket_events(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_events TO authenticated;
GRANT ALL ON public.support_ticket_events TO service_role;

ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin all support_ticket_events" ON public.support_ticket_events
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "managers view company support_ticket_events" ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id));

-- Append-only: block UPDATE/DELETE via trigger (RLS above already denies non-super-admin)
CREATE OR REPLACE FUNCTION public.support_ticket_events_deny_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'support_ticket_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_events_no_update ON public.support_ticket_events;
CREATE TRIGGER trg_support_ticket_events_no_update
  BEFORE UPDATE OR DELETE ON public.support_ticket_events
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_events_deny_mutation();

-- 7. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_events;
