-- =====================================================================
-- OmniBiz · 10/11/2026 — Conferência: "Ignorar" com ponto noutro dia
-- Desfazer: janela_desfazer.sql
--
-- Caso Ariana 18/10 (Truckstop): o ponto desta tarefa foi feito a 11/10.
-- A lista do mês contava o ponto, mas ao decidir o banco só olhava de
-- 17/10 a 19/10: a linha virava "falta" (0h) e o 2.º Ignorar dava erro.
-- Correção: ao decidir, a janela passa a incluir também os dias dos pontos
-- da própria tarefa. Só muda a função timesheet_reconciliation_decide.
-- As 2 decisões gravadas com o real errado voltam a aparecer como
-- "por conferir" (o real mudou) e podem ser decididas de novo.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'decide_janela_20261110') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(
    pg_get_functiondef('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)'::regprocedure),
    'timesheet_reconciliation_rows\(_company_id, _employee_id, v_date - 1, v_date \+ 1\)', 'g');
  IF n <> 2 THEN RAISE EXCEPTION 'PARAR: função diferente do esperado (%). Nada foi alterado.', n; END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'decide_janela_20261110', f, pg_get_functiondef(f::regprocedure), md5(pg_get_functiondef(f::regprocedure))
FROM (VALUES ('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)')) AS x(f);

DO $p$
DECLARE d text := pg_get_functiondef('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)'::regprocedure);
        n text;
BEGIN
  n := regexp_replace(d,
    'timesheet_reconciliation_rows\(_company_id, _employee_id, v_date - 1, v_date \+ 1\)',
$r$timesheet_reconciliation_rows(_company_id, _employee_id,
    -- 10/11/2026: inclui os dias dos pontos da própria tarefa (ponto feito noutro dia)
    LEAST(v_date, COALESCE((SELECT min((te.started_at AT TIME ZONE COALESCE(NULLIF(btrim(c.timezone), ''), 'Europe/Lisbon'))::date)
                            FROM public.time_entries te JOIN public.companies c ON c.id = te.company_id
                            WHERE _task_id IS NOT NULL AND te.task_id = _task_id AND te.company_id = _company_id
                              AND te.voided_at IS NULL), v_date)) - 1,
    GREATEST(v_date, COALESCE((SELECT max((te.started_at AT TIME ZONE COALESCE(NULLIF(btrim(c.timezone), ''), 'Europe/Lisbon'))::date)
                               FROM public.time_entries te JOIN public.companies c ON c.id = te.company_id
                               WHERE _task_id IS NOT NULL AND te.task_id = _task_id AND te.company_id = _company_id
                                 AND te.voided_at IS NULL), v_date)) + 1)$r$, 'g');
  IF n = d OR (SELECT count(*) FROM regexp_matches(n, 'inclui os dias dos pontos da própria tarefa', 'g')) <> 2 THEN
    RAISE EXCEPTION 'PARAR: troca falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p$;

COMMIT;

-- Resultado (só leitura): a linha da Ariana 18/10 com a janela nova
SELECT jsonb_build_object(
  'funcao_trocada', (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'decide_janela_20261110'),
  'ariana_1810_janela_nova', (
    SELECT jsonb_build_object('status', x->>'status', 'real', x->'real_minutes', 'previsto', x->'planned_minutes', 'acoes', x->'actions')
    FROM public.timesheet_reconciliation_rows('7b79e6a5-5b78-4a34-ae0a-b5808c724e6c',
           (SELECT assigned_to FROM public.tasks WHERE id = '59c86155-fd57-43f6-9e97-a08d20de973b'), date '2026-10-10', date '2026-10-19') x
    WHERE x->>'task_id' = '59c86155-fd57-43f6-9e97-a08d20de973b' LIMIT 1)
)::text AS resultado;
