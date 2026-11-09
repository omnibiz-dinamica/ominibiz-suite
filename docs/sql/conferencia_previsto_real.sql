-- =====================================================================
-- OmniBiz · Conferência Previsto x Real (Ponto > Gestão e Fechamento)
-- Desfazer: conf_desfazer.sql
--
-- Cria:
--   • tabela timesheet_schedule_reconciliations (decisões Validar/Ignorar)
--   • tabela timesheet_reconciliation_events (histórico, só acrescenta)
--   • timesheet_reconciliation_counted_minutes(time_entry)  (uso interno)
--   • timesheet_reconciliation_rows(...)                    (uso interno)
--   • timesheet_reconciliation_list(...)  e  timesheet_reconciliation_decide(...)
-- Ajusta (só os pontos indicados; cópia das originais em _omnibiz_fn_backup):
--   • timesheet_build_snapshot: horas da linha "Ignorada" = horas previstas
--   • calculate_time_entry_value: valor calculado sobre as horas contadas
-- Regras (dono, 09/11/2026):
--   Validar  = conta o real.  Ignorar = conta o previsto (o ponto real fica igual).
--   Falta (sem ponto): Ignorar = só ciência, conta 0h.  Sem previsto: sem Ignorar.
--   Duração igual à prevista = sem ação.  Gestor e Contabilidade decidem.
--   Folha assinada/fechada: Ignorar (e desfazer um Ignorar) bloqueado.
-- Se algo falhar, nada fica alterado.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.timesheet_schedule_reconciliations') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF md5(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure)) <> '5b3db9b336c1b8ff6b19865b8191096e' THEN
    RAISE EXCEPTION 'PARAR: timesheet_build_snapshot diferente da leitura de 09/11. Nada foi alterado.';
  END IF;
  IF md5(pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure)) <> '22d269786862b2be7278a9666b60fd6c' THEN
    RAISE EXCEPTION 'PARAR: calculate_time_entry_value diferente da leitura de 09/11. Nada foi alterado.';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- Cópia das definições originais (o desfazer repõe-nas tal e qual)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._omnibiz_fn_backup (
  id bigserial PRIMARY KEY,
  tag text NOT NULL,
  fn text NOT NULL,
  def text NOT NULL,
  def_md5 text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._omnibiz_fn_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._omnibiz_fn_backup FROM PUBLIC, anon, authenticated;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'conf_previsto_real', f, pg_get_functiondef(f::regprocedure), md5(pg_get_functiondef(f::regprocedure))
FROM (VALUES ('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'),
             ('public.calculate_time_entry_value(uuid)')) AS x(f);

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
CREATE TABLE public.timesheet_schedule_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  time_entry_id uuid REFERENCES public.time_entries(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('validated', 'ignored')),
  planned_minutes integer,
  real_minutes integer NOT NULL DEFAULT 0,
  counted_minutes integer NOT NULL DEFAULT 0,
  notes text,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tsr_target_chk CHECK (task_id IS NOT NULL OR time_entry_id IS NOT NULL),
  CONSTRAINT tsr_ignored_needs_plan CHECK (decision <> 'ignored' OR (task_id IS NOT NULL AND planned_minutes IS NOT NULL))
);
CREATE UNIQUE INDEX tsr_unique_task ON public.timesheet_schedule_reconciliations (company_id, task_id)
  WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX tsr_unique_entry ON public.timesheet_schedule_reconciliations (company_id, time_entry_id)
  WHERE task_id IS NULL;
CREATE INDEX tsr_employee_date ON public.timesheet_schedule_reconciliations (company_id, employee_id, work_date);

ALTER TABLE public.timesheet_schedule_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tsr_read ON public.timesheet_schedule_reconciliations FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id) OR public.is_company_accountant(auth.uid(), company_id));
-- Sem políticas de escrita: só pelas funções abaixo.
REVOKE INSERT, UPDATE, DELETE ON public.timesheet_schedule_reconciliations FROM anon, authenticated;

