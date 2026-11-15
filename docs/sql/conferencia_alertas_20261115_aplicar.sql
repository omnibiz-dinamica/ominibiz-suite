-- =====================================================================
-- OmniBiz · 15/11/2026 — SUP-2026-000299: Conferência como validação para
-- pagamento. Desfazer: conferencia_alertas_20261115_desfazer.sql
--
-- Regras (dono, 15/11/2026):
--  • Pede decisão (Validar / Corrigir / Ignorar) quando:
--      – a duração real difere da prevista em MAIS de 30 min (para mais ou
--        para menos); ou
--      – a entrada OU a saída ficam a 15 min ou mais do horário previsto
--        (antes ou depois) → linha em vermelho; ou
--      – o funcionário deixou observação na tarefa (nota de conclusão).
--  • Fora disso (até 30 min de diferença, horários dentro de 15 min, sem
--    observação) a linha fica "Dentro da tolerância" e conta o real.
--  • Decisões já tomadas (Validado / Ignorado) não mudam (a regra "ok" só
--    vale para linhas sem decisão).
-- A linha passa a trazer também a observação do funcionário e os desvios de
-- entrada/saída em minutos, para o editor "Corrigir" os mostrar.
-- Só muda timesheet_reconciliation_rows (cálculo da lista); nenhum dado é
-- alterado.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE d text; n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_alertas_20261115') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  d := pg_get_functiondef('public.timesheet_reconciliation_rows(uuid,uuid,date,date)'::regprocedure);
  SELECT count(*) INTO n FROM regexp_matches(d,
    'WHEN x\.plan_min IS NOT NULL AND x\.real_min = x\.plan_min AND x\.n > 0 THEN ''ok''', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: regra "ok" diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(d, '''notes'', o\.r_notes,', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: campo notes diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(d,
    '\(SELECT to_char\(MAX\(e\.ended_at AT TIME ZONE e\.tz\), ''HH24:MI''\) FROM ent e WHERE e\.task_id = k\.id\) AS real_end,', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: cálculo real_end diferente do esperado (%). Nada foi alterado.', n; END IF;
  IF to_regclass('public.task_audit_events') IS NULL THEN
    RAISE EXCEPTION 'PARAR: falta a tabela task_audit_events. Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'conferencia_alertas_20261115', 'public.timesheet_reconciliation_rows(uuid,uuid,date,date)',
       pg_get_functiondef('public.timesheet_reconciliation_rows(uuid,uuid,date,date)'::regprocedure),
       md5(pg_get_functiondef('public.timesheet_reconciliation_rows(uuid,uuid,date,date)'::regprocedure));

DO $p$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.timesheet_reconciliation_rows(uuid,uuid,date,date)'::regprocedure);

  -- 1) Observação do funcionário e desvios de entrada/saída (minutos, ±12 h)
  n := regexp_replace(d,
    '\(SELECT to_char\(MAX\(e\.ended_at AT TIME ZONE e\.tz\), ''HH24:MI''\) FROM ent e WHERE e\.task_id = k\.id\) AS real_end,',
$r$(SELECT to_char(MAX(e.ended_at AT TIME ZONE e.tz), 'HH24:MI') FROM ent e WHERE e.task_id = k.id) AS real_end,
           -- 15/11/2026 (SUP-299): observação do funcionário e desvios de horário
           (SELECT string_agg(btrim(ev.reason), ' · ' ORDER BY ev.created_at)
              FROM public.task_audit_events ev
             WHERE ev.task_id = k.id AND ev.event::text = 'completion_note'
               AND NULLIF(btrim(ev.reason), '') IS NOT NULL) AS employee_note,
           CASE WHEN k.has_plan THEN
             ((((round(EXTRACT(EPOCH FROM ((SELECT MIN(e.started_at AT TIME ZONE e.tz) FROM ent e WHERE e.task_id = k.id)::time
                                          - (k.scheduled_for AT TIME ZONE 'UTC')::time)) / 60)::int) % 1440) + 1440 + 720) % 1440) - 720
           END AS start_shift,
           CASE WHEN k.has_plan AND NOT COALESCE((SELECT bool_or(e.ended_at IS NULL) FROM ent e WHERE e.task_id = k.id), true) THEN
             ((((round(EXTRACT(EPOCH FROM ((SELECT MAX(e.ended_at AT TIME ZONE e.tz) FROM ent e WHERE e.task_id = k.id)::time
                                          - (k.scheduled_end AT TIME ZONE 'UTC')::time)) / 60)::int) % 1440) + 1440 + 720) % 1440) - 720
           END AS end_shift,$r$);

  -- 2) Regra "ok": tolerância de 30 min, horários a menos de 15 min, sem observação
  n := regexp_replace(n,
    'WHEN x\.plan_min IS NOT NULL AND x\.real_min = x\.plan_min AND x\.n > 0 THEN ''ok''',
$r$WHEN x.plan_min IS NOT NULL AND x.n > 0
             AND abs(x.real_min - x.plan_min) <= 30
             AND abs(COALESCE(x.start_shift, 0)) < 15 AND abs(COALESCE(x.end_shift, 0)) < 15
             AND x.employee_note IS NULL AND x.decision IS NULL THEN 'ok'$r$);

  -- 3) Campos novos na linha
  n := regexp_replace(n, '''notes'', o\.r_notes,',
$r$'notes', o.r_notes,
    'employee_note', o.employee_note,
    'start_shift_minutes', o.start_shift,
    'end_shift_minutes', o.end_shift,
    'shift_alert', (o.n > 0 AND (abs(COALESCE(o.start_shift, 0)) >= 15 OR abs(COALESCE(o.end_shift, 0)) >= 15)),$r$);

  IF n = d OR position('AS employee_note' IN n) = 0 OR position('<= 30' IN n) = 0
     OR position('''shift_alert''' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: a troca falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p$;

COMMIT;

-- Resultado (só leitura): quantas linhas de novembro da V-clean ficam por conferir
SELECT jsonb_build_object(
  'funcao_trocada', position('employee_note' IN pg_get_functiondef('public.timesheet_reconciliation_rows(uuid,uuid,date,date)'::regprocedure)) > 0,
  'copia_guardada', (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_alertas_20261115')
)::text AS resultado;
