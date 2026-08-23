CREATE OR REPLACE FUNCTION public.close_support_ticket(_ticket_id uuid, _reason text DEFAULT NULL)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ticket public.support_tickets%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_prev text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  SELECT * INTO v_ticket
    FROM public.support_tickets
   WHERE id = _ticket_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket nao encontrado';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.is_company_manager(v_uid, v_ticket.company_id)
    OR v_ticket.requester_user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Sem permissao para arquivar este ticket';
  END IF;

  IF v_ticket.status = 'fechado' THEN
    RETURN v_ticket;
  END IF;

  -- SUP-2026-000070: encerramentos do fluxo de 2 niveis (ADR-021) tambem podem ser arquivados.
  IF v_ticket.status NOT IN ('resolvido', 'resolved_by_manager', 'rejeitado') THEN
    RAISE EXCEPTION 'Apenas tickets resolvidos ou rejeitados podem ser arquivados';
  END IF;

  v_prev := v_ticket.status::text;

  UPDATE public.support_tickets
     SET status = 'fechado',
         closed_at = now(),
         updated_at = now()
   WHERE id = _ticket_id
   RETURNING * INTO v_ticket;

  PERFORM public.support_ticket_log_event(
    _ticket_id,
    v_ticket.company_id,
    'status_changed',
    jsonb_build_object('status', v_prev),
    jsonb_build_object('status', 'fechado'),
    jsonb_build_object('reason', COALESCE(v_reason, 'Validado pelo solicitante'))
  );

  RETURN v_ticket;
END;
$$;