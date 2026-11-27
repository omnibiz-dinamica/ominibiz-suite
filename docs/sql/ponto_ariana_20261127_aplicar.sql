-- =====================================================================
-- OmniBiz · 27/11/2026 — Ponto da Ariana no dia errado (Truckstop CM)
-- Desfazer: ponto_ariana_20261127_desfazer.sql
--
-- O ponto de 27/11 14:56–14:57 (0 min) foi batido na tarefa Truckstop de
-- HOJE à noite (27/11 23:30). O que ela fez foi o turno de 26/11:
--   1. o ponto passa para a tarefa Truckstop 26/11 23:00 (87129af5),
--      com entrada 26/11 23:00 e saída 27/11 02:30 (210 min), origem
--      "correção do gestor" e registo na auditoria do ponto;
--   2. a tarefa de 26/11 fica concluída;
--   3. a tarefa de hoje à noite (27/11 23:30) volta a pendente;
--   4. 25/11 Kantoor Bogaerts: o ponto ficou aberto até 26/11 02:49 (890 min);
--      passa a 3h (saída = entrada + 180 min).
-- Guarda os valores antigos em _bkp_ponto_ariana_20261127 para desfazer.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE
  v_ariana uuid;
  v_te public.time_entries%ROWTYPE;
  v_t26 public.tasks%ROWTYPE;
  v_t27 public.tasks%ROWTYPE;
BEGIN
  IF to_regclass('public._bkp_ponto_ariana_20261127') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: esta correção já foi aplicada (backup existe). Nada foi alterado.';
  END IF;
  SELECT * INTO v_te FROM public.time_entries WHERE id = '4d2de330-ecf0-435c-82ed-03e039d8d9ce';
  IF NOT FOUND THEN RAISE EXCEPTION 'PARAR: ponto 4d2de330 não encontrado. Nada foi alterado.'; END IF;
  v_ariana := v_te.user_id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_ariana AND full_name ILIKE 'ariana%') THEN
    RAISE EXCEPTION 'PARAR: o ponto não é da Ariana. Nada foi alterado.';
  END IF;
  IF v_te.task_id <> '1be8775d-9acb-4364-8c54-c5c434ad0243' OR v_te.voided_at IS NOT NULL
     OR v_te.ended_at IS NULL OR COALESCE(v_te.effective_minutes, 0) <> 0 THEN
    RAISE EXCEPTION 'PARAR: o ponto mudou desde a consulta (tarefa/minutos/anulado). Nada foi alterado.';
  END IF;

  SELECT * INTO v_t26 FROM public.tasks WHERE id = '87129af5-3d8f-4222-9250-8fd6135f7b46';
  IF NOT FOUND OR v_t26.assigned_to <> v_ariana OR v_t26.deleted_at IS NOT NULL OR v_t26.status <> 'pendente' THEN
    RAISE EXCEPTION 'PARAR: a tarefa Truckstop de 26/11 23:00 não está pendente/ativa para a Ariana. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.time_entries WHERE task_id = v_t26.id AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'PARAR: a tarefa de 26/11 já tem ponto. Nada foi alterado.';
  END IF;

  SELECT * INTO v_t27 FROM public.tasks WHERE id = '1be8775d-9acb-4364-8c54-c5c434ad0243';
  IF NOT FOUND OR v_t27.assigned_to <> v_ariana OR v_t27.status <> 'concluido' THEN
    RAISE EXCEPTION 'PARAR: a tarefa Truckstop de 27/11 23:30 não está concluída. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.time_entries WHERE task_id = v_t27.id AND voided_at IS NULL AND id <> v_te.id) THEN
    RAISE EXCEPTION 'PARAR: a tarefa de 27/11 tem outro ponto. Nada foi alterado.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.timesheet_periods
             WHERE employee_id = v_ariana AND company_id = v_te.company_id
               AND period_year = 2026 AND period_month = 11 AND status <> 'em_aberto') THEN
    RAISE EXCEPTION 'PARAR: a folha de novembro da Ariana já não está em aberto. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.time_entries
                 WHERE id = '891b8383-4ca6-4f69-94a8-8c9165dc9f64' AND user_id = v_ariana
                   AND task_id = '779ad17b-058a-4f72-9808-619ff23bca71' AND voided_at IS NULL
                   AND effective_minutes = 890 AND paused_at IS NULL) THEN
    RAISE EXCEPTION 'PARAR: o ponto do Kantoor de 25/11 mudou desde a consulta. Nada foi alterado.';
  END IF;
END
$guard$;

CREATE TABLE public._bkp_ponto_ariana_20261127 AS
  SELECT 'time_entry'::text AS kind, to_jsonb(te.*) AS row FROM public.time_entries te
   WHERE te.id IN ('4d2de330-ecf0-435c-82ed-03e039d8d9ce', '891b8383-4ca6-4f69-94a8-8c9165dc9f64')
  UNION ALL
  SELECT 'task', to_jsonb(t.*) FROM public.tasks t
   WHERE t.id IN ('87129af5-3d8f-4222-9250-8fd6135f7b46', '1be8775d-9acb-4364-8c54-c5c434ad0243');
