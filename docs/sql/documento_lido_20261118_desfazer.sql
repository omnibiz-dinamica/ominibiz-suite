-- OmniBiz · DESFAZER documento_lido_20261118_aplicar.sql: ler volta a não notificar.
-- (O valor de enum employee_document_viewed fica; não afeta nada.)
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'documento_lido_20261118') <> 1 THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia da função (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'documento_lido_20261118' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'documento_lido_20261118';
COMMIT;
SELECT jsonb_build_object('ler_sem_notificacao',
  position('employee_document_viewed' IN pg_get_functiondef('public.employee_attachment_mark_viewed(uuid)'::regprocedure)) = 0
)::text AS resultado;
