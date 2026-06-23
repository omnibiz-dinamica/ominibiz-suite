
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contract_renewal_date date;

CREATE OR REPLACE FUNCTION public.notify_document_expiries()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_thresholds smallint[] := ARRAY[90,60,30];
  v_threshold smallint;
  v_doc record;
  v_mgr record;
  v_label text;
  v_company_id uuid;
  v_title text;
  v_kind text;
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
          ('occ_health', p.occ_health_next_at),
          ('contract_renewal', p.contract_renewal_date)
      ) AS d(doc_type, expires_at)
      WHERE d.expires_at IS NOT NULL
        AND d.expires_at - CURRENT_DATE = v_threshold
        AND COALESCE(p.company_id_primary, p.current_company_id) IS NOT NULL
    LOOP
      v_company_id := v_doc.company_id;
      BEGIN
        INSERT INTO public.employee_document_alerts(profile_id, company_id, doc_type, expires_at, threshold_days)
        VALUES (v_doc.profile_id, v_company_id, v_doc.doc_type, v_doc.expires_at, v_threshold);
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;
      IF v_doc.doc_type = 'contract_renewal' THEN
        v_kind := 'contract_renewal';
        v_title := 'Renovação de contrato próxima';
        v_label := 'Contrato de ' || COALESCE(v_doc.full_name,'colaborador')
                   || ' vence em ' || v_threshold || ' dias (' || to_char(v_doc.expires_at,'DD/MM/YYYY') || ')';
      ELSE
        v_kind := 'doc_expiry';
        v_title := 'Documento próximo do vencimento';
        v_label := 'Documento ' || v_doc.doc_type || ' de ' || COALESCE(v_doc.full_name,'colaborador')
                   || ' expira em ' || v_threshold || ' dias (' || to_char(v_doc.expires_at,'DD/MM/YYYY') || ')';
      END IF;
      PERFORM public._notify(v_company_id, v_doc.profile_id, NULL,
        'task_late'::public.notification_event, v_title, v_label,
        CASE WHEN v_threshold = 30 THEN 'alta'::public.notification_priority
             ELSE 'media'::public.notification_priority END,
        jsonb_build_object('kind',v_kind,'doc_type',v_doc.doc_type,'expires_at',v_doc.expires_at,'threshold',v_threshold));
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
        WHERE company_id = v_company_id AND role IN ('manager','owner')
      LOOP
        PERFORM public._notify(v_company_id, v_mgr.user_id, NULL,
          'task_late'::public.notification_event,
          CASE WHEN v_doc.doc_type = 'contract_renewal'
               THEN 'Renovação de contrato de colaborador'
               ELSE 'Documento de colaborador próximo do vencimento' END,
          v_label,
          CASE WHEN v_threshold = 30 THEN 'alta'::public.notification_priority
               ELSE 'media'::public.notification_priority END,
          jsonb_build_object('kind',v_kind,'profile_id',v_doc.profile_id,'doc_type',v_doc.doc_type,'expires_at',v_doc.expires_at,'threshold',v_threshold));
      END LOOP;
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN v_count;
END $function$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='expense_created'
                 AND enumtypid=(SELECT oid FROM pg_type WHERE typname='notification_event')) THEN
    ALTER TYPE public.notification_event ADD VALUE 'expense_created';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='expense_approved'
                 AND enumtypid=(SELECT oid FROM pg_type WHERE typname='notification_event')) THEN
    ALTER TYPE public.notification_event ADD VALUE 'expense_approved';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='expense_rejected'
                 AND enumtypid=(SELECT oid FROM pg_type WHERE typname='notification_event')) THEN
    ALTER TYPE public.notification_event ADD VALUE 'expense_rejected';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.employee_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  reason text NOT NULL,
  notes text,
  attachment_path text,
  attachment_mime text,
  attachment_size bigint,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovada','rejeitada')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_expenses_company ON public.employee_expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_emp_expenses_user ON public.employee_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_expenses_status ON public.employee_expenses(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_expenses TO authenticated;
GRANT ALL ON public.employee_expenses TO service_role;

ALTER TABLE public.employee_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own or managers all"
  ON public.employee_expenses FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_company_manager(auth.uid(), company_id)
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "users insert own expenses"
  ON public.employee_expenses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_company_member(auth.uid(), company_id)
  );

