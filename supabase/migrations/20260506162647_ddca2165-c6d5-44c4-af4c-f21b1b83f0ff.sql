
-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'manager', 'employee');
CREATE TYPE public.company_status AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE public.task_status AS ENUM ('pendente', 'em_andamento', 'concluido', 'cancelado', 'ausente', 'autorizado');
CREATE TYPE public.task_priority AS ENUM ('baixa', 'media', 'alta', 'urgente');
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- ============= COMPANIES =============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  country TEXT NOT NULL DEFAULT 'BR',
  status public.company_status NOT NULL DEFAULT 'pending',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  current_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============= USER_ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============= SECURITY DEFINER HELPERS =============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role, _company_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (_company_id IS NULL OR company_id = _company_id OR role = 'super_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id
  ) OR public.is_super_admin(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_company_manager(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role = 'manager'
  ) OR public.is_super_admin(_user_id)
$$;

-- ============= INVITES =============
CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.invite_status NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invites_email ON public.invites(lower(email));
CREATE INDEX idx_invites_company ON public.invites(company_id);

-- ============= TASKS =============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'pendente',
  priority public.task_priority NOT NULL DEFAULT 'media',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  scheduled_for TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_company ON public.tasks(company_id);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);

-- ============= UPDATED_AT TRIGGER =============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= AUTO-PROFILE ON SIGNUP =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= RLS POLICIES =============

-- COMPANIES
CREATE POLICY "super admin all companies" ON public.companies FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "members view their company" ON public.companies FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), id));
CREATE POLICY "anyone authenticated creates company" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "managers update own company" ON public.companies FOR UPDATE TO authenticated
  USING (public.is_company_manager(auth.uid(), id)) WITH CHECK (public.is_company_manager(auth.uid(), id));

-- PROFILES
CREATE POLICY "super admin all profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "user view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "user update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "managers view company profiles" ON public.profiles FOR SELECT TO authenticated
  USING (current_company_id IS NOT NULL AND public.is_company_manager(auth.uid(), current_company_id));

-- USER_ROLES
CREATE POLICY "super admin all roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "user view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "managers view company roles" ON public.user_roles FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "managers manage company roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND role <> 'super_admin' AND public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "managers delete company roles" ON public.user_roles FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND role <> 'super_admin' AND public.is_company_manager(auth.uid(), company_id));

-- INVITES
CREATE POLICY "super admin all invites" ON public.invites FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "managers manage invites" ON public.invites FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "invitees view own invite" ON public.invites FOR SELECT TO authenticated
  USING (lower(email) = lower((auth.jwt() ->> 'email')));

-- TASKS
CREATE POLICY "super admin all tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "managers manage company tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "employees view assigned tasks" ON public.tasks FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());
CREATE POLICY "employees update assigned task status" ON public.tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid()) WITH CHECK (assigned_to = auth.uid());

-- ============= ACCEPT INVITE RPC =============
CREATE OR REPLACE FUNCTION public.accept_invite(_token TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.invites%ROWTYPE;
  v_email TEXT;
BEGIN
  v_email := lower((auth.jwt() ->> 'email'));
  IF v_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_invite FROM public.invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite inválido'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'Convite já utilizado ou revogado'; END IF;
  IF v_invite.expires_at < now() THEN
    UPDATE public.invites SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'Convite expirado';
  END IF;
  IF lower(v_invite.email) <> v_email THEN RAISE EXCEPTION 'Email do convite não corresponde'; END IF;

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (auth.uid(), v_invite.company_id, v_invite.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET current_company_id = v_invite.company_id WHERE id = auth.uid();
  UPDATE public.invites SET status = 'accepted', accepted_at = now() WHERE id = v_invite.id;

  RETURN v_invite.company_id;
END $$;

-- ============= CREATE COMPANY RPC (self-signup, status=pending) =============
CREATE OR REPLACE FUNCTION public.create_company_with_owner(_name TEXT, _slug TEXT, _country TEXT DEFAULT 'BR')
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.companies (name, slug, country, status, created_by)
  VALUES (_name, _slug, _country, 'pending', auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.user_roles (user_id, company_id, role) VALUES (auth.uid(), v_id, 'manager');
  UPDATE public.profiles SET current_company_id = v_id WHERE id = auth.uid();
  RETURN v_id;
END $$;