CREATE TABLE public.timesheet_reconciliation_events (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  task_id uuid,
  time_entry_id uuid,
  action text NOT NULL CHECK (action IN ('validated', 'ignored', 'reset')),
  previous_decision text,
  planned_minutes integer,
  real_minutes integer,
  counted_minutes integer,
  notes text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tsre_employee_date ON public.timesheet_reconciliation_events (company_id, employee_id, work_date);
ALTER TABLE public.timesheet_reconciliation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tsre_read ON public.timesheet_reconciliation_events FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id) OR public.is_company_accountant(auth.uid(), company_id));
REVOKE INSERT, UPDATE, DELETE ON public.timesheet_reconciliation_events FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Minutos que contam para um ponto (NULL = conta o real, sem mudança)
-- Só há valor quando a tarefa do ponto foi "Ignorada", tem previsto, todos os
-- pontos dessa tarefa estão fechados e o real não mudou desde a decisão.
-- O previsto fica no 1.º ponto da tarefa; os outros pontos dela contam 0.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.timesheet_reconciliation_counted_minutes(_time_entry_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_te record;
  v_rec record;
  v_real int;
  v_open boolean;
  v_first uuid;
BEGIN
  SELECT te.id, te.task_id, te.user_id, te.company_id, te.voided_at, te.entry_kind
    INTO v_te FROM public.time_entries te WHERE te.id = _time_entry_id;
  IF NOT FOUND OR v_te.task_id IS NULL OR v_te.voided_at IS NOT NULL
     OR COALESCE(v_te.entry_kind, 'work') = 'paid_leave' THEN
    RETURN NULL;
  END IF;

  SELECT r.planned_minutes, r.real_minutes INTO v_rec
  FROM public.timesheet_schedule_reconciliations r
  WHERE r.company_id = v_te.company_id AND r.task_id = v_te.task_id
    AND r.employee_id = v_te.user_id AND r.decision = 'ignored' AND r.planned_minutes IS NOT NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(COALESCE(t.effective_minutes, 0)), 0)::int, bool_or(t.ended_at IS NULL)
    INTO v_real, v_open
  FROM public.time_entries t
  WHERE t.company_id = v_te.company_id AND t.task_id = v_te.task_id AND t.user_id = v_te.user_id
    AND t.voided_at IS NULL AND COALESCE(t.entry_kind, 'work') <> 'paid_leave';
  IF COALESCE(v_open, false) OR v_real <> v_rec.real_minutes THEN
    RETURN NULL;  -- o ponto mudou depois da decisão: volta a contar o real
  END IF;

  SELECT t.id INTO v_first
  FROM public.time_entries t
  WHERE t.company_id = v_te.company_id AND t.task_id = v_te.task_id AND t.user_id = v_te.user_id
    AND t.voided_at IS NULL AND COALESCE(t.entry_kind, 'work') <> 'paid_leave'
  ORDER BY t.started_at, t.id
  LIMIT 1;

  RETURN CASE WHEN v_first = _time_entry_id THEN v_rec.planned_minutes ELSE 0 END;
END
$f$;

