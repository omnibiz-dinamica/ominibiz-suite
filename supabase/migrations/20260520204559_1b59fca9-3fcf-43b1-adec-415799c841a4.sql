
-- ============ commercial_clients extensions ============
DO $$ BEGIN
  CREATE TYPE public.commercial_client_status AS ENUM ('lead','negotiation','active','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.commercial_clients
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS tax_id_kind text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'PT',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS status public.commercial_client_status NOT NULL DEFAULT 'lead';

-- ============ commercial_client_contacts ============
CREATE TABLE IF NOT EXISTS public.commercial_client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.commercial_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  is_primary_signer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commercial_client_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_admin_all ON public.commercial_client_contacts;
CREATE POLICY super_admin_all ON public.commercial_client_contacts
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON public.commercial_client_contacts(client_id);

-- ============ contract_templates extensions ============
ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- ============ contracts extensions ============
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notice_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS jurisdiction text,
  ADD COLUMN IF NOT EXISTS contract_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============ contract_audit_events ============
CREATE TABLE IF NOT EXISTS public.contract_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_admin_all ON public.contract_audit_events;
CREATE POLICY super_admin_all ON public.contract_audit_events
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_audit_contract ON public.contract_audit_events(contract_id, created_at DESC);

-- ============ Triggers: audit ============
CREATE OR REPLACE FUNCTION public.contracts_audit_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.contract_audit_events(contract_id, actor_id, event_type, metadata)
  VALUES (NEW.id, NEW.created_by, 'created',
    jsonb_build_object('status', NEW.status, 'plan', NEW.plan_name));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.contracts_audit_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.contract_audit_events(contract_id, actor_id, event_type, metadata)
    VALUES (NEW.id, auth.uid(),
      CASE NEW.status::text
        WHEN 'sent' THEN 'sent'
        WHEN 'signed' THEN 'signed'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'expired' THEN 'expired'
        ELSE 'status_changed'
      END,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  ELSIF NEW.rendered_body IS DISTINCT FROM OLD.rendered_body
        OR NEW.contract_data IS DISTINCT FROM OLD.contract_data THEN
    INSERT INTO public.contract_audit_events(contract_id, actor_id, event_type, metadata)
    VALUES (NEW.id, auth.uid(), 'edited', '{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contracts_audit_ins ON public.contracts;
CREATE TRIGGER trg_contracts_audit_ins AFTER INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_audit_insert();

DROP TRIGGER IF EXISTS trg_contracts_audit_upd ON public.contracts;
CREATE TRIGGER trg_contracts_audit_upd AFTER UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_audit_update();

-- ============ Public RPC: register 'viewed' via token ============
CREATE OR REPLACE FUNCTION public.contract_sign_register_view(_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.contracts WHERE sign_token = _token;
  IF v_id IS NULL THEN RETURN; END IF;
  -- Dedup: only insert one 'viewed' per hour
  IF NOT EXISTS (
    SELECT 1 FROM public.contract_audit_events
    WHERE contract_id = v_id AND event_type = 'viewed'
      AND created_at > now() - interval '1 hour'
  ) THEN
    INSERT INTO public.contract_audit_events(contract_id, event_type, metadata)
    VALUES (v_id, 'viewed', '{}'::jsonb);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.audit_list(_contract_id uuid)
RETURNS SETOF public.contract_audit_events
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.contract_audit_events
  WHERE contract_id = _contract_id
    AND public.is_super_admin(auth.uid())
  ORDER BY created_at DESC
$$;
