
-- Vacation status enum
DO $$ BEGIN
  CREATE TYPE public.vacation_status AS ENUM ('pendente','aprovado','rejeitado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add notification event values
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'vacation_requested';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'vacation_approved';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'vacation_rejected';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'vacation_cancelled';

-- Vacation requests table
CREATE TABLE IF NOT EXISTS public.vacation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  status public.vacation_status NOT NULL DEFAULT 'pendente',
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vacation_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_vacation_company ON public.vacation_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_vacation_user ON public.vacation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_vacation_status ON public.vacation_requests(status);

ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_vacation_touch ON public.vacation_requests;
CREATE TRIGGER trg_vacation_touch BEFORE UPDATE ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
CREATE POLICY "users view own vacations" ON public.vacation_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users create own vacations" ON public.vacation_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "users cancel own pending vacations" ON public.vacation_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "managers view company vacations" ON public.vacation_requests
  FOR SELECT TO authenticated USING (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "managers manage company vacations" ON public.vacation_requests
  FOR UPDATE TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin all vacations" ON public.vacation_requests
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Decide vacation RPC
CREATE OR REPLACE FUNCTION public.vacation_decide(_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS public.vacation_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.vacation_requests%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_req FROM public.vacation_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;

  IF _action = 'cancelar' THEN
    IF v_req.user_id <> v_uid AND NOT public.is_company_manager(v_uid, v_req.company_id) THEN
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

  IF NOT public.is_company_manager(v_uid, v_req.company_id) THEN
    RAISE EXCEPTION 'Apenas gestor pode aprovar/rejeitar';
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

-- Trigger: notify managers on new request
CREATE OR REPLACE FUNCTION public.vacation_notify_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mgr RECORD; v_label text;
BEGIN
  v_label := to_char(NEW.start_date,'DD/MM/YYYY') || ' - ' || to_char(NEW.end_date,'DD/MM/YYYY');
  FOR v_mgr IN
    SELECT DISTINCT user_id FROM public.user_roles
    WHERE company_id = NEW.company_id AND role IN ('manager','super_admin')
  LOOP
    PERFORM public._notify(NEW.company_id, v_mgr.user_id, NULL,
      'vacation_requested', 'Nova solicitação de férias', v_label, 'media',
      jsonb_build_object('vacation_id', NEW.id, 'user_id', NEW.user_id));
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vacation_notify_insert ON public.vacation_requests;
CREATE TRIGGER trg_vacation_notify_insert AFTER INSERT ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.vacation_notify_insert();
