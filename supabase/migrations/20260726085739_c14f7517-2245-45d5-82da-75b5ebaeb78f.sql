-- =============================================================
-- SUP-2026-000040 · Regularização manual de ponto pelo funcionário
-- =============================================================
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_origin_check;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_origin_check
  CHECK (origin = ANY (ARRAY['employee_punch','manager_manual','manager_correction','manual_adjustment']));

ALTER TABLE public.time_entries_audit DROP CONSTRAINT IF EXISTS time_entries_audit_action_check;
ALTER TABLE public.time_entries_audit ADD CONSTRAINT time_entries_audit_action_check
  CHECK (action = ANY (ARRAY['create','update','delete','regularize']));

CREATE OR REPLACE FUNCTION public.punch_employee_regularize(
  _task_id uuid,
  _started_at timestamptz,
  _ended_at timestamptz DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_entry public.time_entries%ROWTYPE;
  v_conflict uuid;
  v_reason text := NULLIF(btrim(COALESCE(_reason,'')),'');
  v_eff int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF _task_id IS NULL OR _started_at IS NULL THEN
    RAISE EXCEPTION 'Tarefa e horario real de inicio sao obrigatorios';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do atraso ou da ausencia de registo';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  IF NOT (v_task.assigned_to = v_uid
          OR public.is_company_manager(v_uid, v_task.company_id)
          OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissao para regularizar esta tarefa';
  END IF;

  IF v_task.status IN ('concluido','cancelado') THEN
    RAISE EXCEPTION 'Tarefa ja encerrada (%). Solicite correcao ao gestor.', v_task.status;
  END IF;

  IF _ended_at IS NOT NULL AND _ended_at <= _started_at THEN
    RAISE EXCEPTION 'Hora real de fim deve ser posterior a hora real de inicio';
  END IF;
  IF _started_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Nao e possivel regularizar um horario no futuro';
  END IF;

  -- Sobreposicao com qualquer registo do mesmo funcionario (nunca sobrescreve)
  SELECT te.id INTO v_conflict
    FROM public.time_entries te
   WHERE te.user_id = COALESCE(v_task.assigned_to, v_uid)
     AND tstzrange(te.started_at, COALESCE(te.ended_at, now()), '[)')
         && tstzrange(_started_at, COALESCE(_ended_at, _started_at + interval '1 minute'), '[)')
   LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'Existe outro registo de ponto no mesmo periodo. Ajuste os horarios ou solicite apoio ao gestor.';
  END IF;

  IF _ended_at IS NOT NULL THEN
    v_eff := public.effective_minutes_round(EXTRACT(EPOCH FROM (_ended_at - _started_at))::numeric, 0::numeric);
  END IF;

  INSERT INTO public.time_entries(
    company_id, task_id, user_id, started_at, ended_at, effective_minutes,
    created_by, origin, last_edited_by, last_edited_at, last_edit_reason, geo_policy_version
  ) VALUES (
    v_task.company_id, v_task.id, COALESCE(v_task.assigned_to, v_uid),
    _started_at, _ended_at, v_eff,
    v_uid, 'manual_adjustment', v_uid, now(),
    'Regularizacao manual pelo funcionario: ' || v_reason,
    (SELECT COALESCE(s.geo_policy_version,1) FROM public.company_hr_settings s WHERE s.company_id = v_task.company_id)
  ) RETURNING * INTO v_entry;

  INSERT INTO public.time_entries_audit(time_entry_id, company_id, action, changed_by, reason, changes)
  VALUES (v_entry.id, v_task.company_id, 'regularize', v_uid, v_reason,
    jsonb_build_object(
      'before', jsonb_build_object('task_status', v_task.status, 'time_entry', NULL),
      'after', jsonb_build_object(
        'task_status', CASE WHEN _ended_at IS NOT NULL THEN 'concluido' ELSE 'em_andamento' END,
        'started_at', _started_at, 'ended_at', _ended_at,
        'origin', 'manual_adjustment', 'time_entry_id', v_entry.id, 'task_id', v_task.id
      )
    ));

  IF _ended_at IS NOT NULL THEN
    UPDATE public.tasks
       SET status = 'concluido',
           started_at = COALESCE(started_at, _started_at),
           completed_at = COALESCE(completed_at, _ended_at),
           updated_at = now()
     WHERE id = v_task.id;
  ELSE
    UPDATE public.tasks
       SET status = 'em_andamento',
           started_at = COALESCE(started_at, _started_at),
           updated_at = now()
     WHERE id = v_task.id;
  END IF;

  RETURN v_entry;
END $function$;

REVOKE ALL ON FUNCTION public.punch_employee_regularize(uuid, timestamptz, timestamptz, text) FROM public;
GRANT EXECUTE ON FUNCTION public.punch_employee_regularize(uuid, timestamptz, timestamptz, text) TO authenticated;

-- =============================================================
-- SUP-2026-000045 · Férias: confirmação apenas quando aplicável
-- =============================================================
ALTER TABLE public.vacation_requests
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.vacation_requests SET created_by = user_id WHERE created_by IS NULL;

CREATE OR REPLACE FUNCTION public.vacation_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.user_id);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS vacation_requests_set_created_by ON public.vacation_requests;
CREATE TRIGGER vacation_requests_set_created_by
  BEFORE INSERT ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.vacation_set_created_by();

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
    -- Confirmação do funcionário só é exigida quando o pedido NÃO foi criado
    -- pelo próprio funcionário (agendamento feito pelo gestor em seu nome).
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
      'vacation_rejected', 'Férias rejeitadas', _reason, 'alta',
      jsonb_build_object('vacation_id', v_req.id));
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;
  RETURN v_req;
END $function$;