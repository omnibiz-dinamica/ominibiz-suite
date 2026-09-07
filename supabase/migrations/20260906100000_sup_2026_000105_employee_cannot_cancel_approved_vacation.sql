-- SUP-2026-000105: employees may cancel only vacations that are not approved yet.
-- Managers, owners, assigned approvers and Super Admin retain administrative cancellation.
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
    IF v_req.user_id = v_uid
       AND v_req.status = 'aprovado'
       AND NOT public.is_company_manager(v_uid, v_req.company_id)
       AND NOT public.is_company_owner(v_uid, v_req.company_id)
       AND NOT public.is_super_admin(v_uid) THEN
      RAISE EXCEPTION 'Funcionário não pode cancelar férias já aprovadas';
    END IF;

    v_can_cancel :=
         (v_req.user_id = v_uid AND v_req.status IN ('pendente','pendente_confirmacao'))
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
