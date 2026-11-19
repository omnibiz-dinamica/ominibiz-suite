-- OmniBiz · DESFAZER despesas_pagamento_20261119_aplicar.sql (SUP-2026-000301):
-- o resumo volta a contar "Aprovada" como a pagar e a deixar de contar as
-- pagas; a proteção da despesa incluída num mês é removida. As despesas que
-- entretanto foram incluídas num mês continuam incluídas (só os dados ficam).
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'despesas_pagamento_20261119') <> 2 THEN
    RAISE EXCEPTION 'PARAR: não encontrei as cópias das funções (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DROP TRIGGER IF EXISTS trg_employee_expenses_payroll_lock ON public.employee_expenses;
DROP FUNCTION IF EXISTS public._employee_expenses_payroll_lock();
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'despesas_pagamento_20261119' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'despesas_pagamento_20261119';
COMMIT;
SELECT jsonb_build_object(
  'regra_antiga_reposta', position('-- SUP-301' IN pg_get_functiondef('public.payroll_monthly_report(uuid,integer,integer)'::regprocedure)) = 0,
  'protecao_removida', NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employee_expenses_payroll_lock')
)::text AS resultado;
