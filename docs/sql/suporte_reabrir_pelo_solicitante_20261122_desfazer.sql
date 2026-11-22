-- Reverte suporte_reabrir_pelo_solicitante_20261122_aplicar.sql
BEGIN;
DO $guard$
DECLARE v_def text;
BEGIN
  IF to_regclass('public._omnibiz_fn_backup_20261122_reopen') IS NULL THEN
    RAISE EXCEPTION 'PARAR: cópia não encontrada (script de aplicar não aplicado). Nada foi alterado.';
  END IF;
  SELECT def INTO v_def FROM public._omnibiz_fn_backup_20261122_reopen ORDER BY saved_at LIMIT 1;
  EXECUTE v_def;
END
$guard$;
DROP FUNCTION IF EXISTS public.support_requester_reopen(uuid, text);
DROP TABLE public._omnibiz_fn_backup_20261122_reopen;
COMMIT;
SELECT (position('omnibiz.support_requester_reopen' in pg_get_functiondef('public.support_tickets_prevent_forbidden_updates()'::regprocedure)) = 0)::text AS protecao_original;
