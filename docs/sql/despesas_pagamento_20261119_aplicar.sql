-- =====================================================================
-- OmniBiz · 19/11/2026 — SUP-2026-000301: despesas no Resumo para pagamento.
-- Desfazer: despesas_pagamento_20261119_desfazer.sql
--
-- Antes:
--   • o resumo contava como "a pagar" toda a despesa aprovada sem estado de
--     pagamento (desde o SUP-331 isso é "Aprovada", ainda não "Aguarda
--     pagamento");
--   • uma despesa incluída num mês deixava de contar nesse mês quando o
--     gestor a marcava como "Paga".
-- Agora:
--   • despesa INCLUÍDA num mês (payroll_year/month) conta sempre nesse mês,
--     também depois de paga;
--   • despesa ainda não incluída só aparece se estiver "Aguarda pagamento";
--   • payroll_attach_expenses só inclui despesas "Aguarda pagamento";
--   • uma despesa incluída num mês não pode ser apagada, voltar a pendente,
--     nem mudar de valor/funcionário sem antes ser retirada no Resumo para
--     pagamento (payroll_detach_expense). Mudar o estado de pagamento
--     (aguarda pagamento → paga) continua livre.
-- Despesas existentes NÃO são alteradas (hoje nenhuma está incluída num mês).
-- =====================================================================
BEGIN;

DO $guard$
DECLARE d1 text; d2 text;
  a1 text := 'AND COALESCE(x.payment_status, ''aguardando_pagamento'') = ''aguardando_pagamento''';
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'despesas_pagamento_20261119')
     OR to_regprocedure('public._employee_expenses_payroll_lock()') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  d1 := pg_get_functiondef('public.payroll_monthly_report(uuid,integer,integer)'::regprocedure);
  d2 := pg_get_functiondef('public.payroll_attach_expenses(uuid,integer,integer,uuid)'::regprocedure);
  IF (length(d1) - length(replace(d1, a1, ''))) / length(a1) <> 1
     OR position('(x.payroll_year IS NULL AND x.expense_date < v_to)' IN d1) = 0 THEN
    RAISE EXCEPTION 'PARAR: payroll_monthly_report não está como esperado. Nada foi alterado.';
  END IF;
  IF (length(d2) - length(replace(d2, a1, ''))) / length(a1) <> 1 THEN
    RAISE EXCEPTION 'PARAR: payroll_attach_expenses não está como esperado. Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'despesas_pagamento_20261119', p::text, pg_get_functiondef(p), md5(pg_get_functiondef(p))
FROM unnest(ARRAY['public.payroll_monthly_report(uuid,integer,integer)'::regprocedure,
                  'public.payroll_attach_expenses(uuid,integer,integer,uuid)'::regprocedure]) p;

DO $apply$
DECLARE d text;
  a1 text := 'AND COALESCE(x.payment_status, ''aguardando_pagamento'') = ''aguardando_pagamento''';
BEGIN
  -- Resumo: incluída neste mês conta sempre; não incluída só se "Aguarda pagamento".
  d := pg_get_functiondef('public.payroll_monthly_report(uuid,integer,integer)'::regprocedure);
  d := replace(d, a1,
    'AND (x.payroll_year IS NOT NULL OR x.payment_status = ''aguardando_pagamento'') -- SUP-301');
  EXECUTE d;

  -- Incluir no mês: só "Aguarda pagamento" (não "Aprovada").
  d := pg_get_functiondef('public.payroll_attach_expenses(uuid,integer,integer,uuid)'::regprocedure);
  d := replace(d, a1, 'AND x.payment_status = ''aguardando_pagamento'' -- SUP-301');
  EXECUTE d;
END
$apply$;

-- Despesa incluída num mês: protegida até ser retirada no Resumo para pagamento.
CREATE FUNCTION public._employee_expenses_payroll_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $f$
BEGIN
  -- As funções de pagamento (attach/detach) e as remoções em cascata passam.
  IF COALESCE(current_setting('omnibiz.payroll_rpc', true), '') = 'on' OR pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.payroll_year IS NOT NULL AND (
       TG_OP = 'DELETE'
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    RAISE EXCEPTION 'Esta despesa está no pagamento de %/%. Retire-a primeiro no Resumo para pagamento.',
      lpad(OLD.payroll_month::text, 2, '0'), OLD.payroll_year;
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$f$;

CREATE TRIGGER trg_employee_expenses_payroll_lock
  BEFORE UPDATE OR DELETE ON public.employee_expenses
  FOR EACH ROW EXECUTE FUNCTION public._employee_expenses_payroll_lock();

COMMIT;

SELECT jsonb_build_object(
  'resumo_atualizado', position('-- SUP-301' IN pg_get_functiondef('public.payroll_monthly_report(uuid,integer,integer)'::regprocedure)) > 0,
  'incluir_atualizado', position('-- SUP-301' IN pg_get_functiondef('public.payroll_attach_expenses(uuid,integer,integer,uuid)'::regprocedure)) > 0,
  'protecao_criada', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employee_expenses_payroll_lock'),
  'despesas_incluidas_em_meses', (SELECT count(*) FROM public.employee_expenses WHERE payroll_year IS NOT NULL)
)::text AS resultado;
