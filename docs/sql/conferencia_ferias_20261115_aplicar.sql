-- =====================================================================
-- OmniBiz · 15/11/2026 — SUP-2026-000299 (parte 2): na Conferência, o
-- gestor regista o dia como FÉRIAS. Também completa o SUP-2026-000294.
-- Desfazer: conferencia_ferias_20261115_desfazer.sql
--
-- 1) NOVA função timesheet_reconciliation_mark_vacation (decisões do dono):
--    • Só gestor/owner da empresa (ou super admin).
--    • Linha com ponto: os pontos da tarefa são ANULADOS (ficam no histórico,
--      como "Devolver ponto"; o funcionário é avisado pela auditoria).
--    • A tarefa passa a falta justificada com motivo "Férias".
--    • Cria o pedido de férias desse dia, já APROVADO, no módulo Férias
--      (gestor a marcar para outro funcionário = aprovado, regra SUP-314).
--      Se já houver férias aprovadas nesse dia, usa essas; se houver um
--      pedido pendente, não duplica e avisa.
--    • Na Conferência a linha fica "Ciente · 0 h" com a nota "Férias".
--    • Bloqueado: folha assinada/fechada, ponto aberto, tarefa de outro.
--    Nota: o sistema não tem "saldo de férias"; os dias aprovados aparecem
--    em Férias, no RH e na folha (como hoje).
--
-- 2) SUP-294: o trigger enforce_task_absence_threshold ainda obrigava a
--    esperar 1h (ou o dia seguinte) mesmo ao gestor. Passa a deixar o
--    GESTOR marcar falta (absence_source = 'manual') a qualquer momento; a
--    falta automática do sistema continua com a espera.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE d text;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_ferias_20261115') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.timesheet_reconciliation_mark_vacation(uuid,uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: a função de férias já existe. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'PARAR: falta timesheet_reconciliation_decide. Nada foi alterado.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks'
      AND column_name IN ('absence_source', 'absence_reason', 'absence_justified', 'marked_absent_at', 'marked_absent_by')) <> 5
     OR (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'time_entries'
      AND column_name IN ('voided_at', 'voided_by', 'void_reason', 'origin', 'last_edit_reason')) <> 5 THEN
    RAISE EXCEPTION 'PARAR: faltam colunas esperadas. Nada foi alterado.';
  END IF;
  d := pg_get_functiondef('public.enforce_task_absence_threshold()'::regprocedure);
  IF (SELECT count(*) FROM regexp_matches(d,
        'IF NEW\.status = ''ausente'' AND OLD\.status IS DISTINCT FROM ''ausente'' THEN', 'g')) <> 1 THEN
    RAISE EXCEPTION 'PARAR: trigger da espera da falta diferente do esperado. Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'conferencia_ferias_20261115', 'public.enforce_task_absence_threshold()',
       pg_get_functiondef('public.enforce_task_absence_threshold()'::regprocedure),
       md5(pg_get_functiondef('public.enforce_task_absence_threshold()'::regprocedure));

