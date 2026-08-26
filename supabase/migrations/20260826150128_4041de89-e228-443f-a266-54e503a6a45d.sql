-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.vacation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacation_request_id uuid NOT NULL REFERENCES public.vacation_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  actor_id uuid NULL,
  action text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  reason text NULL,
  source text NOT NULL DEFAULT 'rpc',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vacation_audit TO authenticated;
GRANT ALL ON public.vacation_audit TO service_role;
ALTER TABLE public.vacation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vacation_audit_read" ON public.vacation_audit
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_company_manager(auth.uid(), company_id)
  OR public.is_company_owner(auth.uid(), company_id)
  OR EXISTS (
    SELECT 1 FROM public.vacation_requests vr
    WHERE vr.id = vacation_request_id AND vr.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS vacation_audit_request_idx
  ON public.vacation_audit(vacation_request_id, created_at DESC);

-- 2. Cancellation authorship
ALTER TABLE public.vacation_requests
  ADD COLUMN IF NOT EXISTS cancelled_by uuid NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text NULL;

-- 3. Guard: only the official RPC may set status = 'cancelado'
CREATE OR REPLACE FUNCTION public.vacation_guard_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelado' AND COALESCE(OLD.status::text, '') <> 'cancelado' THEN
    IF COALESCE(current_setting('omnibiz.vacation_cancel_ok', true), '') <> 'on' THEN
      RAISE EXCEPTION 'VACATION_CANCEL_NOT_AUTHORIZED: cancelamento de férias só é permitido via ação explícita (vacation_decide/cancelar)';
    END IF;
    IF NEW.cancelled_by IS NULL THEN
      RAISE EXCEPTION 'VACATION_CANCEL_NO_ACTOR: cancelamento requer utilizador autenticado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vacation_guard_cancel_trg ON public.vacation_requests;
CREATE TRIGGER vacation_guard_cancel_trg
BEFORE UPDATE ON public.vacation_requests
FOR EACH ROW EXECUTE FUNCTION public.vacation_guard_cancel();

-- 4. vacation_decide: audit every transition, record cancel authorship
CREATE OR REPLACE FUNCTION public.vacation_decide(_id uuid, _action text, _reason text DEFAULT NULL::text)
RETURNS public.vacation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.vacation_requests%ROWTYPE;
  v_prev text;
  v_uid uuid := auth.uid();
  v_can_decide boolean;
  v_can_cancel boolean;
  v_needs_confirmation boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _action NOT IN ('aprovar','rejeitar','cancelar') THEN
    RAISE EXCEPTION 'Ação inválida: %', _action;
  END IF;
  SELECT * INTO v_req FROM public.vacation_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  v_prev := v_req.status::text;

  IF _action = 'cancelar' THEN
    v_can_cancel :=
         (v_req.user_id = v_uid)
      OR ((v_req.assigned_approver_id = v_uid) AND public.is_company_member(v_uid, v_req.company_id))
      OR public.is_company_manager(v_uid, v_req.company_id)
      OR public.is_company_owner(v_uid, v_req.company_id)
      OR public.is_super_admin(v_uid);
    IF NOT v_can_cancel THEN
      RAISE EXCEPTION 'Sem permissão';
    END IF;
    IF v_req.status NOT IN ('pendente','aprovado','pendente_confirmacao') THEN
      RAISE EXCEPTION 'Estado atual não permite cancelamento';
    END IF;

    PERFORM set_config('omnibiz.vacation_cancel_ok', 'on', true);
    UPDATE public.vacation_requests
      SET status = 'cancelado', cancelled_at = now(),
          cancelled_by = v_uid, cancellation_reason = _reason
      WHERE id = _id RETURNING * INTO v_req;
    PERFORM set_config('omnibiz.vacation_cancel_ok', 'off', true);

    INSERT INTO public.vacation_audit(vacation_request_id, company_id, actor_id, action, from_status, to_status, reason, source)
    VALUES (v_req.id, v_req.company_id, v_uid, 'cancelar', v_prev, 'cancelado', _reason, 'vacation_decide');

    PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
      'vacation_cancelled', 'Férias canceladas',
      to_char(v_req.start_date,'DD/MM') || ' - ' || to_char(v_req.end_date,'DD/MM'),
      'baixa', jsonb_build_object('vacation_id', v_req.id));
    RETURN v_req;
  END IF;

  v_can_decide :=
       ((v_req.assigned_approver_id = v_uid) AND public.is_company_member(v_uid, v_req.company_id))
    OR public.is_company_manager(v_uid, v_req.company_id)
    OR public.is_company_owner(v_uid, v_req.company_id)
    OR public.is_super_admin(v_uid);

  IF NOT v_can_decide THEN
    RAISE EXCEPTION 'Sem permissão para decidir esta solicitação';
  END IF;
  IF v_req.status <> 'pendente' THEN
    RAISE EXCEPTION 'Solicitação já decidida';
  END IF;

  IF _action = 'aprovar' THEN
    v_needs_confirmation := (COALESCE(v_req.created_by, v_req.user_id) <> v_req.user_id);
    IF v_needs_confirmation THEN
      UPDATE public.vacation_requests
        SET status = 'pendente_confirmacao', decided_by = v_uid, decided_at = now(), decision_reason = _reason
        WHERE id = _id RETURNING * INTO v_req;
      PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
        'vacation_confirmation_required', 'Confirmação de férias necessária',
        to_char(v_req.start_date,'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date,'DD/MM/YYYY'),
        'alta', jsonb_build_object('vacation_id', v_req.id, 'action_required', true));
    ELSE
      UPDATE public.vacation_requests
        SET status = 'aprovado', decided_by = v_uid, decided_at = now(), decision_reason = _reason
        WHERE id = _id RETURNING * INTO v_req;
      PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
        'vacation_approved', 'Férias aprovadas',
        to_char(v_req.start_date,'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date,'DD/MM/YYYY'),
        'media', jsonb_build_object('vacation_id', v_req.id));
    END IF;
  ELSIF _action = 'rejeitar' THEN
    IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
      RAISE EXCEPTION 'Motivo obrigatório para rejeitar';
    END IF;
    UPDATE public.vacation_requests
      SET status = 'rejeitado', decided_by = v_uid, decided_at = now(), decision_reason = _reason
      WHERE id = _id RETURNING * INTO v_req;
    PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
      'vacation_rejected', 'Férias rejeitadas',
      to_char(v_req.start_date,'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date,'DD/MM/YYYY'),
      'media', jsonb_build_object('vacation_id', v_req.id, 'reason', _reason));
  END IF;

  INSERT INTO public.vacation_audit(vacation_request_id, company_id, actor_id, action, from_status, to_status, reason, source)
  VALUES (v_req.id, v_req.company_id, v_uid, _action, v_prev, v_req.status::text, _reason, 'vacation_decide');

  RETURN v_req;
