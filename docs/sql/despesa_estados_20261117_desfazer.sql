-- OmniBiz · DESFAZER despesa_estados_20261117_aplicar.sql (SUP-2026-000331):
-- aprovar volta a gravar logo "aguarda pagamento". As despesas que ficaram em
-- "Aprovada" (NULL) continuam a contar como não pagas, como já contavam.
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'despesa_estados_20261117') <> 3 THEN
    RAISE EXCEPTION 'PARAR: não encontrei as cópias das funções (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'despesa_estados_20261117' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'despesa_estados_20261117';
COMMIT;
SELECT jsonb_build_object('regra_antiga_reposta',
  position('payment_status=''aguardando_pagamento'',' IN pg_get_functiondef('public.expense_decide(uuid,text,text)'::regprocedure)) > 0
)::text AS resultado;