CREATE POLICY "users update own pending; managers any"
  ON public.employee_expenses FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pendente')
    OR public.is_company_manager(auth.uid(), company_id)
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "users delete own pending; managers any"
  ON public.employee_expenses FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pendente')
    OR public.is_company_manager(auth.uid(), company_id)
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.touch_updated_at_employee_expenses()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_employee_expenses_touch ON public.employee_expenses;
CREATE TRIGGER trg_employee_expenses_touch
  BEFORE UPDATE ON public.employee_expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_employee_expenses();

CREATE OR REPLACE FUNCTION public.expense_notify_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_label text;
  v_emp_name text;
  v_mgr record;
BEGIN
  SELECT full_name INTO v_emp_name FROM public.profiles WHERE id = NEW.user_id;
  v_label := COALESCE(v_emp_name,'Colaborador')
             || ' — ' || to_char(NEW.expense_date,'DD/MM/YYYY')
             || ' — ' || trim(to_char(NEW.amount,'FM999G999G990D00')) || '€'
             || ' — ' || left(NEW.reason, 60);
  FOR v_mgr IN
    SELECT DISTINCT user_id FROM public.user_roles
    WHERE company_id = NEW.company_id AND role IN ('manager','owner')
  LOOP
    PERFORM public._notify(NEW.company_id, v_mgr.user_id, NULL,
      'expense_created'::public.notification_event,
      'Nova despesa para aprovar', v_label, 'media'::public.notification_priority,
      jsonb_build_object('expense_id', NEW.id, 'user_id', NEW.user_id));
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.expense_notify_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_label text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  v_label := to_char(NEW.expense_date,'DD/MM/YYYY')
             || ' — ' || trim(to_char(NEW.amount,'FM999G999G990D00')) || '€'
             || ' — ' || left(NEW.reason, 60);
  IF NEW.status = 'aprovada' THEN
    PERFORM public._notify(NEW.company_id, NEW.user_id, NULL,
      'expense_approved'::public.notification_event,
      'Despesa aprovada', v_label, 'media'::public.notification_priority,
      jsonb_build_object('expense_id', NEW.id));
  ELSIF NEW.status = 'rejeitada' THEN
    PERFORM public._notify(NEW.company_id, NEW.user_id, NULL,
      'expense_rejected'::public.notification_event,
      'Despesa rejeitada',
      v_label || COALESCE(' — ' || NEW.decision_reason, ''),
      'alta'::public.notification_priority,
      jsonb_build_object('expense_id', NEW.id, 'reason', NEW.decision_reason));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_expense_notify_insert ON public.employee_expenses;
CREATE TRIGGER trg_expense_notify_insert
  AFTER INSERT ON public.employee_expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_notify_insert();

DROP TRIGGER IF EXISTS trg_expense_notify_decision ON public.employee_expenses;
CREATE TRIGGER trg_expense_notify_decision
  AFTER UPDATE OF status ON public.employee_expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_notify_decision();

CREATE OR REPLACE FUNCTION public.expense_decide(_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS public.employee_expenses
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row public.employee_expenses%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_row FROM public.employee_expenses WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada'; END IF;
  IF NOT (public.is_company_manager(v_uid, v_row.company_id)
          OR public.is_company_owner(v_uid, v_row.company_id)
          OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF v_row.status <> 'pendente' THEN
    RAISE EXCEPTION 'Apenas despesas pendentes podem ser decididas';
  END IF;
  IF _action = 'aprovar' THEN
    UPDATE public.employee_expenses
      SET status='aprovada', decided_by=v_uid, decided_at=now(), decision_reason=_reason
      WHERE id=_id RETURNING * INTO v_row;
  ELSIF _action = 'rejeitar' THEN
    IF _reason IS NULL OR length(trim(_reason))=0 THEN
      RAISE EXCEPTION 'Informe o motivo da rejeição';
    END IF;
    UPDATE public.employee_expenses
      SET status='rejeitada', decided_by=v_uid, decided_at=now(), decision_reason=_reason
      WHERE id=_id RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.expense_decide(uuid, text, text) TO authenticated;
