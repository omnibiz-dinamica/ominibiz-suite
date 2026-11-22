-- Reverte desfazer_edicao_serie_20261122_aplicar.sql:
-- recurrence_update volta à versão guardada; remove a função de desfazer e a tabela de cópias.
BEGIN;
DO $guard$
DECLARE v_def text;
BEGIN
  IF to_regclass('public._omnibiz_fn_backup_20261122_undo') IS NULL THEN
    RAISE EXCEPTION 'PARAR: cópia da função não encontrada (o script de aplicar não foi aplicado). Nada foi alterado.';
  END IF;
  SELECT def INTO v_def FROM public._omnibiz_fn_backup_20261122_undo
   WHERE fn = 'recurrence_update(uuid,jsonb,text,uuid)' ORDER BY saved_at LIMIT 1;
  IF v_def IS NULL THEN RAISE EXCEPTION 'PARAR: cópia vazia. Nada foi alterado.'; END IF;
  EXECUTE v_def;
END
$guard$;
DROP FUNCTION IF EXISTS public.recurrence_edit_undo_apply(uuid);
DROP TABLE IF EXISTS public.recurrence_edit_undo;
DROP TABLE IF EXISTS public._omnibiz_fn_backup_20261122_undo;
COMMIT;
SELECT (position('recurrence_edit_undo' in pg_get_functiondef('public.recurrence_update(uuid,jsonb,text,uuid)'::regprocedure)) = 0)::text AS recurrence_update_original;
