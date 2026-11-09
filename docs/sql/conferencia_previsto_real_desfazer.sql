-- =====================================================================
-- OmniBiz · DESFAZER Conferência Previsto x Real
-- Repõe timesheet_build_snapshot e calculate_time_entry_value exatamente como
-- estavam (cópia guardada em _omnibiz_fn_backup), recalcula o valor dos pontos
-- que tinham "Ignorar" e remove as tabelas e funções da conferência.
-- ATENÇÃO: as decisões Validar/Ignorar e o seu histórico são apagados.
-- Os pontos (time_entries) nunca foram alterados e ficam como estão.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'conf_previsto_real') <> 2 THEN
    RAISE EXCEPTION 'PARAR: não encontrei as 2 cópias originais. Nada foi alterado.';
  END IF;
END
$guard$;

-- Pontos cujo valor tem de ser recalculado depois de repor a função original
CREATE TEMP TABLE _conf_recalc ON COMMIT DROP AS
SELECT DISTINCT t.id
FROM public.timesheet_schedule_reconciliations r
JOIN public.time_entries t ON t.task_id = r.task_id AND t.user_id = r.employee_id AND t.company_id = r.company_id
WHERE r.decision = 'ignored' AND t.voided_at IS NULL AND t.ended_at IS NOT NULL;

DO $restore$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT DISTINCT ON (fn) fn, def, def_md5 FROM public._omnibiz_fn_backup
    WHERE tag = 'conf_previsto_real' ORDER BY fn, id
  LOOP
    EXECUTE v.def;
    IF md5(pg_get_functiondef(v.fn::regprocedure)) <> v.def_md5 THEN
      RAISE EXCEPTION 'PARAR: % não ficou igual à original. Nada foi alterado.', v.fn;
    END IF;
  END LOOP;
END
$restore$;

DO $recalc$
DECLARE
  v record;
BEGIN
  FOR v IN SELECT id FROM _conf_recalc LOOP
    PERFORM public.calculate_time_entry_value(v.id);
  END LOOP;
END
$recalc$;

DROP FUNCTION IF EXISTS public.timesheet_reconciliation_decide(uuid, uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.timesheet_reconciliation_list(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.timesheet_reconciliation_rows(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.timesheet_reconciliation_counted_minutes(uuid);
DROP TABLE IF EXISTS public.timesheet_reconciliation_events;
DROP TABLE IF EXISTS public.timesheet_schedule_reconciliations;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'conf_previsto_real';

COMMIT;

SELECT jsonb_pretty(jsonb_build_object(
  'folha_original', md5(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure)) = '5b3db9b336c1b8ff6b19865b8191096e',
  'valor_original', md5(pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure)) = '22d269786862b2be7278a9666b60fd6c',
  'conferencia_removida', to_regclass('public.timesheet_schedule_reconciliations') IS NULL
)) AS resultado;