END;
$function$;

-- 5. Restore ONLY Keila Oliveira 29/09/2026 -> 05/10/2026 (id 754239db-...)
INSERT INTO public.vacation_audit(vacation_request_id, company_id, actor_id, action, from_status, to_status, reason, source, metadata)
SELECT vr.id, vr.company_id, NULL, 'cancelar', 'pendente', 'cancelado',
       'Cancelamento sem confirmação explícita na interface (botão de um clique) — registo reconstruído a partir de cancelled_at e da notificação vacation_cancelled',
       'reconstrucao_historica',
       jsonb_build_object('cancelled_at', vr.cancelled_at, 'evidence', 'notification daae836c-36fb-431b-a7d4-f0697c764295')
FROM public.vacation_requests vr
WHERE vr.id = '754239db-ec32-4e0e-877d-e2a12a97071f' AND vr.status = 'cancelado';

INSERT INTO public.vacation_audit(vacation_request_id, company_id, actor_id, action, from_status, to_status, reason, source)
SELECT vr.id, vr.company_id, NULL, 'restaurar', 'cancelado', 'pendente',
       'Status restaurado administrativamente após identificação de cancelamento indevido pelo sistema.',
       'migration_20260826_vacation_restore'
FROM public.vacation_requests vr
WHERE vr.id = '754239db-ec32-4e0e-877d-e2a12a97071f' AND vr.status = 'cancelado';

UPDATE public.vacation_requests
   SET status = 'pendente', cancelled_at = NULL, cancelled_by = NULL,
       cancellation_reason = NULL, decided_by = NULL, decided_at = NULL,
       decision_reason = NULL, updated_at = now()
 WHERE id = '754239db-ec32-4e0e-877d-e2a12a97071f' AND status = 'cancelado';

-- 6. Re-notify the responsible approver (no duplicates)
INSERT INTO public.notifications(company_id, user_id, event, priority, title, body, metadata)
SELECT vr.company_id, COALESCE(vr.assigned_approver_id, vr.created_by), 'vacation_requested', 'alta',
       'Solicitação de férias pendente',
       'Keila Oliveira solicitou férias de 29/09/2026 a 05/10/2026. A solicitação está aguardando sua análise.',
       jsonb_build_object('vacation_id', vr.id, 'user_id', vr.user_id, 'action_required', true, 'restored', true)
FROM public.vacation_requests vr
WHERE vr.id = '754239db-ec32-4e0e-877d-e2a12a97071f'
  AND vr.status = 'pendente'
  AND vr.assigned_approver_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.event = 'vacation_requested'
      AND n.user_id = vr.assigned_approver_id
      AND n.metadata->>'vacation_id' = vr.id::text
      AND n.metadata->>'restored' = 'true'
  );