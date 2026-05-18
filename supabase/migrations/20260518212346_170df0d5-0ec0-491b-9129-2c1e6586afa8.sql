-- Módulo de Clientes (operação contínua para empresas de limpeza)
CREATE TYPE public.client_status AS ENUM ('ativo','inativo');

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  status public.client_status NOT NULL DEFAULT 'ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_company ON public.clients(company_id);
CREATE INDEX idx_clients_status ON public.clients(company_id, status);

CREATE TRIGGER trg_clients_touch
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view company clients"
  ON public.clients FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "managers manage company clients"
  ON public.clients FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin all clients"
  ON public.clients FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Vínculo de funcionários a clientes (equipes fixas / responsáveis)
CREATE TABLE public.client_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

CREATE INDEX idx_client_assignees_user ON public.client_assignees(user_id);
CREATE INDEX idx_client_assignees_company ON public.client_assignees(company_id);

ALTER TABLE public.client_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view own/company assignees"
  ON public.client_assignees FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_company_manager(auth.uid(), company_id)
  );

CREATE POLICY "managers manage assignees"
  ON public.client_assignees FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin all assignees"
  ON public.client_assignees FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_assignees;