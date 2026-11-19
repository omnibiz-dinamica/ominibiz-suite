-- OmniBiz · DESFAZER notificacao_tarefa_20261119_aplicar.sql (SUP-2026-000167):
-- as notificações de tarefa nova e de reatribuição voltam ao texto anterior.
-- As notificações já enviadas não mudam.
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'notificacao_tarefa_20261119') <> 2 THEN
    RAISE EXCEPTION 'PARAR: não encontrei as cópias das funções (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'notificacao_tarefa_20261119' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DROP FUNCTION IF EXISTS public._task_notification_body(text, text, timestamptz, date, timestamptz);
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'notificacao_tarefa_20261119';
COMMIT;
SELECT jsonb_build_object(
  'texto_antigo_reposto', position('-- SUP-167' IN pg_get_functiondef('public.tasks_notify_insert()'::regprocedure)) = 0
                          AND position('-- SUP-167' IN pg_get_functiondef('public.tasks_notify_update()'::regprocedure)) = 0
)::text AS resultado;