-- ---------------------------------------------------------------------
-- Linhas da conferência (uso interno; a autorização fica em list/decide)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.timesheet_reconciliation_rows(_company_id uuid, _employee_id uuid, _from date, _to date)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  WITH cfg AS (
    SELECT COALESCE(NULLIF(btrim(c.timezone), ''), 'Europe/Lisbon') AS tz
    FROM public.companies c WHERE c.id = _company_id
  ), today AS (
    SELECT (now() AT TIME ZONE (SELECT tz FROM cfg))::date AS d
  ), ent AS (
    SELECT te.id, te.task_id, te.started_at, te.ended_at,
           COALESCE(te.effective_minutes, 0) AS eff,
           COALESCE(vz.name, (SELECT tz FROM cfg)) AS tz
    FROM public.time_entries te
    LEFT JOIN LATERAL (
      SELECT g.device_fingerprint->>'tz' AS tz
      FROM public.time_entry_geopoints g
      WHERE g.time_entry_id = te.id AND g.event_kind = 'start'
        AND NULLIF(g.device_fingerprint->>'tz', '') IS NOT NULL
      ORDER BY g.created_at LIMIT 1
    ) gp ON true
    LEFT JOIN pg_timezone_names vz ON vz.name = gp.tz
    WHERE te.company_id = _company_id AND te.user_id = _employee_id
      AND te.voided_at IS NULL AND COALESCE(te.entry_kind, 'work') <> 'paid_leave'
      AND te.started_at >= (_from::timestamp - interval '2 days') AT TIME ZONE 'UTC'
      AND te.started_at <  (_to::timestamp + interval '3 days') AT TIME ZONE 'UTC'
  ), tk AS (
    SELECT t.id, t.title, t.status::text AS status, t.client_id, cl.name AS client_name,
           t.scheduled_for, t.scheduled_end, t.recurrence_id,
           COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date,
                    (t.due_at AT TIME ZONE 'UTC')::date) AS work_date,
           (t.scheduled_for IS NOT NULL AND t.scheduled_end IS NOT NULL AND t.scheduled_end > t.scheduled_for
            AND (t.scheduled_for AT TIME ZONE 'UTC')::time <> time '00:00') AS has_plan
    FROM public.tasks t
    LEFT JOIN public.clients cl ON cl.id = t.client_id AND cl.company_id = t.company_id
    WHERE t.company_id = _company_id AND t.deleted_at IS NULL
      AND NOT COALESCE(lower(btrim(cl.name)) = 'folga remunerada', false)
      AND (
        (t.assigned_to = _employee_id AND t.status::text <> 'cancelado'
         AND COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date,
                      (t.due_at AT TIME ZONE 'UTC')::date) BETWEEN _from AND _to)
        OR t.id IN (SELECT e.task_id FROM ent e WHERE e.task_id IS NOT NULL)
      )
  ), tk_agg AS (
    SELECT k.*,
           (SELECT COUNT(*) FROM ent e WHERE e.task_id = k.id)::int AS n,
           (SELECT COALESCE(SUM(e.eff), 0) FROM ent e WHERE e.task_id = k.id)::int AS real_min,
           (SELECT bool_or(e.ended_at IS NULL) FROM ent e WHERE e.task_id = k.id) AS any_open,
           (SELECT e.id FROM ent e WHERE e.task_id = k.id ORDER BY e.started_at, e.id LIMIT 1) AS first_entry,
           (SELECT to_char(MIN(e.started_at AT TIME ZONE e.tz), 'HH24:MI') FROM ent e WHERE e.task_id = k.id) AS real_start,
           (SELECT to_char(MAX(e.ended_at AT TIME ZONE e.tz), 'HH24:MI') FROM ent e WHERE e.task_id = k.id) AS real_end,
           -- Recorrências: a hora de fim guarda a data do fim da série; conta só as horas do dia.
           CASE WHEN NOT k.has_plan THEN NULL
                WHEN k.recurrence_id IS NOT NULL THEN
                  ((round(EXTRACT(EPOCH FROM ((k.scheduled_end AT TIME ZONE 'UTC')::time
                                              - (k.scheduled_for AT TIME ZONE 'UTC')::time)) / 60)::int + 1440) % 1440)
                ELSE round(EXTRACT(EPOCH FROM (k.scheduled_end - k.scheduled_for)) / 60)::int
           END AS plan_min
    FROM tk k
  ), task_rows AS (
    SELECT a.*, r.decision, r.planned_minutes AS r_plan, r.real_minutes AS r_real, r.notes AS r_notes,
           r.decided_at, pr.full_name AS decided_by_name,
           tp.status::text AS period_status
    FROM tk_agg a
    LEFT JOIN public.timesheet_schedule_reconciliations r
      ON r.company_id = _company_id AND r.task_id = a.id AND r.employee_id = _employee_id
    LEFT JOIN public.profiles pr ON pr.id = r.decided_by
    LEFT JOIN public.timesheet_periods tp
      ON tp.company_id = _company_id AND tp.employee_id = _employee_id
     AND tp.period_year = EXTRACT(YEAR FROM a.work_date)::int AND tp.period_month = EXTRACT(MONTH FROM a.work_date)::int
    WHERE a.work_date BETWEEN _from AND _to
      AND (a.n > 0 OR (a.has_plan AND a.work_date <= (SELECT d FROM today)))
  ), free_rows AS (
    SELECT e.*, (e.started_at AT TIME ZONE e.tz)::date AS work_date,
           r.decision, r.real_minutes AS r_real, r.notes AS r_notes, r.decided_at, pr.full_name AS decided_by_name,
           tp.status::text AS period_status
    FROM ent e
    LEFT JOIN public.timesheet_schedule_reconciliations r
      ON r.company_id = _company_id AND r.time_entry_id = e.id AND r.task_id IS NULL
    LEFT JOIN public.profiles pr ON pr.id = r.decided_by
    LEFT JOIN public.timesheet_periods tp
      ON tp.company_id = _company_id AND tp.employee_id = _employee_id
     AND tp.period_year = EXTRACT(YEAR FROM (e.started_at AT TIME ZONE e.tz))::int
     AND tp.period_month = EXTRACT(MONTH FROM (e.started_at AT TIME ZONE e.tz))::int
    WHERE e.task_id IS NULL AND (e.started_at AT TIME ZONE e.tz)::date BETWEEN _from AND _to
  ), task_out AS (
    SELECT x.*,
      CASE
        WHEN x.any_open THEN 'aberto'
        WHEN x.plan_min IS NOT NULL AND x.real_min = x.plan_min AND x.n > 0 THEN 'ok'
        WHEN x.decision IS NOT NULL AND x.r_real = x.real_min AND x.r_plan IS NOT DISTINCT FROM x.plan_min THEN x.decision
        ELSE 'pendente'
      END AS st,
      (x.decision IS NOT NULL AND NOT (x.r_real = x.real_min AND x.r_plan IS NOT DISTINCT FROM x.plan_min)) AS stale,
      COALESCE(x.period_status IN ('assinado_funcionario', 'em_conferencia', 'fechado_gestor', 'disponivel_contabilidade'), false) AS locked
    FROM task_rows x
  )
  SELECT jsonb_build_object(
    'row_key', 'task:' || o.id,
    'kind', CASE WHEN o.n = 0 THEN 'missing' WHEN o.plan_min IS NULL THEN 'unplanned_task' ELSE 'task' END,
    'work_date', o.work_date,
    'task_id', o.id,
    'time_entry_id', o.first_entry,
    'task_title', o.title,
    'task_status', o.status,
    'client_name', o.client_name,
    'planned_start', CASE WHEN o.has_plan THEN to_char(o.scheduled_for AT TIME ZONE 'UTC', 'HH24:MI') END,
    'planned_end', CASE WHEN o.has_plan THEN to_char(o.scheduled_end AT TIME ZONE 'UTC', 'HH24:MI') END,
    'planned_minutes', o.plan_min,
    'scheduled_for', o.scheduled_for,
    'scheduled_end', o.scheduled_end,
    'real_start', o.real_start,
    'real_end', o.real_end,
    'real_minutes', o.real_min,
    'entries_count', o.n,
    'diff_minutes', CASE WHEN o.any_open THEN NULL ELSE o.real_min - COALESCE(o.plan_min, 0) END,
    'counted_minutes', CASE WHEN o.st = 'ignored' AND o.n > 0 THEN o.plan_min
                            WHEN o.st = 'ignored' THEN 0 ELSE o.real_min END,
    'status', o.st,
    'decision', o.decision,
    'decision_stale', o.stale,
    'decided_by_name', o.decided_by_name,
    'decided_at', o.decided_at,
    'notes', o.r_notes,
    'period_status', o.period_status,
    'period_locked', o.locked,
    'actions', to_jsonb(array_remove(ARRAY[
      CASE WHEN o.st IN ('pendente') AND o.n > 0 THEN 'validate' END,
      CASE WHEN o.st IN ('pendente') AND o.plan_min IS NOT NULL AND NOT o.locked THEN 'ignore' END,
      CASE WHEN o.n > 0 AND o.st <> 'ok' THEN 'edit' END,
      CASE WHEN o.n = 0 AND o.st = 'pendente' THEN 'launch' END,
      CASE WHEN o.st IN ('validated', 'ignored') AND NOT (o.st = 'ignored' AND o.locked) THEN 'reset' END
    ], NULL))
  )
  FROM task_out o
  UNION ALL
  SELECT jsonb_build_object(
    'row_key', 'entry:' || f.id,
    'kind', 'unplanned',
    'work_date', f.work_date,
    'task_id', NULL,
    'time_entry_id', f.id,
    'task_title', NULL,
    'task_status', NULL,
    'client_name', NULL,
    'planned_start', NULL,
    'planned_end', NULL,
    'planned_minutes', NULL,
    'scheduled_for', NULL,
    'scheduled_end', NULL,
    'real_start', to_char(f.started_at AT TIME ZONE f.tz, 'HH24:MI'),
    'real_end', to_char(f.ended_at AT TIME ZONE f.tz, 'HH24:MI'),
    'real_minutes', f.eff,
    'entries_count', 1,
    'diff_minutes', CASE WHEN f.ended_at IS NULL THEN NULL ELSE f.eff END,
    'counted_minutes', f.eff,
    'status', CASE WHEN f.ended_at IS NULL THEN 'aberto'
                   WHEN f.decision IS NOT NULL AND f.r_real = f.eff THEN f.decision
                   ELSE 'pendente' END,
    'decision', f.decision,
    'decision_stale', f.decision IS NOT NULL AND f.r_real <> f.eff,
    'decided_by_name', f.decided_by_name,
    'decided_at', f.decided_at,
    'notes', f.r_notes,
    'period_status', f.period_status,
    'period_locked', COALESCE(f.period_status IN ('assinado_funcionario', 'em_conferencia', 'fechado_gestor', 'disponivel_contabilidade'), false),
    'actions', to_jsonb(array_remove(ARRAY[
      CASE WHEN f.ended_at IS NOT NULL AND NOT (f.decision IS NOT NULL AND f.r_real = f.eff) THEN 'validate' END,
      'edit',
      CASE WHEN f.decision IS NOT NULL AND f.r_real = f.eff THEN 'reset' END
    ], NULL))
  )
  FROM free_rows f;
