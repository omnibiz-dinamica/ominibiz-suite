
-- Update vacation_decide: when approver != requester, transition to pendente_confirmacao
CREATE OR REPLACE FUNCTION public.vacation_decide(_id uuid, _action text, _reason text DEFAULT NULL::text)
 RETURNS vacation_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.vacation_requests%ROWTYPE;
  v_uid uuid := auth.uid();
  v_can_decide boolean;
  v_can_cancel boolean;
  v_needs_confirmation boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_req FROM public.vacation_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;

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
    UPDATE public.vacation_requests
      SET status = 'cancelado', cancelled_at = now()
      WHERE id = _id RETURNING * INTO v_req;
    PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
      'vacation_cancelled', 'Férias canceladas',
      to_char(v_req.start_date,'DD/MM') || ' - ' || to_char(v_req.end_date,'DD/MM'),
      'baixa', '{}'::jsonb);
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
    -- Se o aprovador é diferente do solicitante, exige confirmação do funcionário
    v_needs_confirmation := (v_req.user_id <> v_uid);
    IF v_needs_confirmation THEN
      UPDATE public.vacation_requests
        SET status = 'pendente_confirmacao', decided_by = v_uid, decided_at = now(), decision_reason = _reason
        WHERE id = _id RETURNING * INTO v_req;
      PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
        'vacation_confirmation_required', 'Confirmação de férias necessária',
        to_char(v_req.start_date,'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date,'DD/MM/YYYY'),
        'alta', jsonb_build_object('vacation_id', v_req.id));
    ELSE
      UPDATE public.vacation_requests
        SET status = 'aprovado', decided_by = v_uid, decided_at = now(), decision_reason = _reason
        WHERE id = _id RETURNING * INTO v_req;
      PERFORM public._notify(v_req.company_id, v_req.user_id, NULL,
        'vacation_approved', 'Férias aprovadas',
        to_char(v_req.start_date,'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date,'DD/MM/YYYY'),
        'media', '{}'::jsonb);
    END IF;
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
END $function$;

-- New: employee confirms or declines a manager-created approval
CREATE OR REPLACE FUNCTION public.vacation_confirm(_id uuid, _accept boolean, _reason text DEFAULT NULL::text)
 RETURNS vacation_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.vacation_requests%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_req FROM public.vacation_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF v_req.user_id <> v_uid THEN
    RAISE EXCEPTION 'Apenas o próprio funcionário pode confirmar';
  END IF;
  IF v_req.status <> 'pendente_confirmacao' THEN
    RAISE EXCEPTION 'Estado atual não permite confirmação';
  END IF;

  IF _accept THEN
    UPDATE public.vacation_requests
      SET status = 'aprovado'
      WHERE id = _id RETURNING * INTO v_req;
    -- Notify approver (decided_by) of confirmation
    IF v_req.decided_by IS NOT NULL THEN
      PERFORM public._notify(v_req.company_id, v_req.decided_by, NULL,
        'vacation_confirmed', 'Funcionário confirmou férias',
        to_char(v_req.start_date,'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date,'DD/MM/YYYY'),
        'media', jsonb_build_object('vacation_id', v_req.id, 'user_id', v_req.user_id));
    END IF;
  ELSE
    UPDATE public.vacation_requests
      SET status = 'rejeitado',
          decision_reason = COALESCE(NULLIF(trim(_reason), ''), 'Recusado pelo funcionário')
      WHERE id = _id RETURNING * INTO v_req;
    IF v_req.decided_by IS NOT NULL THEN
      PERFORM public._notify(v_req.company_id, v_req.decided_by, NULL,
        'vacation_declined', 'Funcionário recusou férias',
        COALESCE(NULLIF(trim(_reason),''), 'Sem motivo informado'),
        'alta', jsonb_build_object('vacation_id', v_req.id, 'user_id', v_req.user_id));
    END IF;
  END IF;
  RETURN v_req;
END $function$;

REVOKE ALL ON FUNCTION public.vacation_confirm(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vacation_confirm(uuid, boolean, text) TO authenticated;
