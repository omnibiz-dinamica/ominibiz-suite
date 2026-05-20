
-- Owner helper
CREATE OR REPLACE FUNCTION public.is_company_owner(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role = 'owner'
  ) OR public.is_super_admin(_user_id)
$$;

-- Owner counts as manager
CREATE OR REPLACE FUNCTION public.is_company_manager(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role IN ('manager','owner')
  ) OR public.is_super_admin(_user_id)
$$;

-- HR settings table
CREATE TYPE public.employee_approver_kind AS ENUM ('manager','supervisor','owner','specific_user');
CREATE TYPE public.manager_approver_kind AS ENUM ('owner','other_manager','specific_user','self_allowed');

CREATE TABLE public.company_hr_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_approver_kind public.employee_approver_kind NOT NULL DEFAULT 'manager',
  employee_approver_user_id uuid,
  manager_approver_kind public.manager_approver_kind NOT NULL DEFAULT 'owner',
  manager_approver_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_hr_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view hr settings"
ON public.company_hr_settings FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "managers manage hr settings"
ON public.company_hr_settings FOR ALL TO authenticated
USING (public.is_company_manager(auth.uid(), company_id))
WITH CHECK (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin hr settings"
ON public.company_hr_settings FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER hr_settings_touch
BEFORE UPDATE ON public.company_hr_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add assigned_approver_id column to vacation_requests
ALTER TABLE public.vacation_requests
  ADD COLUMN assigned_approver_id uuid;

-- Resolver function
CREATE OR REPLACE FUNCTION public.resolve_vacation_approver(_user_id uuid, _company_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.company_hr_settings%ROWTYPE;
  v_is_manager boolean;
  v_supervisor uuid;
  v_owner uuid;
  v_fallback uuid;
BEGIN
  SELECT * INTO v_settings FROM public.company_hr_settings WHERE company_id = _company_id;

  v_is_manager := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role IN ('manager','owner')
  );

  SELECT user_id INTO v_owner FROM public.user_roles
   WHERE company_id = _company_id AND role = 'owner' LIMIT 1;

  -- Fallback approver = any other manager/owner in the company
  SELECT user_id INTO v_fallback FROM public.user_roles
   WHERE company_id = _company_id AND role IN ('manager','owner')
     AND user_id <> _user_id
   ORDER BY (role = 'owner') DESC, created_at ASC
   LIMIT 1;

  IF v_is_manager THEN
    -- Manager/owner requesting vacation
    IF v_settings.manager_approver_kind = 'self_allowed' THEN
      RETURN _user_id;
    ELSIF v_settings.manager_approver_kind = 'specific_user' AND v_settings.manager_approver_user_id IS NOT NULL
          AND v_settings.manager_approver_user_id <> _user_id THEN
      RETURN v_settings.manager_approver_user_id;
    ELSIF v_settings.manager_approver_kind = 'other_manager' THEN
      RETURN v_fallback;
    ELSE
      -- default: owner
      IF v_owner IS NOT NULL AND v_owner <> _user_id THEN
        RETURN v_owner;
      END IF;
      RETURN v_fallback;
    END IF;
  ELSE
    -- Employee requesting vacation
    IF v_settings.employee_approver_kind = 'supervisor' THEN
      SELECT supervisor_id INTO v_supervisor FROM public.profiles WHERE id = _user_id;
      IF v_supervisor IS NOT NULL AND v_supervisor <> _user_id THEN
        RETURN v_supervisor;
      END IF;
      RETURN v_fallback;
    ELSIF v_settings.employee_approver_kind = 'owner' THEN
      IF v_owner IS NOT NULL THEN RETURN v_owner; END IF;
      RETURN v_fallback;
    ELSIF v_settings.employee_approver_kind = 'specific_user' AND v_settings.employee_approver_user_id IS NOT NULL
          AND v_settings.employee_approver_user_id <> _user_id THEN
      RETURN v_settings.employee_approver_user_id;
    ELSE
      -- default: manager
      RETURN v_fallback;
    END IF;
  END IF;
END $$;

-- Update vacation_fill_context to also assign approver
CREATE OR REPLACE FUNCTION public.vacation_fill_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.work_location IS NULL THEN
      SELECT work_location INTO NEW.work_location
      FROM public.profiles WHERE id = NEW.user_id;
    END IF;
    IF NEW.assigned_approver_id IS NULL THEN
      NEW.assigned_approver_id := public.resolve_vacation_approver(NEW.user_id, NEW.company_id);
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

-- Update vacation_decide to allow assigned approver / owner / super_admin
CREATE OR REPLACE FUNCTION public.vacation_decide(_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS public.vacation_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.vacation_requests%ROWTYPE;
  v_uid uuid := auth.uid();
  v_can_decide boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_req FROM public.vacation_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;

  IF _action = 'cancelar' THEN
    IF v_req.user_id <> v_uid
       AND NOT public.is_company_manager(v_uid, v_req.company_id)
       AND v_req.assigned_approver_id <> v_uid THEN
      RAISE EXCEPTION 'Sem permissão';
    END IF;
    IF v_req.status <> 'pendente' AND v_req.status <> 'aprovado' THEN
      RAISE EXCEPTION 'Apenas pendentes ou aprovadas podem ser canceladas';
    END IF;
    UPDATE public.vacation_requests
      SET status = 'cancelado', cancelled_at = now()
      WHERE id = _id RETURNING * INTO v_req;
    PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
      'vacation_cancelled', 'Férias canceladas',
      to_char(v_req.start_date,'DD/MM') || ' - ' || to_char(v_req.end_date,'DD/MM'),
      'baixa', '{}'::jsonb);
    RETURN v_req;
  END IF;

  v_can_decide := (v_req.assigned_approver_id = v_uid)
                  OR public.is_company_owner(v_uid, v_req.company_id)
                  OR public.is_super_admin(v_uid);

  IF NOT v_can_decide THEN
    RAISE EXCEPTION 'Apenas o aprovador designado pode decidir esta solicitação';
  END IF;
  IF v_req.status <> 'pendente' THEN
    RAISE EXCEPTION 'Solicitação já decidida';
  END IF;

  IF _action = 'aprovar' THEN
    UPDATE public.vacation_requests
      SET status = 'aprovado', decided_by = v_uid, decided_at = now(), decision_reason = _reason
      WHERE id = _id RETURNING * INTO v_req;
    PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
      'vacation_approved', 'Férias aprovadas',
      to_char(v_req.start_date,'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date,'DD/MM/YYYY'),
      'media', '{}'::jsonb);
  ELSIF _action = 'rejeitar' THEN
    IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
      RAISE EXCEPTION 'Motivo obrigatório para rejeitar';
    END IF;
    UPDATE public.vacation_requests
      SET status = 'rejeitado', decided_by = v_uid, decided_at = now(), decision_reason = _reason
      WHERE id = _id RETURNING * INTO v_req;
    PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
      'vacation_rejected', 'Férias rejeitadas', _reason, 'alta', '{}'::jsonb);
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;
  RETURN v_req;
