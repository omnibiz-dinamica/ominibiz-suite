
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.contract_status AS ENUM
    ('draft','sent','signed','implementation','promo_period','active','suspended','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_service AS ENUM
    ('whatsapp','instagram','website','dashboard','ai_support','reports','scheduling');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_step AS ENUM
    ('operational_assessment','platform_configuration','ai_configuration','integrations','testing','training','go_live');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_step_status AS ENUM ('pending','in_progress','done','blocked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('pending','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============ TABLES ============
CREATE TABLE IF NOT EXISTS public.commercial_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  nif text,
  email text,
  phone text,
  address text,
  contact_name text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.commercial_clients(id) ON DELETE RESTRICT,
  template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  plan_name text NOT NULL,
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0,
  credits_limit int NOT NULL DEFAULT 0,
  promo_months int NOT NULL DEFAULT 0,
  promo_fee numeric(12,2),
  start_date date NOT NULL DEFAULT current_date,
  status public.contract_status NOT NULL DEFAULT 'draft',
  rendered_body text,
  pdf_path text,
  sign_token text UNIQUE,
  sign_expires_at timestamptz,
  signer_name text,
  signed_at timestamptz,
  signed_ip inet,
  signed_user_agent text,
  signature_hash text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);

CREATE TABLE IF NOT EXISTS public.contract_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service public.contract_service NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, service)
);

CREATE TABLE IF NOT EXISTS public.contract_workflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  step public.workflow_step NOT NULL,
  status public.workflow_step_status NOT NULL DEFAULT 'pending',
  assigned_to uuid,
  due_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, step)
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  reference text,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  paid_at timestamptz,
  status public.invoice_status NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON public.invoices(contract_id);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  credits_used int NOT NULL DEFAULT 0,
  cost numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, period_month)
);

-- ============ updated_at triggers ============
DROP TRIGGER IF EXISTS trg_commercial_clients_updated ON public.commercial_clients;
CREATE TRIGGER trg_commercial_clients_updated BEFORE UPDATE ON public.commercial_clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_contract_templates_updated ON public.contract_templates;
CREATE TRIGGER trg_contract_templates_updated BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_contracts_updated ON public.contracts;
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_workflow_updated ON public.contract_workflow;
CREATE TRIGGER trg_workflow_updated BEFORE UPDATE ON public.contract_workflow
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_invoices_updated ON public.invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ENABLE RLS ============
ALTER TABLE public.commercial_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES (super admin only) ============
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commercial_clients','contract_templates','contracts',
    'contract_services','contract_workflow','invoices','ai_usage'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "super_admin_all" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "super_admin_all" ON public.%I FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()))',
      t
    );
  END LOOP;
END $$;

-- ============ AFTER SIGNED → create workflow ============
CREATE OR REPLACE FUNCTION public.contracts_after_signed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.workflow_step;
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    FOREACH s IN ARRAY ARRAY[
      'operational_assessment'::public.workflow_step,
      'platform_configuration'::public.workflow_step,
      'ai_configuration'::public.workflow_step,
      'integrations'::public.workflow_step,
      'testing'::public.workflow_step,
      'training'::public.workflow_step,
      'go_live'::public.workflow_step
    ]
    LOOP
      INSERT INTO public.contract_workflow (contract_id, step, status)
      VALUES (NEW.id, s, 'pending')
      ON CONFLICT (contract_id, step) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contracts_after_signed ON public.contracts;
CREATE TRIGGER trg_contracts_after_signed
AFTER UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.contracts_after_signed();

-- ============ Public signing RPCs ============
CREATE OR REPLACE FUNCTION public.contract_sign_get(_token text)
RETURNS TABLE (
  id uuid, plan_name text, monthly_fee numeric, credits_limit int,
  promo_months int, promo_fee numeric, start_date date,
  rendered_body text, status public.contract_status,
  client_name text, signer_name text, signed_at timestamptz,
  sign_expires_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.plan_name, c.monthly_fee, c.credits_limit,
         c.promo_months, c.promo_fee, c.start_date,
         c.rendered_body, c.status,
         cl.company_name, c.signer_name, c.signed_at, c.sign_expires_at
  FROM public.contracts c
  JOIN public.commercial_clients cl ON cl.id = c.client_id
  WHERE c.sign_token = _token
$$;

CREATE OR REPLACE FUNCTION public.contract_sign_submit(
  _token text, _signer_name text, _user_agent text, _signature_hash text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_ip inet;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'Token inválido';
  END IF;
  IF _signer_name IS NULL OR length(trim(_signer_name)) < 2 THEN
    RAISE EXCEPTION 'Nome do signatário obrigatório';
  END IF;

  SELECT * INTO v_contract FROM public.contracts
   WHERE sign_token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  IF v_contract.status NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'Contrato já foi processado';
  END IF;
  IF v_contract.sign_expires_at IS NOT NULL AND v_contract.sign_expires_at < now() THEN
    RAISE EXCEPTION 'Link de assinatura expirado';
  END IF;

  BEGIN v_ip := inet_client_addr(); EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  UPDATE public.contracts SET
    status = 'signed',
    signer_name = _signer_name,
    signed_at = now(),
    signed_ip = v_ip,
    signed_user_agent = _user_agent,
    signature_hash = _signature_hash
  WHERE id = v_contract.id;

  RETURN v_contract.id;
END $$;

GRANT EXECUTE ON FUNCTION public.contract_sign_get(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contract_sign_submit(text, text, text, text) TO anon, authenticated;

-- ============ Storage bucket ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "contracts_super_admin_all" ON storage.objects;
CREATE POLICY "contracts_super_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'contracts' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'contracts' AND public.is_super_admin(auth.uid()));
