-- =====================================================================
-- OmniBiz · 17/11/2026 — SUP-2026-000331: estados da despesa.
-- Desfazer: despesa_estados_20261117_desfazer.sql
--
-- Antes: aprovar gravava logo payment_status = 'aguardando_pagamento'.
-- Agora:
--   • aprovar deixa a despesa em "Aprovada" (payment_status NULL);
--   • o gestor muda depois para "Aguarda pagamento" e para "Paga";
--   • expense_mark_payment aceita também 'aprovada' (volta a NULL);
--   • histórico (_expenses_activity_audit) mostra "aprovada" em vez de
--     "sem estado" quando o pagamento volta a NULL.
-- Iguais: permissões (gestor/owner/super admin), só despesas aprovadas,
-- paid_by/paid_at, folha de pagamento (já trata NULL como não paga).
-- Despesas existentes NÃO são alteradas.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE d1 text; d2 text; d3 text;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'despesa_estados_20261117') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  d1 := pg_get_functiondef('public.expense_decide(uuid,text,text)'::regprocedure);
  d2 := pg_get_functiondef('public.expense_mark_payment(uuid,text)'::regprocedure);
  IF (length(d1) - length(replace(d1, 'payment_status=''aguardando_pagamento'',', ''))) / length('payment_status=''aguardando_pagamento'',') <> 1 THEN
    RAISE EXCEPTION 'PARAR: expense_decide não está como esperado. Nada foi alterado.';
  END IF;
  IF position('IF _payment_status NOT IN (''aguardando_pagamento'', ''paga'') THEN' IN d2) = 0
     OR position('SET payment_status = _payment_status,' IN d2) = 0 THEN
    RAISE EXCEPTION 'PARAR: expense_mark_payment não está como esperado. Nada foi alterado.';
  END IF;
  d3 := pg_get_functiondef('public._expenses_activity_audit()'::regprocedure);
  IF position('COALESCE(v_status ->> NEW.payment_status, NEW.payment_status, ''sem estado'')' IN d3) = 0
     OR position('COALESCE(v_status ->> OLD.payment_status, OLD.payment_status)' IN d3) = 0
     OR position('''para'', COALESCE(v_status ->> NEW.payment_status, NEW.payment_status))' IN d3) = 0 THEN
    RAISE EXCEPTION 'PARAR: _expenses_activity_audit não está como esperado. Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'despesa_estados_20261117', p::text, pg_get_functiondef(p), md5(pg_get_functiondef(p))
FROM unnest(ARRAY['public.expense_decide(uuid,text,text)'::regprocedure,
                  'public.expense_mark_payment(uuid,text)'::regprocedure,
                  'public._expenses_activity_audit()'::regprocedure]) p;

DO $apply$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.expense_decide(uuid,text,text)'::regprocedure);
  d := replace(d, 'payment_status=''aguardando_pagamento'',',
                  'payment_status = NULL, -- SUP-331: aprovada; o gestor muda depois para aguarda pagamento / paga');
  EXECUTE d;

  d := pg_get_functiondef('public.expense_mark_payment(uuid,text)'::regprocedure);
  d := replace(d, 'IF _payment_status NOT IN (''aguardando_pagamento'', ''paga'') THEN',
                  'IF _payment_status NOT IN (''aprovada'', ''aguardando_pagamento'', ''paga'') THEN -- SUP-331');
  d := replace(d, 'SET payment_status = _payment_status,',
                  'SET payment_status = NULLIF(_payment_status, ''aprovada''), -- SUP-331: aprovada = NULL');
  EXECUTE d;

  d := pg_get_functiondef('public._expenses_activity_audit()'::regprocedure);
  d := replace(d, 'COALESCE(v_status ->> NEW.payment_status, NEW.payment_status, ''sem estado'')',
                  'COALESCE(v_status ->> NEW.payment_status, NEW.payment_status, ''aprovada'')');
  d := replace(d, 'COALESCE(v_status ->> OLD.payment_status, OLD.payment_status)',
                  'COALESCE(v_status ->> OLD.payment_status, OLD.payment_status, ''aprovada'')');
  d := replace(d, '''para'', COALESCE(v_status ->> NEW.payment_status, NEW.payment_status))',
                  '''para'', COALESCE(v_status ->> NEW.payment_status, NEW.payment_status, ''aprovada''))');
  EXECUTE d;
END
$apply$;

COMMIT;

SELECT jsonb_build_object(
  'aprovar_deixa_aprovada', position('payment_status = NULL, -- SUP-331' IN pg_get_functiondef('public.expense_decide(uuid,text,text)'::regprocedure)) > 0,
  'historico_mostra_aprovada', position('NEW.payment_status, ''aprovada'')' IN pg_get_functiondef('public._expenses_activity_audit()'::regprocedure)) > 0,
  'marcar_aceita_aprovada', position('''aprovada'', ''aguardando_pagamento'', ''paga''' IN pg_get_functiondef('public.expense_mark_payment(uuid,text)'::regprocedure)) > 0,
  'despesas_aprovadas_por_estado', (SELECT jsonb_object_agg(coalesce(payment_status, 'aprovada'), n)
     FROM (SELECT payment_status, count(*) n FROM public.employee_expenses WHERE status = 'aprovada' GROUP BY 1) x)
)::text AS resultado;