END $$;

-- Notify only the assigned approver on new request
CREATE OR REPLACE FUNCTION public.vacation_notify_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  v_label := to_char(NEW.start_date,'DD/MM/YYYY') || ' - ' || to_char(NEW.end_date,'DD/MM/YYYY');
  IF NEW.assigned_approver_id IS NOT NULL AND NEW.assigned_approver_id <> NEW.user_id THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_approver_id, NULL,
      'vacation_requested', 'Nova solicitação de férias', v_label, 'media',
      jsonb_build_object('vacation_id', NEW.id, 'user_id', NEW.user_id));
  END IF;
  RETURN NEW;
END $$;

-- Add SELECT policy: user can view vacations where they are the assigned approver
CREATE POLICY "approver views assigned vacations"
ON public.vacation_requests FOR SELECT TO authenticated
USING (assigned_approver_id = auth.uid());

CREATE POLICY "approver updates assigned vacations"
ON public.vacation_requests FOR UPDATE TO authenticated
USING (assigned_approver_id = auth.uid())
WITH CHECK (assigned_approver_id = auth.uid());

-- Backfill existing pending requests with a resolved approver
UPDATE public.vacation_requests
SET assigned_approver_id = public.resolve_vacation_approver(user_id, company_id)
WHERE assigned_approver_id IS NULL;
