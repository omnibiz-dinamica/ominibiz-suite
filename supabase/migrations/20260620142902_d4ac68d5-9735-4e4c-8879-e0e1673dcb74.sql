
-- =====================================================================
-- 1. PROFILES: novas colunas (todas nullable para compatibilidade)
-- =====================================================================
ALTER TABLE public.profiles
  -- Aba 1
  ADD COLUMN IF NOT EXISTS company_id_primary uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_number smallint CHECK (team_number IS NULL OR (team_number BETWEEN 1 AND 10)),
  ADD COLUMN IF NOT EXISTS address_be text,
  ADD COLUMN IF NOT EXISTS status text CHECK (status IS NULL OR status IN ('ativo','inativo')),
  -- Aba 2
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS dependents_count smallint,
  ADD COLUMN IF NOT EXISTS tax_id_nif text,
  ADD COLUMN IF NOT EXISTS social_security_niss text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS tax_country text,
  ADD COLUMN IF NOT EXISTS contract_type text,
  ADD COLUMN IF NOT EXISTS weekly_contracted_hours numeric(5,2),
  -- Aba 3
  ADD COLUMN IF NOT EXISTS main_doc_type text CHECK (main_doc_type IS NULL OR main_doc_type IN ('CC','TR')),
  ADD COLUMN IF NOT EXISTS main_doc_number text,
  ADD COLUMN IF NOT EXISTS main_doc_expires_at date,
  ADD COLUMN IF NOT EXISTS official_address text,
  ADD COLUMN IF NOT EXISTS a1_number text,
  ADD COLUMN IF NOT EXISTS a1_expires_at date,
  ADD COLUMN IF NOT EXISTS driver_license_number text,
  ADD COLUMN IF NOT EXISTS driver_license_expires_at date,
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS passport_expires_at date,
  ADD COLUMN IF NOT EXISTS health_card_number text,
  ADD COLUMN IF NOT EXISTS health_card_expires_at date,
  ADD COLUMN IF NOT EXISTS occ_health_last_at date,
  ADD COLUMN IF NOT EXISTS occ_health_next_at date,
  -- Aba 4 (informativos, não substituem manual_*)
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS swift text,
  ADD COLUMN IF NOT EXISTS rate_hour_week numeric(10,2),
  ADD COLUMN IF NOT EXISTS rate_hour_weekend numeric(10,2),
  ADD COLUMN IF NOT EXISTS rate_day_be numeric(10,2),
  ADD COLUMN IF NOT EXISTS rate_day_foreign numeric(10,2),
  ADD COLUMN IF NOT EXISTS allowance_meal numeric(10,2),
  ADD COLUMN IF NOT EXISTS allowance_transport numeric(10,2),
  ADD COLUMN IF NOT EXISTS allowance_rent numeric(10,2),
  ADD COLUMN IF NOT EXISTS allowance_other numeric(10,2),
  -- Aba 5
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS initials_url text;

-- Permitir que o trigger guard atualize esses novos campos quando vier do próprio user
-- (campos pessoais podem ser editados pelo colaborador; operacionais já são bloqueados pelo trigger existente)

-- =====================================================================
-- 2. employee_attachments
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.employee_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_attachments_profile ON public.employee_attachments(profile_id);
CREATE INDEX IF NOT EXISTS idx_employee_attachments_company ON public.employee_attachments(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_attachments TO authenticated;
GRANT ALL ON public.employee_attachments TO service_role;

ALTER TABLE public.employee_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read company attachments"
  ON public.employee_attachments FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "owner or manager insert"
  ON public.employee_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_manager(auth.uid(), company_id)
    OR profile_id = auth.uid()
  );

CREATE POLICY "owner or manager update"
  ON public.employee_attachments FOR UPDATE TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id) OR profile_id = auth.uid())
  WITH CHECK (public.is_company_manager(auth.uid(), company_id) OR profile_id = auth.uid());

