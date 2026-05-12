
-- Extend companies with operational fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'pt-PT',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon';

-- Restrict country to PT/BR/ES via trigger (avoid CHECK to keep flexibility)
CREATE OR REPLACE FUNCTION public.validate_company_country()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.country NOT IN ('PT','BR','ES') THEN
    RAISE EXCEPTION 'País inválido. Permitidos: PT, BR, ES';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_company_country ON public.companies;
CREATE TRIGGER trg_validate_company_country
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_company_country();

-- Default new companies as active (super admin creates them ready)
ALTER TABLE public.companies ALTER COLUMN status SET DEFAULT 'active';

-- Auto-assign super_admin to seed user on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'edurts.pt@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (NEW.id, 'super_admin', NULL)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_super_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_super_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_super_admin();

-- Backfill if user already exists
INSERT INTO public.user_roles (user_id, role, company_id)
SELECT id, 'super_admin', NULL FROM auth.users WHERE lower(email) = 'edurts.pt@gmail.com'
ON CONFLICT DO NOTHING;

-- New RPC: super-admin creates company + manager invite atomically
CREATE OR REPLACE FUNCTION public.admin_create_company_with_invite(
  _name TEXT,
  _slug TEXT,
  _country TEXT,
  _currency TEXT,
  _language TEXT,
  _timezone TEXT,
  _admin_email TEXT
)
RETURNS TABLE(company_id UUID, invite_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_token TEXT;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas super admin pode criar empresas';
  END IF;

  INSERT INTO public.companies (name, slug, country, currency, language, timezone, status, created_by)
  VALUES (_name, _slug, _country, _currency, _language, _timezone, 'active', auth.uid())
  RETURNING id INTO v_company_id;

  INSERT INTO public.invites (company_id, email, role, invited_by)
  VALUES (v_company_id, lower(_admin_email), 'manager', auth.uid())
  RETURNING token INTO v_token;

  -- Welcome task so dashboard isn't empty
  INSERT INTO public.tasks (company_id, title, description, status, priority, created_by)
  VALUES (
    v_company_id,
    'Bem-vindo ao OmniBiz',
    'Convide sua equipe em "Equipe" e crie suas primeiras tarefas operacionais.',
    'pendente',
    'media',
    auth.uid()
  );

  RETURN QUERY SELECT v_company_id, v_token;
END $$;

-- Lock down self-signup RPC (only super_admin can use)
CREATE OR REPLACE FUNCTION public.create_company_with_owner(_name text, _slug text, _country text DEFAULT 'BR'::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Cadastro público desativado. OmniBiz é por convite.';
END $$;