$f$;

-- ---------------------------------------------------------------------
-- Listar (Gestão, Fechamento e Contabilidade)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.timesheet_reconciliation_list(_company_id uuid, _employee_id uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _company_id IS NULL OR _employee_id IS NULL OR _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'Empresa, funcionário e período são obrigatórios';
  END IF;
  IF _to < _from OR _to - _from > 62 THEN
    RAISE EXCEPTION 'Período inválido (máximo 2 meses)';
  END IF;
  IF NOT (public.is_company_manager(v_uid, _company_id) OR public.is_company_accountant(v_uid, _company_id)) THEN
    RAISE EXCEPTION 'Sem permissão para a conferência do ponto';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _employee_id AND ur.company_id = _company_id) THEN
    RAISE EXCEPTION 'Funcionário não pertence a esta empresa';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(r ORDER BY r->>'work_date', COALESCE(r->>'planned_start', r->>'real_start'), r->>'row_key')
    FROM public.timesheet_reconciliation_rows(_company_id, _employee_id, _from, _to) AS r
  ), '[]'::jsonb);
END
$f$;

-- ---------------------------------------------------------------------
-- Decidir: Validar / Ignorar / Desfazer
-- ---------------------------------------------------------------------
CREATE FUNCTION public.timesheet_reconciliation_decide(
  _company_id uuid, _employee_id uuid, _task_id uuid, _time_entry_id uuid, _decision text, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_date date;
  v_row jsonb;
  v_actions jsonb;
  v_prev public.timesheet_schedule_reconciliations%ROWTYPE;
  v_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
  v_counted int;
  v_e record;
  v_is_manager boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _decision NOT IN ('validated', 'ignored', 'reset') THEN RAISE EXCEPTION 'Decisão inválida'; END IF;
  IF _company_id IS NULL OR _employee_id IS NULL OR (_task_id IS NULL AND _time_entry_id IS NULL) THEN
    RAISE EXCEPTION 'Indique a empresa, o funcionário e a tarefa ou o ponto';
  END IF;
  v_is_manager := public.is_company_manager(v_uid, _company_id);
  IF NOT (v_is_manager OR public.is_company_accountant(v_uid, _company_id)) THEN
    RAISE EXCEPTION 'Sem permissão para a conferência do ponto';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _employee_id AND ur.company_id = _company_id) THEN
    RAISE EXCEPTION 'Funcionário não pertence a esta empresa';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 500 THEN RAISE EXCEPTION 'Observação demasiado longa (máx. 500)'; END IF;

  -- Data da linha (tarefa: dia da tarefa; ponto sem tarefa: dia do ponto)
  IF _task_id IS NOT NULL THEN
    SELECT COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date, (t.due_at AT TIME ZONE 'UTC')::date)
      INTO v_date FROM public.tasks t WHERE t.id = _task_id AND t.company_id = _company_id;
  ELSE
    SELECT (te.started_at AT TIME ZONE COALESCE(NULLIF(btrim(c.timezone), ''), 'Europe/Lisbon'))::date
      INTO v_date
    FROM public.time_entries te JOIN public.companies c ON c.id = te.company_id
    WHERE te.id = _time_entry_id AND te.company_id = _company_id AND te.user_id = _employee_id AND te.task_id IS NULL;
  END IF;
  IF v_date IS NULL THEN RAISE EXCEPTION 'Linha não encontrada'; END IF;

  SELECT r INTO v_row
  FROM public.timesheet_reconciliation_rows(_company_id, _employee_id, v_date - 1, v_date + 1) AS r
  WHERE (_task_id IS NOT NULL AND r->>'task_id' = _task_id::text)
     OR (_task_id IS NULL AND r->>'row_key' = 'entry:' || _time_entry_id::text)
  LIMIT 1;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Linha não encontrada na conferência deste funcionário'; END IF;
  v_actions := v_row->'actions';

  IF _task_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.timesheet_schedule_reconciliations
    WHERE company_id = _company_id AND task_id = _task_id FOR UPDATE;
  ELSE
    SELECT * INTO v_prev FROM public.timesheet_schedule_reconciliations
    WHERE company_id = _company_id AND time_entry_id = _time_entry_id AND task_id IS NULL FOR UPDATE;
  END IF;

  IF _decision = 'reset' THEN
    IF v_prev.id IS NULL THEN RAISE EXCEPTION 'Esta linha não tem decisão para desfazer'; END IF;
    IF v_prev.decision = 'ignored' AND (v_row->>'period_locked')::boolean THEN
      RAISE EXCEPTION 'A folha deste mês já foi assinada ou fechada: peça a correção da folha antes de desfazer.';
    END IF;
    DELETE FROM public.timesheet_schedule_reconciliations WHERE id = v_prev.id;
  ELSE
    IF _decision = 'validated' AND NOT (v_actions ? 'validate') THEN
      RAISE EXCEPTION 'Esta linha não pode ser validada (sem diferença, ponto aberto ou já validada).';
    END IF;
    IF _decision = 'ignored' AND NOT (v_actions ? 'ignore') THEN
      IF (v_row->>'planned_minutes') IS NULL THEN
        RAISE EXCEPTION 'Sem horário previsto: use Validar ou Alterar.';
      ELSIF (v_row->>'period_locked')::boolean THEN
        RAISE EXCEPTION 'A folha deste mês já foi assinada ou fechada: peça a correção da folha antes de ignorar.';
      ELSE
        RAISE EXCEPTION 'Esta linha não pode ser ignorada (sem diferença, ponto aberto ou já decidida).';
      END IF;
    END IF;
    IF (v_row->>'period_locked')::boolean AND v_prev.decision = 'ignored' THEN
      RAISE EXCEPTION 'A folha deste mês já foi assinada ou fechada: peça a correção da folha.';
    END IF;

    v_counted := CASE
      WHEN _decision = 'ignored' AND (v_row->>'entries_count')::int > 0 THEN (v_row->>'planned_minutes')::int
      WHEN _decision = 'ignored' THEN 0
      ELSE (v_row->>'real_minutes')::int END;

    IF v_prev.id IS NOT NULL THEN
      DELETE FROM public.timesheet_schedule_reconciliations WHERE id = v_prev.id;
    END IF;
    INSERT INTO public.timesheet_schedule_reconciliations (
      company_id, employee_id, work_date, task_id, time_entry_id, decision,
      planned_minutes, real_minutes, counted_minutes, notes, decided_by)
    VALUES (
      _company_id, _employee_id, v_date, _task_id,
      CASE WHEN _task_id IS NULL THEN _time_entry_id ELSE NULLIF(v_row->>'time_entry_id', '')::uuid END,
      _decision, NULLIF(v_row->>'planned_minutes', '')::int, (v_row->>'real_minutes')::int, v_counted,
      v_notes, v_uid);
  END IF;

  INSERT INTO public.timesheet_reconciliation_events (
    company_id, employee_id, work_date, task_id, time_entry_id, action, previous_decision,
    planned_minutes, real_minutes, counted_minutes, notes, actor_user_id)
  VALUES (
    _company_id, _employee_id, v_date, _task_id,
    CASE WHEN _task_id IS NULL THEN _time_entry_id ELSE NULLIF(v_row->>'time_entry_id', '')::uuid END,
    _decision, v_prev.decision, NULLIF(v_row->>'planned_minutes', '')::int, (v_row->>'real_minutes')::int,
    v_counted, v_notes, v_uid);

  -- Valor a pagar dos pontos desta tarefa passa a seguir as horas contadas
  IF _task_id IS NOT NULL AND (_decision = 'ignored' OR v_prev.decision = 'ignored') THEN
    FOR v_e IN
      SELECT t.id FROM public.time_entries t
      WHERE t.company_id = _company_id AND t.task_id = _task_id AND t.user_id = _employee_id
        AND t.voided_at IS NULL AND t.ended_at IS NOT NULL
    LOOP
      PERFORM public.calculate_time_entry_value(v_e.id);
    END LOOP;
    -- Totais da folha (só enquanto não está assinada; a função já respeita isso)
    IF v_is_manager THEN
      PERFORM public.timesheet_period_ensure(_company_id, _employee_id,
        EXTRACT(YEAR FROM v_date)::int, EXTRACT(MONTH FROM v_date)::int);
    END IF;
  END IF;

  SELECT r INTO v_row
  FROM public.timesheet_reconciliation_rows(_company_id, _employee_id, v_date - 1, v_date + 1) AS r
  WHERE (_task_id IS NOT NULL AND r->>'task_id' = _task_id::text)
     OR (_task_id IS NULL AND r->>'row_key' = 'entry:' || _time_entry_id::text)
  LIMIT 1;
  RETURN v_row;
