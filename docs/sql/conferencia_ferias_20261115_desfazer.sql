-- OmniBiz · DESFAZER conferencia_ferias_20261115_aplicar.sql (SUP-299 parte 2 / SUP-294):
-- apaga a função de férias da conferência e repõe o trigger da espera da falta.
-- (Os dias já registados como férias com a função NÃO são desfeitos aqui: cada
--  um fica no histórico do ponto, da tarefa e no módulo Férias.)
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_ferias_20261115') <> 1 THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DROP FUNCTION IF EXISTS public.timesheet_reconciliation_mark_vacation(uuid, uuid, uuid, text);
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_ferias_20261115' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_ferias_20261115';
COMMIT;
SELECT jsonb_build_object(
  'funcao_apagada', to_regprocedure('public.timesheet_reconciliation_mark_vacation(uuid,uuid,uuid,text)') IS NULL,
  'trigger_reposto', position('SUP-2026-000294' IN pg_get_functiondef('public.enforce_task_absence_threshold()'::regprocedure)) = 0
)::text AS resultado;
