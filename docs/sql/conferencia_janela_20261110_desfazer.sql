-- OmniBiz · DESFAZER janela_aplicar.sql (10/11/2026): repõe timesheet_reconciliation_decide.
BEGIN;
DO $r$
DECLARE b record;
BEGIN
  SELECT def INTO b FROM public._omnibiz_fn_backup WHERE tag = 'decide_janela_20261110';
  IF NOT FOUND THEN RAISE EXCEPTION 'PARAR: não encontrei a cópia (o aplicar não correu?). Nada foi alterado.'; END IF;
  EXECUTE b.def;
  DELETE FROM public._omnibiz_fn_backup WHERE tag = 'decide_janela_20261110';
END
$r$;
COMMIT;
SELECT (position('inclui os dias dos pontos' IN pg_get_functiondef('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)'::regprocedure)) = 0)::text AS original_reposta;
