-- =====================================================================
-- OmniBiz · Conferência Previsto x Real — correção 1 (09/11/2026)
-- Recorrências: a hora de fim da tarefa guarda a data do fim da série, por isso
-- a duração prevista passa a contar só as horas do dia (ex.: 15:30-19:30 = 4h).
-- Só substitui a função interna timesheet_reconciliation_rows. Nada mais muda.
-- Desfazer: não é preciso (o conf_desfazer.sql remove tudo da conferência).
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.timesheet_reconciliation_rows(uuid,uuid,date,date)') IS NULL THEN
    RAISE EXCEPTION 'PARAR: a conferência ainda não foi aplicada. Nada foi alterado.';
  END IF;
  IF position('k.recurrence_id IS NOT NULL' in pg_get_functiondef('public.timesheet_reconciliation_rows(uuid,uuid,date,date)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'PARAR: esta correção já foi aplicada. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.timesheet_schedule_reconciliations) THEN
    RAISE EXCEPTION 'PARAR: já existem decisões gravadas; fale com o suporte antes de aplicar. Nada foi alterado.';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.timesheet_reconciliation_rows(_company_id uuid, _employee_id uuid, _from date, _to date)
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

REVOKE ALL ON FUNCTION public.timesheet_reconciliation_rows(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;

COMMIT;

SELECT jsonb_pretty(jsonb_build_object(
  'correcao_aplicada', position('k.recurrence_id IS NOT NULL' in pg_get_functiondef('public.timesheet_reconciliation_rows(uuid,uuid,date,date)'::regprocedure)) > 0,
  'auth_pode_rows', has_function_privilege('authenticated', 'public.timesheet_reconciliation_rows(uuid,uuid,date,date)', 'EXECUTE')
)) AS resultado;
