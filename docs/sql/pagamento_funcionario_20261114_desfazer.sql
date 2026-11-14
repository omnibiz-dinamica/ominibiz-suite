-- OmniBiz · DESFAZER pagamento_funcionario_20261114_aplicar.sql (14/11/2026):
-- repõe as 3 funções como estavam (regra de 10/11: o cliente decide), apaga as
-- funções de feriados e as valorações recalculadas voltam aos valores antigos.
BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_funcionario_20261114') <> 3 THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia das 3 funções (o aplicar não correu?). Nada foi alterado.';
  END IF;
  IF to_regclass('public._omnibiz_revert_20261114_valuations') IS NULL THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia das valorações. Nada foi alterado.';
  END IF;
END
$guard$;

DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_funcionario_20261114' ORDER BY id LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;

DROP FUNCTION IF EXISTS public.omnibiz_day_type(date, text);
DROP FUNCTION IF EXISTS public.omnibiz_easter(integer);

DELETE FROM public.time_entry_valuations v
USING public._omnibiz_revert_20261114_valuations b
WHERE v.time_entry_id = b.time_entry_id;

INSERT INTO public.time_entry_valuations
SELECT * FROM public._omnibiz_revert_20261114_valuations;

DELETE FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_funcionario_20261114';
DROP TABLE public._omnibiz_revert_20261114_valuations;

COMMIT;

SELECT jsonb_build_object(
  'regra_10_11_reposta', position('a forma de pagamento é a do CLIENTE' IN pg_get_functiondef('public.resolve_billing_rule(uuid)'::regprocedure)) > 0,
  'snapshot_sem_by_day_type', position('by_day_type' IN pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure)) = 0,
  'feriados_apagados', to_regprocedure('public.omnibiz_day_type(date,text)') IS NULL
)::text AS resultado;