END
$f$;

REVOKE ALL ON FUNCTION public.timesheet_reconciliation_counted_minutes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.timesheet_reconciliation_rows(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.timesheet_reconciliation_list(uuid, uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.timesheet_reconciliation_decide(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_reconciliation_list(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timesheet_reconciliation_decide(uuid, uuid, uuid, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- Ajustes cirúrgicos nas funções existentes (cada ponto tem de existir 1 vez)
-- ---------------------------------------------------------------------
DO $patch$
DECLARE
  v_def text;
  v_n int;
BEGIN
  -- 1) Folha: minutos de cada ponto = contados (Ignorar) ou reais
  v_def := pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure);
  SELECT count(*) INTO v_n FROM regexp_matches(v_def,
    'COALESCE\(te\.effective_minutes,\s*0\)\s*\+\s*COALESCE\(te\.paid_leave_minutes,\s*0\)\s+AS\s+minutes,', 'g');
  IF v_n <> 1 THEN RAISE EXCEPTION 'PARAR: ponto 1 da folha encontrado % vezes. Nada foi alterado.', v_n; END IF;
  v_def := regexp_replace(v_def,
    'COALESCE\(te\.effective_minutes,\s*0\)\s*\+\s*COALESCE\(te\.paid_leave_minutes,\s*0\)\s+AS\s+minutes,',
    'COALESCE(public.timesheet_reconciliation_counted_minutes(te.id), te.effective_minutes, 0) + COALESCE(te.paid_leave_minutes, 0) AS minutes,
public.timesheet_reconciliation_counted_minutes(te.id) IS NOT NULL AS counted_override,');

  SELECT count(*) INTO v_n FROM regexp_matches(v_def, '''effective_minutes'',\s*e\.effective_minutes,', 'g');
  IF v_n <> 1 THEN RAISE EXCEPTION 'PARAR: ponto 2 da folha encontrado % vezes. Nada foi alterado.', v_n; END IF;
  v_def := regexp_replace(v_def, '''effective_minutes'',\s*e\.effective_minutes,',
    '''effective_minutes'', e.effective_minutes,
''reconciliation_ignored'', e.counted_override,');
  EXECUTE v_def;

  -- 2) Valor: calculado sobre os minutos contados
  v_def := pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure);
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'v_minutes\s*:=\s*te\.effective_minutes;', 'g');
  IF v_n <> 1 THEN RAISE EXCEPTION 'PARAR: ponto 1 do valor encontrado % vezes. Nada foi alterado.', v_n; END IF;
  v_def := regexp_replace(v_def, 'v_minutes\s*:=\s*te\.effective_minutes;',
    'v_minutes := COALESCE(public.timesheet_reconciliation_counted_minutes(te.id), te.effective_minutes);');

  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'INSERT INTO time_entry_valuations\(', 'g');
  IF v_n <> 1 THEN RAISE EXCEPTION 'PARAR: ponto 2 do valor encontrado % vezes. Nada foi alterado.', v_n; END IF;
  v_def := regexp_replace(v_def, 'INSERT INTO time_entry_valuations\(',
    'IF v_minutes IS DISTINCT FROM te.effective_minutes THEN
  v_breakdown := COALESCE(v_breakdown, ''{}''::jsonb) || jsonb_build_object(
    ''reconciliation'', ''ignored'', ''real_minutes'', te.effective_minutes, ''counted_minutes'', v_minutes);
END IF;
INSERT INTO time_entry_valuations(');
  EXECUTE v_def;
END
$patch$;

COMMIT;

SELECT jsonb_pretty(jsonb_build_object(
  'tabela_decisoes', to_regclass('public.timesheet_schedule_reconciliations') IS NOT NULL,
  'tabela_historico', to_regclass('public.timesheet_reconciliation_events') IS NOT NULL,
  'funcao_listar', to_regprocedure('public.timesheet_reconciliation_list(uuid,uuid,date,date)') IS NOT NULL,
  'funcao_decidir', to_regprocedure('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)') IS NOT NULL,
  'folha_ajustada', position('timesheet_reconciliation_counted_minutes' in pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure)) > 0,
  'valor_ajustado', position('timesheet_reconciliation_counted_minutes' in pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure)) > 0,
  'copias_guardadas', (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'conf_previsto_real'),
  'anon_pode_listar', has_function_privilege('anon', 'public.timesheet_reconciliation_list(uuid,uuid,date,date)', 'EXECUTE'),
  'auth_pode_listar', has_function_privilege('authenticated', 'public.timesheet_reconciliation_list(uuid,uuid,date,date)', 'EXECUTE'),
  'auth_pode_contar', has_function_privilege('authenticated', 'public.timesheet_reconciliation_counted_minutes(uuid)', 'EXECUTE')
)) AS resultado;