ALTER TABLE public._bkp_ponto_ariana_20261127 ENABLE ROW LEVEL SECURITY;

DO $fix$
DECLARE
  v_admin uuid := (SELECT user_id FROM public.user_roles WHERE role = 'super_admin' ORDER BY created_at LIMIT 1);
  v_old public.time_entries%ROWTYPE;
  v_start timestamptz := '2026-11-26 23:00'::timestamp AT TIME ZONE 'Europe/Brussels';
  v_end   timestamptz := '2026-11-27 02:30'::timestamp AT TIME ZONE 'Europe/Brussels';
  v_reason text := 'Correção 27/11: ponto batido na tarefa de 27/11 23:30 por engano; turno real Truckstop 26/11 23:00–27/11 02:30';
BEGIN
  SELECT * INTO v_old FROM public.time_entries WHERE id = '4d2de330-ecf0-435c-82ed-03e039d8d9ce' FOR UPDATE;

  UPDATE public.time_entries SET
    task_id = '87129af5-3d8f-4222-9250-8fd6135f7b46',
    started_at = v_start, ended_at = v_end,
    paused_at = NULL, resumed_at = NULL, prior_pause_seconds = 0,
    effective_minutes = 210,
    origin = 'manager_correction',
    last_edited_by = v_admin, last_edited_at = now(), last_edit_reason = v_reason,
    updated_at = now()
  WHERE id = v_old.id;

  INSERT INTO public.time_entries_audit (time_entry_id, company_id, action, changed_by, reason, changes)
  VALUES (v_old.id, v_old.company_id, 'update', v_admin, v_reason, jsonb_build_object(
    'task_id', jsonb_build_object('old', v_old.task_id, 'new', '87129af5-3d8f-4222-9250-8fd6135f7b46'),
    'started_at', jsonb_build_object('old', v_old.started_at, 'new', v_start),
    'ended_at', jsonb_build_object('old', v_old.ended_at, 'new', v_end),
    'effective_minutes', jsonb_build_object('old', v_old.effective_minutes, 'new', 210)));

  UPDATE public.tasks SET status = 'concluido', started_at = v_start, completed_at = v_end, updated_at = now()
  WHERE id = '87129af5-3d8f-4222-9250-8fd6135f7b46';

  UPDATE public.tasks SET status = 'pendente', started_at = NULL, completed_at = NULL, updated_at = now()
  WHERE id = '1be8775d-9acb-4364-8c54-c5c434ad0243';

  -- 4. Kantoor Bogaerts 25/11: 3h
  SELECT * INTO v_old FROM public.time_entries WHERE id = '891b8383-4ca6-4f69-94a8-8c9165dc9f64' FOR UPDATE;
  UPDATE public.time_entries SET
    ended_at = v_old.started_at + interval '180 minutes',
    effective_minutes = 180, origin = 'manager_correction',
    last_edited_by = v_admin, last_edited_at = now(),
    last_edit_reason = 'Correção 27/11: ponto do Kantoor ficou aberto até 26/11 02:49; trabalhou 3h',
    updated_at = now()
  WHERE id = v_old.id;
  INSERT INTO public.time_entries_audit (time_entry_id, company_id, action, changed_by, reason, changes)
  VALUES (v_old.id, v_old.company_id, 'update', v_admin,
    'Correção 27/11: ponto do Kantoor ficou aberto até 26/11 02:49; trabalhou 3h', jsonb_build_object(
    'ended_at', jsonb_build_object('old', v_old.ended_at, 'new', v_old.started_at + interval '180 minutes'),
    'effective_minutes', jsonb_build_object('old', v_old.effective_minutes, 'new', 180)));
END
$fix$;

-- Conferência (deve mostrar: ponto 26/11 23:00–27/11 02:30, 210 min, tarefa 26/11 concluída; 27/11 pendente)
SELECT to_char(te.started_at AT TIME ZONE 'Europe/Brussels','DD/MM HH24:MI') AS inicio,
       to_char(te.ended_at AT TIME ZONE 'Europe/Brussels','DD/MM HH24:MI') AS fim,
       te.effective_minutes, te.origin, t.title, to_char(t.scheduled_for AT TIME ZONE 'UTC','DD/MM HH24:MI') AS tarefa, t.status
FROM public.time_entries te JOIN public.tasks t ON t.id = te.task_id
WHERE te.id IN ('4d2de330-ecf0-435c-82ed-03e039d8d9ce', '891b8383-4ca6-4f69-94a8-8c9165dc9f64')
UNION ALL
SELECT NULL, NULL, NULL, NULL, title, to_char(scheduled_for AT TIME ZONE 'UTC','DD/MM HH24:MI'), status
FROM public.tasks WHERE id = '1be8775d-9acb-4364-8c54-c5c434ad0243';

COMMIT;
