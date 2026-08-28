-- SUP-2026-000111: encaminhamento de férias entre gestores.
-- A migração é aditiva: pedidos e estados históricos permanecem intactos.

ALTER TABLE public.vacation_requests
  ADD COLUMN IF NOT EXISTS forwarded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_vacation_forwarded_by
  ON public.vacation_requests(forwarded_by, status);

CREATE INDEX IF NOT EXISTS idx_vacation_assigned_approver
  ON public.vacation_requests(assigned_approver_id, status);

CREATE OR REPLACE FUNCTION public.vacation_forward_for_authorization(
  _id uuid,
  _approver_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.vacation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.vacation_requests%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_approver_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF _approver_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o gestor autorizador';
  END IF;

  SELECT * INTO v_req
    FROM public.vacation_requests
   WHERE id = _id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação de férias não encontrada';
  END IF;

  IF NOT (
    public.is_company_manager(v_uid, v_req.company_id)
    OR public.is_company_owner(v_uid, v_req.company_id)
    OR public.is_super_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'Apenas um gestor da empresa pode encaminhar este pedido';
  END IF;

  IF v_req.status <> 'pendente' THEN
    RAISE EXCEPTION 'Somente pedidos pendentes podem ser enviados para autorização';
  END IF;

  IF _approver_id = v_req.user_id OR _approver_id = v_uid THEN
    RAISE EXCEPTION 'Selecione outro gestor para autorizar este pedido';
  END IF;

  -- A elegibilidade é verificada novamente no backend para não depender do seletor da UI.
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'Gestor') INTO v_approver_name
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
   WHERE ur.user_id = _approver_id
     AND ur.company_id = v_req.company_id
     AND ur.role IN ('manager', 'owner')
     AND p.is_active IS TRUE
   LIMIT 1;
  IF v_approver_name IS NULL THEN
    RAISE EXCEPTION 'Gestor autorizador inválido, inativo ou de outra empresa';
  END IF;

  UPDATE public.vacation_requests
     SET assigned_approver_id = _approver_id,
         forwarded_by = v_uid,
         forwarded_at = now()
   WHERE id = _id
   RETURNING * INTO v_req;

  INSERT INTO public.vacation_audit(
    vacation_request_id, company_id, actor_id, action,
    from_status, to_status, reason, source, metadata
  ) VALUES (
    v_req.id, v_req.company_id, v_uid, 'encaminhar',
    'pendente', 'pendente', v_reason, 'vacation_forward_for_authorization',
    jsonb_build_object(
      'approver_id', _approver_id,
      'approver_name', v_approver_name,
      'forwarded_at', v_req.forwarded_at
    )
  );

  PERFORM public._notify(
    v_req.company_id,
    _approver_id,
    NULL,
    'vacation_requested',
    'Pedido de férias aguardando sua autorização',
    to_char(v_req.start_date, 'DD/MM/YYYY') || ' - ' || to_char(v_req.end_date, 'DD/MM/YYYY'),
    'alta',
    jsonb_build_object(
      'vacation_id', v_req.id,
      'user_id', v_req.user_id,
      'forwarded_by', v_uid,
      'action_required', true,
      'deep_link', '/app/ferias?request=' || v_req.id::text
    )
  );

  RETURN v_req;
END;
$function$;

REVOKE ALL ON FUNCTION public.vacation_forward_for_authorization(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vacation_forward_for_authorization(uuid, uuid, text) TO authenticated;

-- A nova solicitação passa a ter o primeiro evento auditável. Não altera o pedido.
CREATE OR REPLACE FUNCTION public.vacation_audit_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.vacation_audit(
    vacation_request_id, company_id, actor_id, action,
    from_status, to_status, reason, source, metadata
  ) VALUES (
    NEW.id, NEW.company_id, COALESCE(NEW.created_by, NEW.user_id), 'solicitar',
    NULL, NEW.status::text, NEW.note, 'vacation_request',
    jsonb_build_object('user_id', NEW.user_id, 'created_by', NEW.created_by)
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vacation_audit_requested_trg ON public.vacation_requests;
CREATE TRIGGER vacation_audit_requested_trg
AFTER INSERT ON public.vacation_requests
FOR EACH ROW EXECUTE FUNCTION public.vacation_audit_requested();

-- vacation_decide continua sendo a fonte da decisão. Este trigger apenas avisa
-- o gestor que encaminhou, sem duplicar a notificação do funcionário.
CREATE OR REPLACE FUNCTION public.vacation_notify_forwarded_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_body text;
BEGIN
  IF OLD.status = 'pendente'
     AND NEW.status IN ('aprovado', 'rejeitado', 'pendente_confirmacao')
     AND NEW.forwarded_by IS NOT NULL
     AND NEW.forwarded_by <> COALESCE(NEW.decided_by, NEW.forwarded_by) THEN
    v_title := CASE
      WHEN NEW.status = 'aprovado' THEN 'Pedido de férias aprovado'
      WHEN NEW.status = 'rejeitado' THEN 'Pedido de férias não aprovado'
      ELSE 'Pedido de férias aguarda confirmação'
    END;
    v_body := to_char(NEW.start_date, 'DD/MM/YYYY') || ' - ' || to_char(NEW.end_date, 'DD/MM/YYYY');
    IF NEW.status = 'rejeitado' AND NEW.decision_reason IS NOT NULL THEN
      v_body := v_body || ' — ' || NEW.decision_reason;
    END IF;
    PERFORM public._notify(
      NEW.company_id, NEW.forwarded_by, NULL, 'vacation_requested', v_title,
      v_body, CASE WHEN NEW.status = 'rejeitado' THEN 'alta' ELSE 'media' END,
      jsonb_build_object('vacation_id', NEW.id, 'decided_by', NEW.decided_by, 'action_required', false)
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vacation_notify_forwarded_decision_trg ON public.vacation_requests;
CREATE TRIGGER vacation_notify_forwarded_decision_trg
AFTER UPDATE OF status ON public.vacation_requests
FOR EACH ROW EXECUTE FUNCTION public.vacation_notify_forwarded_decision();