-- ---------------------------------------------------------------------
-- 2) Trigger: o gestor marca a falta quando souber (SUP-294)
-- ---------------------------------------------------------------------
DO $p$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.enforce_task_absence_threshold()'::regprocedure);
  n := regexp_replace(d,
    'IF NEW\.status = ''ausente'' AND OLD\.status IS DISTINCT FROM ''ausente'' THEN',
$r$IF NEW.status = 'ausente' AND OLD.status IS DISTINCT FROM 'ausente'
     -- SUP-2026-000294 (15/11/2026): o gestor marca a falta quando souber.
     AND NOT (COALESCE(NEW.absence_source, '') = 'manual' AND auth.uid() IS NOT NULL
              AND (public.is_company_manager(auth.uid(), NEW.company_id) OR public.is_super_admin(auth.uid()))) THEN$r$);
  IF n = d OR position('SUP-2026-000294' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: a troca no trigger falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p$;

-- ---------------------------------------------------------------------
-- 1) Registar o dia como férias a partir da Conferência
-- ---------------------------------------------------------------------
CREATE FUNCTION public.timesheet_reconciliation_mark_vacation(
  _company_id uuid, _employee_id uuid, _task_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_day date;
  v_prev public.task_status;
  v_old public.time_entries%ROWTYPE;
  v_voided int := 0;
  v_vac_id uuid;
  v_vac_status text;
  v_pending boolean := false;
  v_note text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (public.is_company_manager(v_uid, _company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Apenas o gestor pode registar férias na conferência';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 300 THEN RAISE EXCEPTION 'Observação demasiado longa (máx. 300)'; END IF;

  SELECT * INTO v_task FROM public.tasks
  WHERE id = _task_id AND company_id = _company_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;
  IF v_task.assigned_to IS DISTINCT FROM _employee_id THEN
    RAISE EXCEPTION 'A tarefa não é deste funcionário';
  END IF;

  v_day := COALESCE(v_task.recurrence_date, (v_task.scheduled_for AT TIME ZONE 'UTC')::date,
                    (v_task.due_at AT TIME ZONE 'UTC')::date);
  IF v_day IS NULL THEN RAISE EXCEPTION 'Tarefa sem data'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.timesheet_periods p
    WHERE p.company_id = _company_id AND p.employee_id = _employee_id
      AND p.period_year = EXTRACT(YEAR FROM v_day)::int AND p.period_month = EXTRACT(MONTH FROM v_day)::int
      AND (p.current_version > 0
           OR p.status::text IN ('assinado_funcionario', 'em_conferencia', 'fechado_gestor', 'disponivel_contabilidade'))
  ) THEN
    RAISE EXCEPTION 'Folha assinada ou fechada: corrija a folha antes de registar férias';
  END IF;

  IF EXISTS (SELECT 1 FROM public.time_entries te
             WHERE te.task_id = _task_id AND te.user_id = _employee_id
               AND te.voided_at IS NULL AND te.ended_at IS NULL) THEN
    RAISE EXCEPTION 'Há um ponto aberto nesta tarefa: feche-o antes de registar férias';
  END IF;

  -- a) Anula os pontos da tarefa (ficam no histórico; auditoria avisa o funcionário)
  FOR v_old IN
    SELECT * FROM public.time_entries te
    WHERE te.task_id = _task_id AND te.user_id = _employee_id AND te.voided_at IS NULL
    ORDER BY te.started_at
    FOR UPDATE
  LOOP
    UPDATE public.time_entries
    SET paused_at = NULL, resumed_at = NULL, effective_minutes = 0,
        origin = 'manager_voided', entry_kind = 'work',
        voided_at = now(), voided_by = v_uid,
        void_reason = 'Férias (registado na conferência)',
        last_edited_by = v_uid, last_edited_at = now(),
        last_edit_reason = 'Dia registado como férias na conferência',
        updated_at = now()
    WHERE id = v_old.id;
    INSERT INTO public.time_entries_audit(time_entry_id, company_id, action, changed_by, reason, changes)
    VALUES (v_old.id, v_old.company_id, 'update', v_uid, 'Dia registado como férias na conferência',
            jsonb_build_object(
              'voided_at', jsonb_build_object('old', v_old.voided_at, 'new', now()),
              'effective_minutes', jsonb_build_object('old', v_old.effective_minutes, 'new', 0),
              'void_reason', jsonb_build_object('old', v_old.void_reason, 'new', 'Férias (registado na conferência)')));
    v_voided := v_voided + 1;
  END LOOP;

  -- b) A tarefa passa a falta justificada "Férias"
  v_prev := v_task.status;
  UPDATE public.tasks
  SET status = 'ausente', started_at = NULL, completed_at = NULL,
      marked_absent_at = now(), marked_absent_by = v_uid,
      absence_reason = 'Férias', absence_justified = true, absence_source = 'manual',
      updated_at = now()
  WHERE id = _task_id;
  INSERT INTO public.task_audit_events (company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, reason, recurrence_id, occurrence_date, action_scope)
  VALUES (_company_id, _task_id, v_uid, 'manager', 'absence', v_prev, 'ausente',
          'Falta justificada: Férias (registado na conferência)' || COALESCE(' · ' || v_note, ''),
          v_task.recurrence_id, v_day, 'single');

  -- c) Pedido de férias aprovado nesse dia (sem duplicar)
  SELECT vr.id, vr.status::text INTO v_vac_id, v_vac_status
  FROM public.vacation_requests vr
  WHERE vr.company_id = _company_id AND vr.user_id = _employee_id
    AND vr.status::text IN ('aprovado', 'pendente', 'aguardando_aprovacao', 'pendente_confirmacao')
    AND v_day BETWEEN vr.start_date AND vr.end_date
  ORDER BY (vr.status::text = 'aprovado') DESC
  LIMIT 1;
  IF v_vac_id IS NULL THEN
    INSERT INTO public.vacation_requests (company_id, user_id, start_date, end_date, note, prior_validation)
    VALUES (_company_id, _employee_id, v_day, v_day,
            'Registado na conferência do ponto' || COALESCE(' · ' || v_note, ''), false)
    RETURNING id, status::text INTO v_vac_id, v_vac_status;
  ELSIF v_vac_status <> 'aprovado' THEN
    v_pending := true;
  END IF;

  -- d) Conferência: falta vista, conta 0 h, nota "Férias"
  --    (tarefa sem horário previsto não aceita "Ignorar": fica só como falta "Férias")
  BEGIN
    PERFORM public.timesheet_reconciliation_decide(_company_id, _employee_id, _task_id, NULL, 'ignored', 'Férias');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'work_date', v_day,
    'voided_entries', v_voided,
    'vacation_id', v_vac_id,
    'vacation_status', v_vac_status,
    'vacation_pending', v_pending
  );
END
$function$;

REVOKE ALL ON FUNCTION public.timesheet_reconciliation_mark_vacation(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_reconciliation_mark_vacation(uuid, uuid, uuid, text) TO authenticated, service_role;

COMMIT;

SELECT jsonb_build_object(
  'funcao_ferias', to_regprocedure('public.timesheet_reconciliation_mark_vacation(uuid,uuid,uuid,text)') IS NOT NULL,
  'gestor_sem_espera_no_trigger', position('SUP-2026-000294' IN pg_get_functiondef('public.enforce_task_absence_threshold()'::regprocedure)) > 0,
  'copia_guardada', (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_ferias_20261115')
)::text AS resultado;