CREATE POLICY "manager delete"
  ON public.employee_attachments FOR DELETE TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id) OR profile_id = auth.uid());

CREATE TRIGGER trg_employee_attachments_touch
  BEFORE UPDATE ON public.employee_attachments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 3. employee_document_alerts (histórico estruturado)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.employee_document_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  expires_at date NOT NULL,
  threshold_days smallint NOT NULL CHECK (threshold_days IN (30,60,90)),
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, doc_type, expires_at, threshold_days)
);

CREATE INDEX IF NOT EXISTS idx_doc_alerts_company ON public.employee_document_alerts(company_id);

GRANT SELECT, INSERT ON public.employee_document_alerts TO authenticated;
GRANT ALL ON public.employee_document_alerts TO service_role;

ALTER TABLE public.employee_document_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager read alerts"
  ON public.employee_document_alerts FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id) OR profile_id = auth.uid());

-- Inserts feitos somente pela função SECURITY DEFINER abaixo.

-- =====================================================================
-- 4. Função notify_document_expiries()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_document_expiries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_thresholds smallint[] := ARRAY[90,60,30];
  v_threshold smallint;
  v_doc record;
  v_mgr record;
  v_label text;
  v_company_id uuid;
BEGIN
  FOREACH v_threshold IN ARRAY v_thresholds LOOP
    FOR v_doc IN
      SELECT p.id AS profile_id,
             COALESCE(p.company_id_primary, p.current_company_id) AS company_id,
             p.full_name,
             d.doc_type, d.expires_at
      FROM public.profiles p
      CROSS JOIN LATERAL (
        VALUES
          ('main_doc', p.main_doc_expires_at),
          ('a1', p.a1_expires_at),
          ('driver_license', p.driver_license_expires_at),
          ('passport', p.passport_expires_at),
          ('health_card', p.health_card_expires_at),
          ('occ_health', p.occ_health_next_at)
      ) AS d(doc_type, expires_at)
      WHERE d.expires_at IS NOT NULL
        AND d.expires_at - CURRENT_DATE = v_threshold
        AND COALESCE(p.company_id_primary, p.current_company_id) IS NOT NULL
    LOOP
      v_company_id := v_doc.company_id;
      -- dedupe via UNIQUE
      BEGIN
        INSERT INTO public.employee_document_alerts(profile_id, company_id, doc_type, expires_at, threshold_days)
        VALUES (v_doc.profile_id, v_company_id, v_doc.doc_type, v_doc.expires_at, v_threshold);
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;

      v_label := 'Documento ' || v_doc.doc_type || ' de ' || COALESCE(v_doc.full_name,'colaborador')
                 || ' expira em ' || v_threshold || ' dias (' || to_char(v_doc.expires_at,'DD/MM/YYYY') || ')';

      -- notifica colaborador
      PERFORM public._notify(v_company_id, v_doc.profile_id, NULL,
        'task_late'::public.notification_event, 'Documento próximo do vencimento', v_label,
        CASE WHEN v_threshold = 30 THEN 'alta'::public.notification_priority
             ELSE 'media'::public.notification_priority END,
        jsonb_build_object('kind','doc_expiry','doc_type',v_doc.doc_type,'expires_at',v_doc.expires_at,'threshold',v_threshold));

      -- notifica gestores da empresa
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
        WHERE company_id = v_company_id AND role IN ('manager','owner')
      LOOP
        PERFORM public._notify(v_company_id, v_mgr.user_id, NULL,
          'task_late'::public.notification_event, 'Documento de colaborador próximo do vencimento', v_label,
          CASE WHEN v_threshold = 30 THEN 'alta'::public.notification_priority
               ELSE 'media'::public.notification_priority END,
          jsonb_build_object('kind','doc_expiry','profile_id',v_doc.profile_id,'doc_type',v_doc.doc_type,'expires_at',v_doc.expires_at,'threshold',v_threshold));
      END LOOP;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.notify_document_expiries() TO authenticated, service_role;
