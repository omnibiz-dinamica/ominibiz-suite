
-- ============================================================
-- Sprint Férias — RPC vacation_confirm, triggers, manager create
-- ============================================================

-- 1) Notification events (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='vacation_created_by_manager'
                 AND enumtypid=(SELECT oid FROM pg_type WHERE typname='notification_event')) THEN
    ALTER TYPE public.notification_event ADD VALUE 'vacation_created_by_manager';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='vacation_change_requested'
                 AND enumtypid=(SELECT oid FROM pg_type WHERE typname='notification_event')) THEN
    ALTER TYPE public.notification_event ADD VALUE 'vacation_change_requested';
  END IF;
END $$;

-- 2) RLS: allow managers/owners/super_admin to create vacations for any company member
DROP POLICY IF EXISTS "managers create vacations for members" ON public.vacation_requests;
CREATE POLICY "managers create vacations for members"
  ON public.vacation_requests
  FOR INSERT
  WITH CHECK (
    public.is_company_member(user_id, company_id)
    AND (
      public.is_company_manager(auth.uid(), company_id)
      OR public.is_company_owner(auth.uid(), company_id)
      OR public.is_super_admin(auth.uid())
    )
  );

-- 3) Make vacation_fill_context aware of "manager-created" inserts
CREATE OR REPLACE FUNCTION public.vacation_fill_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_mgr boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.work_location IS NULL THEN
      SELECT work_location INTO NEW.work_location FROM public.profiles WHERE id = NEW.user_id;
    END IF;
    IF NEW.assigned_approver_id IS NULL THEN
      NEW.assigned_approver_id := public.resolve_vacation_approver(NEW.user_id, NEW.company_id);
    END IF;

    -- Manager creating vacation FOR another employee → starts pending confirmation
    IF v_actor IS NOT NULL AND v_actor <> NEW.user_id THEN
      v_is_mgr := public.is_company_manager(v_actor, NEW.company_id)
               OR public.is_company_owner(v_actor, NEW.company_id)
               OR public.is_super_admin(v_actor);
      IF v_is_mgr THEN
        NEW.status := 'pendente_confirmacao';
        NEW.decided_by := v_actor;
        NEW.decided_at := now();
      END IF;
    END IF;
  END IF;

  IF NEW.prior_validation IS TRUE THEN
    IF NEW.validated_by IS NULL OR length(trim(NEW.validated_by)) = 0 THEN
      RAISE EXCEPTION 'Informe quem realizou a validação prévia';
    END IF;
  ELSE
    NEW.validated_by := NULL;
  END IF;
  RETURN NEW;
END $$;

-- 4) vacation_notify_insert: route notification by status
CREATE OR REPLACE FUNCTION public.vacation_notify_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_label text;
BEGIN
  v_label := to_char(NEW.start_date,'DD/MM/YYYY') || ' - ' || to_char(NEW.end_date,'DD/MM/YYYY');
  IF NEW.status = 'pendente_confirmacao' THEN
    -- Manager created it FOR the employee
    PERFORM public._notify(NEW.company_id, NEW.user_id, NULL,
      'vacation_created_by_manager', 'Férias agendadas para si', v_label, 'alta',
      jsonb_build_object('vacation_id', NEW.id, 'created_by', NEW.decided_by));
  ELSIF NEW.assigned_approver_id IS NOT NULL AND NEW.assigned_approver_id <> NEW.user_id THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_approver_id, NULL,
      'vacation_requested', 'Nova solicitação de férias', v_label, 'media',
      jsonb_build_object('vacation_id', NEW.id, 'user_id', NEW.user_id));
  END IF;
  RETURN NEW;
END $$;

-- 5) Wire triggers (no triggers existed before)
DROP TRIGGER IF EXISTS trg_vacation_fill_context ON public.vacation_requests;
CREATE TRIGGER trg_vacation_fill_context
  BEFORE INSERT OR UPDATE ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.vacation_fill_context();

DROP TRIGGER IF EXISTS trg_vacation_notify_insert ON public.vacation_requests;
CREATE TRIGGER trg_vacation_notify_insert
  AFTER INSERT ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.vacation_notify_insert();

-- 6) vacation_confirm RPC — employee responds to manager-created vacation
CREATE OR REPLACE FUNCTION public.vacation_confirm(_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS public.vacation_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_req public.vacation_requests%ROWTYPE;
  v_uid uuid := auth.uid();
  v_label text;
  v_target uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_req FROM public.vacation_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF v_req.user_id <> v_uid THEN RAISE EXCEPTION 'Apenas o titular pode confirmar'; END IF;
  IF v_req.status <> 'pendente_confirmacao' THEN
    RAISE EXCEPTION 'Estado atual não permite confirmação';
  END IF;

  v_label := to_char(v_req.start_date,'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date,'DD/MM/YYYY');
  v_target := COALESCE(v_req.assigned_approver_id, v_req.decided_by);

  IF _action = 'confirmar' THEN
    UPDATE public.vacation_requests
      SET status = 'aprovado', decision_reason = COALESCE(_reason, decision_reason)
      WHERE id = _id RETURNING * INTO v_req;
    IF v_target IS NOT NULL THEN
      PERFORM public._notify(v_req.company_id, v_target, NULL,
        'vacation_confirmed', 'Funcionário confirmou as férias', v_label, 'media',
        jsonb_build_object('vacation_id', v_req.id, 'user_id', v_req.user_id));
    END IF;
  ELSIF _action = 'solicitar_alteracao' THEN
    IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
      RAISE EXCEPTION 'Descreva a alteração pretendida';
    END IF;
    UPDATE public.vacation_requests
      SET status = 'pendente', decided_by = NULL, decided_at = NULL,
          decision_reason = _reason
      WHERE id = _id RETURNING * INTO v_req;
    IF v_target IS NOT NULL THEN
      PERFORM public._notify(v_req.company_id, v_target, NULL,
        'vacation_change_requested', 'Funcionário solicitou alteração',
        v_label || ' — ' || _reason, 'alta',
        jsonb_build_object('vacation_id', v_req.id, 'user_id', v_req.user_id, 'reason', _reason));
    END IF;
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;

  RETURN v_req;
END $$;

GRANT EXECUTE ON FUNCTION public.vacation_confirm(uuid, text, text) TO authenticated;
