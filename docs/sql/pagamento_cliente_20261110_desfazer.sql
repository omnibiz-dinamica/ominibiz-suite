-- OmniBiz · DESFAZER pagamento_aplicar.sql (10/11/2026):
-- repõe as 3 funções como estavam e as valorações recalculadas voltam aos valores antigos.
BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_cliente_20261110') <> 3 THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia das 3 funções (o aplicar não correu?). Nada foi alterado.';
  END IF;
  IF to_regclass('public._omnibiz_revert_20261110_valuations') IS NULL THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia das valorações. Nada foi alterado.';
  END IF;
END
$guard$;

DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_cliente_20261110' ORDER BY id LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;

DELETE FROM public.time_entry_valuations v
USING public._omnibiz_revert_20261110_valuations b
WHERE v.time_entry_id = b.time_entry_id;

INSERT INTO public.time_entry_valuations
SELECT * FROM public._omnibiz_revert_20261110_valuations;

DELETE FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_cliente_20261110';
DROP TABLE public._omnibiz_revert_20261110_valuations;

COMMIT;

SELECT jsonb_build_object(
  'resolve_billing_rule_original', position('model_source' IN pg_get_functiondef('public.resolve_billing_rule(uuid)'::regprocedure)) = 0,
  'snapshot_original', position('by_client' IN pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure)) = 0
)::text AS resultado;
