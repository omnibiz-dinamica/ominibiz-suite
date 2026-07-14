
-- ========================================================================
-- Fase A · Fundações Operacionais V1.0
-- ========================================================================

-- 1. CLIENTES: modo de apontamento + valor mensal ------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS timing_mode text NOT NULL DEFAULT 'start_stop',
  ADD COLUMN IF NOT EXISTS monthly_rate numeric;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='clients'
      AND constraint_name='clients_timing_mode_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_timing_mode_check
      CHECK (timing_mode IN ('start_stop','manual'));
  END IF;
END $$;

COMMENT ON COLUMN public.clients.timing_mode IS
  'start_stop: colaborador usa Iniciar/Concluir. manual: colaborador preenche Hora Entrada/Saída (ex.: clientes tipo Coifa). Nunca depender do nome do cliente — sempre desta config.';
COMMENT ON COLUMN public.clients.monthly_rate IS
  'Valor mensal quando billing_mode=monthly. Fallback: companies.default_monthly_rate.';

-- 2. EMPRESAS: valores padrão --------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_hourly_rate  numeric,
  ADD COLUMN IF NOT EXISTS default_fixed_rate   numeric,
  ADD COLUMN IF NOT EXISTS default_monthly_rate numeric;

COMMENT ON COLUMN public.companies.default_hourly_rate  IS 'Valor hora padrão. Cascata: Funcionário → Cliente → Empresa.';
COMMENT ON COLUMN public.companies.default_fixed_rate   IS 'Valor fixo padrão. Cascata: Funcionário → Cliente → Empresa.';
COMMENT ON COLUMN public.companies.default_monthly_rate IS 'Valor mensal padrão. Cascata: Funcionário → Cliente → Empresa.';

-- 3. FUNCIONÁRIOS: override mensal ---------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manual_monthly_rate numeric;

COMMENT ON COLUMN public.profiles.manual_monthly_rate IS
  'Override mensal do funcionário. Cascata: se preenchido, prevalece sobre cliente/empresa.';

-- 4. RPC: Liberação de Identidade ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_release_user_identity(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_current_email text;
  v_retired_email text;
  v_invites_revoked int := 0;
  v_roles_removed  int := 0;
  v_already_retired boolean := false;
BEGIN
  -- Autorização: apenas Super Admin
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'super_admin') THEN
    RAISE EXCEPTION 'unauthorized: only super_admin can release identities'
      USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '22023';
  END IF;

  -- Descobrir email atual em auth.users
  SELECT email INTO v_current_email FROM auth.users WHERE id = _user_id;
  IF v_current_email IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_already_retired := v_current_email LIKE 'retired+%@homologacao.invalid';
  v_retired_email := 'retired+' || _user_id::text || '@homologacao.invalid';

  -- 1) Remover user_roles
  WITH d AS (DELETE FROM public.user_roles WHERE user_id = _user_id RETURNING 1)
  SELECT count(*) INTO v_roles_removed FROM d;

  -- 2) Limpar profile (preserva registro para histórico)
  UPDATE public.profiles
     SET current_company_id = NULL,
         company_id_primary = NULL,
         is_active = false,
         updated_at = now()
   WHERE id = _user_id;

  -- 3) Revogar convites pendentes com o email atual (audit-preserving)
  IF NOT v_already_retired THEN
    WITH r AS (
      UPDATE public.invites
         SET status = 'revoked', updated_at = now()
       WHERE lower(email) = lower(v_current_email)
         AND status = 'pending'
      RETURNING 1
    )
    SELECT count(*) INTO v_invites_revoked FROM r;
  END IF;

  -- 4) Renomear email em auth (libera para novo cadastro) — só se ainda não retirado
  IF NOT v_already_retired THEN
    UPDATE auth.users
       SET email = v_retired_email,
           email_change = NULL,
           email_change_token_new = '',
           email_change_token_current = '',
           updated_at = now()
     WHERE id = _user_id;

    UPDATE auth.identities
       SET identity_data = jsonb_set(
             COALESCE(identity_data, '{}'::jsonb),
             '{email}',
             to_jsonb(v_retired_email),
             true
           ),
           updated_at = now()
     WHERE user_id = _user_id
       AND provider = 'email';
  END IF;

  RETURN jsonb_build_object(
    'user_id',           _user_id,
    'previous_email',    v_current_email,
    'retired_email',     v_retired_email,
    'roles_removed',     v_roles_removed,
    'invites_revoked',   v_invites_revoked,
    'already_retired',   v_already_retired,
    'history_preserved', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_release_user_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_release_user_identity(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_release_user_identity(uuid) IS
  'Fase A · Liberação de Identidade. Preserva histórico operacional. Somente Super Admin. Identidade permanente = UUID; email é apenas atributo técnico.';
