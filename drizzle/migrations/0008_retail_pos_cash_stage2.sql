-- ETAPA 2: VERTICAL LOJAS (RETAIL) — CAIXA E PDV
-- Aditiva e IDEMPOTENTE (pode ser executada mais de uma vez sem erro): não altera tabelas nem regras fora do retail. Toda a escrita passa por RPC
-- SECURITY DEFINER; o frontend só lê (RLS por empresa, módulo e loja).

-- 1. Limite de desconto por loja (funcionário). Gestor/owner/super admin não têm limite.
ALTER TABLE public.company_units
  ADD COLUMN IF NOT EXISTS max_discount_pct numeric(5,2) NOT NULL DEFAULT 10
  CHECK (max_discount_pct >= 0 AND max_discount_pct <= 100);
COMMENT ON COLUMN public.company_units.max_discount_pct IS 'Desconto máximo (% do subtotal) que um funcionário pode dar no PDV desta loja.';

-- 2. Movimentos de estoque: novos tipos ligados a vendas
ALTER TABLE public.retail_stock_movements DROP CONSTRAINT IF EXISTS retail_stock_movements_kind_check;
ALTER TABLE public.retail_stock_movements ADD CONSTRAINT retail_stock_movements_kind_check
  CHECK (kind IN ('entrada','saida','transferencia_saida','transferencia_entrada','ajuste','venda','cancelamento_venda'));
ALTER TABLE public.retail_stock_movements ADD COLUMN IF NOT EXISTS sale_id uuid;
CREATE INDEX IF NOT EXISTS idx_retail_stock_movements_sale ON public.retail_stock_movements(sale_id);

-- 3. Sessões de caixa (uma aberta por loja)
CREATE TABLE IF NOT EXISTS public.retail_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE NO ACTION,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada')),
  opening_amount numeric(12,2) NOT NULL CHECK (opening_amount >= 0),
  opened_by uuid REFERENCES public.profiles(id) ON DELETE NO ACTION,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES public.profiles(id) ON DELETE NO ACTION,
  closed_at timestamptz,
  expected_cash numeric(12,2),
  counted_cash numeric(12,2) CHECK (counted_cash IS NULL OR counted_cash >= 0),
  difference numeric(12,2),
  totals jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retail_cash_sessions_closed_fields CHECK (
    (status = 'aberta' AND closed_at IS NULL) OR (status = 'fechada' AND closed_at IS NOT NULL AND counted_cash IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_retail_cash_sessions_one_open ON public.retail_cash_sessions(unit_id) WHERE status = 'aberta';
CREATE INDEX IF NOT EXISTS idx_retail_cash_sessions_company_opened ON public.retail_cash_sessions(company_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_retail_cash_sessions_unit ON public.retail_cash_sessions(unit_id, opened_at DESC);
GRANT SELECT ON public.retail_cash_sessions TO authenticated;
GRANT ALL ON public.retail_cash_sessions TO service_role;
CREATE OR REPLACE TRIGGER trg_retail_cash_sessions_updated BEFORE UPDATE ON public.retail_cash_sessions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Sangrias e suprimentos (imutáveis)
CREATE TABLE IF NOT EXISTS public.retail_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE NO ACTION,
  session_id uuid NOT NULL REFERENCES public.retail_cash_sessions(id) ON DELETE NO ACTION,
  kind text NOT NULL CHECK (kind IN ('sangria','suprimento')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  user_id uuid REFERENCES public.profiles(id) ON DELETE NO ACTION,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_retail_cash_movements_idempotency ON public.retail_cash_movements(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retail_cash_movements_session ON public.retail_cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_retail_cash_movements_company ON public.retail_cash_movements(company_id, created_at DESC);
GRANT SELECT ON public.retail_cash_movements TO authenticated;
GRANT ALL ON public.retail_cash_movements TO service_role;

-- 5. Numeração de vendas por loja e ano (não fiscal)
CREATE TABLE IF NOT EXISTS public.retail_unit_counters (
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE CASCADE,
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (unit_id, year)
);
GRANT ALL ON public.retail_unit_counters TO service_role;
-- authenticated não tem acesso: só a RPC lê/escreve.

-- 6. Vendas
CREATE TABLE IF NOT EXISTS public.retail_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE NO ACTION,
  session_id uuid NOT NULL REFERENCES public.retail_cash_sessions(id) ON DELETE NO ACTION,
  year int NOT NULL,
  number int NOT NULL CHECK (number > 0),
  code text NOT NULL,
  seller_id uuid REFERENCES public.profiles(id) ON DELETE NO ACTION,
  customer_name text, customer_phone text, customer_email text, customer_tax_id text,
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  paid_total numeric(12,2) NOT NULL CHECK (paid_total >= 0),
  change_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
  status text NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida','cancelada')),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE NO ACTION,
  cancel_reason text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retail_sales_totals CHECK (total = subtotal - discount AND discount <= subtotal),
  CONSTRAINT retail_sales_paid CHECK (paid_total - change_amount = total),
  CONSTRAINT retail_sales_cancel_fields CHECK (
    (status = 'concluida' AND cancelled_at IS NULL) OR (status = 'cancelada' AND cancelled_at IS NOT NULL AND length(trim(COALESCE(cancel_reason,''))) > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_retail_sales_unit_year_number ON public.retail_sales(unit_id, year, number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_retail_sales_idempotency ON public.retail_sales(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retail_sales_company_created ON public.retail_sales(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retail_sales_unit_created ON public.retail_sales(unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retail_sales_session ON public.retail_sales(session_id);
CREATE INDEX IF NOT EXISTS idx_retail_sales_seller ON public.retail_sales(seller_id);
GRANT SELECT ON public.retail_sales TO authenticated;
GRANT ALL ON public.retail_sales TO service_role;
CREATE OR REPLACE TRIGGER trg_retail_sales_updated BEFORE UPDATE ON public.retail_sales
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.retail_stock_movements DROP CONSTRAINT IF EXISTS retail_stock_movements_sale_fk;
ALTER TABLE public.retail_stock_movements
  ADD CONSTRAINT retail_stock_movements_sale_fk FOREIGN KEY (sale_id) REFERENCES public.retail_sales(id) ON DELETE NO ACTION;

CREATE TABLE IF NOT EXISTS public.retail_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE NO ACTION,
  sale_id uuid NOT NULL REFERENCES public.retail_sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.retail_products(id) ON DELETE NO ACTION,
  product_name text NOT NULL,
  product_unit text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX IF NOT EXISTS idx_retail_sale_items_sale ON public.retail_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_retail_sale_items_product ON public.retail_sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_retail_sale_items_company ON public.retail_sale_items(company_id);
GRANT SELECT ON public.retail_sale_items TO authenticated;
GRANT ALL ON public.retail_sale_items TO service_role;

CREATE TABLE IF NOT EXISTS public.retail_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE NO ACTION,
  sale_id uuid NOT NULL REFERENCES public.retail_sales(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('dinheiro','cartao_debito','cartao_credito','pix','mbway','multibanco','transferencia','outro')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_retail_sale_payments_sale ON public.retail_sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_retail_sale_payments_company ON public.retail_sale_payments(company_id);
GRANT SELECT ON public.retail_sale_payments TO authenticated;
GRANT ALL ON public.retail_sale_payments TO service_role;

-- 7. Imutabilidade: itens, pagamentos e movimentos de caixa nunca mudam;
--    vendas só mudam pela RPC de cancelamento (status/cancel*). Exclusão só na cascata da empresa.
CREATE OR REPLACE FUNCTION public.trg_retail_immutable_rows()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Registo imutável (%).', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
    RAISE EXCEPTION 'Registo imutável (%): exclusão proibida.', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;
CREATE OR REPLACE TRIGGER trg_retail_sale_items_immutable BEFORE UPDATE OR DELETE ON public.retail_sale_items
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_immutable_rows();
CREATE OR REPLACE TRIGGER trg_retail_sale_payments_immutable BEFORE UPDATE OR DELETE ON public.retail_sale_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_immutable_rows();
CREATE OR REPLACE TRIGGER trg_retail_cash_movements_immutable BEFORE UPDATE OR DELETE ON public.retail_cash_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_immutable_rows();

CREATE OR REPLACE FUNCTION public.trg_retail_sales_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION 'Vendas não podem ser excluídas; use o cancelamento.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: só a passagem concluida -> cancelada, sem tocar em valores, números ou loja.
  IF OLD.status <> 'concluida' OR NEW.status <> 'cancelada'
     OR NEW.company_id <> OLD.company_id OR NEW.unit_id <> OLD.unit_id OR NEW.session_id <> OLD.session_id
     OR NEW.number <> OLD.number OR NEW.year <> OLD.year OR NEW.code <> OLD.code
     OR NEW.subtotal <> OLD.subtotal OR NEW.discount <> OLD.discount OR NEW.total <> OLD.total
     OR NEW.paid_total <> OLD.paid_total OR NEW.change_amount <> OLD.change_amount
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Venda imutável: só é permitido o cancelamento.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_retail_sales_guard BEFORE UPDATE OR DELETE ON public.retail_sales
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_sales_guard();

-- 8. Integridade entre empresas (defesa extra além das RPCs)
CREATE OR REPLACE FUNCTION public.trg_retail_unit_company_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_u uuid;
BEGIN
  SELECT company_id INTO v_u FROM public.company_units WHERE id = NEW.unit_id;
  IF v_u IS NULL OR v_u <> NEW.company_id THEN
    RAISE EXCEPTION 'A loja pertence a outra empresa ou não existe (%).', TG_TABLE_NAME USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_retail_cash_sessions_company BEFORE INSERT ON public.retail_cash_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_unit_company_check();
CREATE OR REPLACE TRIGGER trg_retail_cash_movements_company BEFORE INSERT ON public.retail_cash_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_unit_company_check();
CREATE OR REPLACE TRIGGER trg_retail_sales_company BEFORE INSERT ON public.retail_sales
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_unit_company_check();
CREATE OR REPLACE TRIGGER trg_retail_sale_items_company BEFORE INSERT ON public.retail_sale_items
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_unit_company_check();
CREATE OR REPLACE TRIGGER trg_retail_sale_payments_company BEFORE INSERT ON public.retail_sale_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_unit_company_check();

-- 9. RLS: leitura por empresa + módulo; gestor vê todas as lojas, funcionário só as dele.
ALTER TABLE public.retail_cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_unit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retail_cash_sessions_select ON public.retail_cash_sessions;
CREATE POLICY retail_cash_sessions_select ON public.retail_cash_sessions FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_unit_member(auth.uid(), unit_id)))));
DROP POLICY IF EXISTS retail_cash_movements_select ON public.retail_cash_movements;
CREATE POLICY retail_cash_movements_select ON public.retail_cash_movements FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_unit_member(auth.uid(), unit_id)))));
DROP POLICY IF EXISTS retail_sales_select ON public.retail_sales;
CREATE POLICY retail_sales_select ON public.retail_sales FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_unit_member(auth.uid(), unit_id)))));
DROP POLICY IF EXISTS retail_sale_items_select ON public.retail_sale_items;
CREATE POLICY retail_sale_items_select ON public.retail_sale_items FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_unit_member(auth.uid(), unit_id)))));
DROP POLICY IF EXISTS retail_sale_payments_select ON public.retail_sale_payments;
CREATE POLICY retail_sale_payments_select ON public.retail_sale_payments FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_unit_member(auth.uid(), unit_id)))));
-- retail_unit_counters: sem política para authenticated (acesso só pelas RPCs).

-- 10. Helper de permissão para operar numa loja (gestor ou funcionário vinculado)
CREATE OR REPLACE FUNCTION public.retail_assert_unit_operator(_unit_id uuid, _require_active boolean DEFAULT false,
  OUT o_company_id uuid, OUT o_is_manager boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_active boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  SELECT u.company_id, u.active INTO o_company_id, v_active FROM public.company_units u WHERE u.id = _unit_id;
  IF o_company_id IS NULL THEN RAISE EXCEPTION 'Loja inválida' USING ERRCODE = '22023'; END IF;
  IF _require_active AND NOT v_active THEN RAISE EXCEPTION 'Loja inativa' USING ERRCODE = '22023'; END IF;
  IF public.is_super_admin(v_uid) THEN o_is_manager := true; RETURN; END IF;
  IF NOT public.company_module_enabled(o_company_id, 'retail_core') THEN
    RAISE EXCEPTION 'Módulo Lojas inativo para esta empresa' USING ERRCODE = '42501';
  END IF;
  o_is_manager := public.is_company_manager(v_uid, o_company_id);
  IF NOT o_is_manager AND NOT (public.is_company_member(v_uid, o_company_id) AND public.is_unit_member(v_uid, _unit_id)) THEN
    RAISE EXCEPTION 'Sem permissão para operar nesta loja' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.retail_assert_unit_operator(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- 11. Abrir caixa
CREATE OR REPLACE FUNCTION public.retail_cash_open(_unit_id uuid, _opening_amount numeric, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_mgr boolean; v_id uuid;
BEGIN
  SELECT a.o_company_id, a.o_is_manager INTO v_company, v_mgr FROM public.retail_assert_unit_operator(_unit_id, true) a;
  IF _opening_amount IS NULL OR _opening_amount < 0 THEN
    RAISE EXCEPTION 'O valor inicial deve ser 0 ou mais' USING ERRCODE = '22023';
  END IF;
  BEGIN
    INSERT INTO public.retail_cash_sessions (company_id, unit_id, opening_amount, opened_by, notes)
    VALUES (v_company, _unit_id, round(_opening_amount, 2), auth.uid(), NULLIF(trim(COALESCE(_notes,'')), ''))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um caixa aberto nesta loja' USING ERRCODE = '23505';
  END;
  RETURN jsonb_build_object('success', true, 'session_id', v_id);
END $$;

-- 12. Sangria / suprimento
CREATE OR REPLACE FUNCTION public.retail_cash_move(_session_id uuid, _kind text, _amount numeric, _reason text, _idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_s public.retail_cash_sessions%ROWTYPE; v_company uuid; v_mgr boolean; v_id uuid;
BEGIN
  SELECT * INTO v_s FROM public.retail_cash_sessions WHERE id = _session_id FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Caixa inexistente' USING ERRCODE = '22023'; END IF;
  SELECT a.o_company_id, a.o_is_manager INTO v_company, v_mgr FROM public.retail_assert_unit_operator(v_s.unit_id) a;
  IF v_s.status <> 'aberta' THEN RAISE EXCEPTION 'O caixa já está fechado' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('sangria','suprimento') THEN RAISE EXCEPTION 'Tipo inválido' USING ERRCODE = '22023'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'O valor deve ser maior que zero' USING ERRCODE = '22023'; END IF;
  IF trim(COALESCE(_reason,'')) = '' THEN RAISE EXCEPTION 'O motivo é obrigatório' USING ERRCODE = '22023'; END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.retail_cash_movements WHERE company_id = v_company AND idempotency_key = _idempotency_key;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'movement_id', v_id); END IF;
  END IF;
  BEGIN
    INSERT INTO public.retail_cash_movements (company_id, unit_id, session_id, kind, amount, reason, user_id, idempotency_key)
    VALUES (v_company, v_s.unit_id, v_s.id, _kind, round(_amount, 2), trim(_reason), auth.uid(), _idempotency_key)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id FROM public.retail_cash_movements WHERE company_id = v_company AND idempotency_key = _idempotency_key;
    IF v_id IS NULL THEN RAISE; END IF;
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'movement_id', v_id);
  END;
  RETURN jsonb_build_object('success', true, 'idempotent_replay', false, 'movement_id', v_id);
END $$;

-- 13. Totais de uma sessão (usado no fecho e na tela)
CREATE OR REPLACE FUNCTION public.retail_cash_session_totals(_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_s public.retail_cash_sessions%ROWTYPE; v_pay jsonb; v_sales int; v_total numeric; v_change numeric;
        v_cash numeric; v_sangria numeric; v_supr numeric; v_cancelled int;
BEGIN
  SELECT * INTO v_s FROM public.retail_cash_sessions WHERE id = _session_id;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Caixa inexistente' USING ERRCODE = '22023'; END IF;
  PERFORM public.retail_assert_unit_operator(v_s.unit_id);
  SELECT COALESCE(jsonb_object_agg(method, amt), '{}'::jsonb) INTO v_pay FROM (
    SELECT p.method, sum(p.amount) AS amt FROM public.retail_sale_payments p
    JOIN public.retail_sales s ON s.id = p.sale_id
    WHERE s.session_id = _session_id AND s.status = 'concluida' GROUP BY p.method) x;
  SELECT count(*) FILTER (WHERE status = 'concluida'), COALESCE(sum(total) FILTER (WHERE status = 'concluida'), 0),
         COALESCE(sum(change_amount) FILTER (WHERE status = 'concluida'), 0), count(*) FILTER (WHERE status = 'cancelada')
    INTO v_sales, v_total, v_change, v_cancelled
  FROM public.retail_sales WHERE session_id = _session_id;
  SELECT COALESCE(sum(amount) FILTER (WHERE kind = 'sangria'), 0), COALESCE(sum(amount) FILTER (WHERE kind = 'suprimento'), 0)
    INTO v_sangria, v_supr FROM public.retail_cash_movements WHERE session_id = _session_id;
  v_cash := v_s.opening_amount + COALESCE((v_pay->>'dinheiro')::numeric, 0) - v_change + v_supr - v_sangria;
  RETURN jsonb_build_object(
    'opening_amount', v_s.opening_amount, 'sales_count', v_sales, 'sales_total', v_total,
    'cancelled_count', v_cancelled, 'by_method', v_pay, 'change_total', v_change,
    'sangria_total', v_sangria, 'suprimento_total', v_supr, 'expected_cash', round(v_cash, 2));
END $$;

-- 14. Fechar caixa (conferência)
CREATE OR REPLACE FUNCTION public.retail_cash_close(_session_id uuid, _counted_cash numeric, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_s public.retail_cash_sessions%ROWTYPE; v_t jsonb; v_expected numeric;
BEGIN
  SELECT * INTO v_s FROM public.retail_cash_sessions WHERE id = _session_id FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Caixa inexistente' USING ERRCODE = '22023'; END IF;
  PERFORM public.retail_assert_unit_operator(v_s.unit_id);
  IF v_s.status <> 'aberta' THEN RAISE EXCEPTION 'O caixa já está fechado' USING ERRCODE = '22023'; END IF;
  IF _counted_cash IS NULL OR _counted_cash < 0 THEN RAISE EXCEPTION 'Informe o dinheiro contado (0 ou mais)' USING ERRCODE = '22023'; END IF;
  v_t := public.retail_cash_session_totals(_session_id);
  v_expected := (v_t->>'expected_cash')::numeric;
  UPDATE public.retail_cash_sessions SET
    status = 'fechada', closed_by = auth.uid(), closed_at = now(),
    expected_cash = v_expected, counted_cash = round(_counted_cash, 2),
    difference = round(_counted_cash, 2) - v_expected, totals = v_t,
    notes = COALESCE(NULLIF(trim(COALESCE(_notes,'')), ''), notes)
  WHERE id = _session_id;
  RETURN jsonb_build_object('success', true, 'expected_cash', v_expected, 'counted_cash', round(_counted_cash, 2),
    'difference', round(_counted_cash, 2) - v_expected, 'totals', v_t);
END $$;

-- 15. Registar venda (atómico: numeração, itens, pagamentos e baixa de estoque)
-- _items:    [{"product_id": uuid, "quantity": number}]  (preço vem SEMPRE do cadastro)
-- _payments: [{"method": text, "amount": number}]
-- _customer: {"name","phone","email","tax_id"} (opcional)
CREATE OR REPLACE FUNCTION public.retail_sale_create(
  _unit_id uuid, _items jsonb, _payments jsonb, _discount numeric DEFAULT 0,
  _customer jsonb DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid; v_mgr boolean; v_unit public.company_units%ROWTYPE;
  v_session uuid; v_existing uuid; v_tz text; v_year int; v_num int; v_sale uuid; v_code text;
  v_subtotal numeric(12,2) := 0; v_discount numeric(12,2); v_total numeric(12,2);
  v_paid numeric(12,2) := 0; v_cash numeric(12,2) := 0; v_change numeric(12,2);
  r record; v_bal numeric(12,3); v_items jsonb; v_n int; v_found int; v_badqty boolean;
BEGIN
  SELECT a.o_company_id, a.o_is_manager INTO v_company, v_mgr FROM public.retail_assert_unit_operator(_unit_id, true) a;
  SELECT * INTO v_unit FROM public.company_units WHERE id = _unit_id;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.retail_sales WHERE company_id = v_company AND idempotency_key = _idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'sale_id', v_existing);
    END IF;
  END IF;

  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE unit_id = _unit_id AND status = 'aberta' FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Abra o caixa desta loja antes de vender' USING ERRCODE = '22023'; END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A venda precisa de pelo menos um produto' USING ERRCODE = '22023';
  END IF;
  IF _payments IS NULL OR jsonb_typeof(_payments) <> 'array' OR jsonb_array_length(_payments) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos uma forma de pagamento' USING ERRCODE = '22023';
  END IF;

  -- Itens agregados por produto, com preço e nome do cadastro (o cliente não define preço).
  WITH x AS (
    SELECT (e->>'product_id')::uuid AS pid, sum((e->>'quantity')::numeric) AS q
    FROM jsonb_array_elements(_items) e GROUP BY 1
  )
  SELECT count(*), count(p.id), COALESCE(bool_or(x.q IS NULL OR x.q <= 0), true),
         jsonb_agg(jsonb_build_object('product_id', p.id, 'quantity', x.q, 'name', p.name, 'unit', p.unit, 'price', p.price) ORDER BY p.id)
           FILTER (WHERE p.id IS NOT NULL)
    INTO v_n, v_found, v_badqty, v_items
  FROM x LEFT JOIN public.retail_products p ON p.id = x.pid AND p.company_id = v_company AND p.active;
  IF v_badqty THEN RAISE EXCEPTION 'Quantidades devem ser maiores que zero' USING ERRCODE = '22023'; END IF;
  IF v_found <> v_n THEN RAISE EXCEPTION 'Produto inválido, inativo ou de outra empresa' USING ERRCODE = '22023'; END IF;
  SELECT round(sum(round(i.quantity * i.price, 2)), 2) INTO v_subtotal
  FROM jsonb_to_recordset(v_items) AS i(product_id uuid, quantity numeric, name text, unit text, price numeric);

  v_discount := round(COALESCE(_discount, 0), 2);
  IF v_discount < 0 OR v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Desconto inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT v_mgr AND v_subtotal > 0 AND v_discount > round(v_subtotal * v_unit.max_discount_pct / 100, 2) THEN
    RAISE EXCEPTION 'Desconto acima do limite da loja (% %%). Peça a um gestor.', v_unit.max_discount_pct USING ERRCODE = '42501';
  END IF;
  v_total := v_subtotal - v_discount;

  -- Pagamentos
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_payments) e
             WHERE (e->>'method') NOT IN ('dinheiro','cartao_debito','cartao_credito','pix','mbway','multibanco','transferencia','outro')
                OR (e->>'amount')::numeric IS NULL OR (e->>'amount')::numeric <= 0) THEN
    RAISE EXCEPTION 'Forma de pagamento ou valor inválido' USING ERRCODE = '22023';
  END IF;
  SELECT round(sum((e->>'amount')::numeric), 2), round(COALESCE(sum((e->>'amount')::numeric) FILTER (WHERE e->>'method' = 'dinheiro'), 0), 2)
    INTO v_paid, v_cash FROM jsonb_array_elements(_payments) e;
  IF v_paid < v_total THEN
    RAISE EXCEPTION 'Pagamento insuficiente (total: %, pago: %)', v_total, v_paid USING ERRCODE = '22023';
  END IF;
  v_change := v_paid - v_total;
  IF v_change > v_cash THEN
    RAISE EXCEPTION 'Troco só pode sair do pagamento em dinheiro' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(c.timezone, ''), 'Europe/Lisbon') INTO v_tz FROM public.companies c WHERE c.id = v_company;
  v_year := extract(year FROM (now() AT TIME ZONE v_tz))::int;

  BEGIN
    INSERT INTO public.retail_unit_counters (unit_id, year, last_number) VALUES (_unit_id, v_year, 0)
    ON CONFLICT (unit_id, year) DO NOTHING;
    UPDATE public.retail_unit_counters SET last_number = last_number + 1
    WHERE unit_id = _unit_id AND year = v_year RETURNING last_number INTO v_num;
    v_code := v_unit.code || '-' || v_year || '-' || lpad(v_num::text, 6, '0');

    INSERT INTO public.retail_sales (company_id, unit_id, session_id, year, number, code, seller_id,
      customer_name, customer_phone, customer_email, customer_tax_id,
      subtotal, discount, total, paid_total, change_amount, idempotency_key)
    VALUES (v_company, _unit_id, v_session, v_year, v_num, v_code, v_uid,
      NULLIF(trim(_customer->>'name'), ''), NULLIF(trim(_customer->>'phone'), ''),
      NULLIF(trim(_customer->>'email'), ''), NULLIF(trim(_customer->>'tax_id'), ''),
      v_subtotal, v_discount, v_total, v_paid, v_change, _idempotency_key)
    RETURNING id INTO v_sale;

    INSERT INTO public.retail_sale_items (company_id, unit_id, sale_id, product_id, product_name, product_unit, quantity, unit_price, line_total)
    SELECT v_company, _unit_id, v_sale, i.product_id, i.name, i.unit, i.quantity, i.price, round(i.quantity * i.price, 2)
    FROM jsonb_to_recordset(v_items) AS i(product_id uuid, quantity numeric, name text, unit text, price numeric);

    INSERT INTO public.retail_sale_payments (company_id, unit_id, sale_id, method, amount)
    SELECT v_company, _unit_id, v_sale, e->>'method', round((e->>'amount')::numeric, 2) FROM jsonb_array_elements(_payments) e;

    -- Baixa de estoque: locks em ordem de product_id (evita deadlock entre vendas simultâneas).
    FOR r IN SELECT i.* FROM jsonb_to_recordset(v_items) AS i(product_id uuid, quantity numeric, name text, unit text, price numeric) ORDER BY i.product_id LOOP
      INSERT INTO public.retail_stock_balances (company_id, unit_id, product_id, quantity)
      VALUES (v_company, _unit_id, r.product_id, 0) ON CONFLICT (unit_id, product_id) DO NOTHING;
      SELECT quantity INTO v_bal FROM public.retail_stock_balances WHERE unit_id = _unit_id AND product_id = r.product_id FOR UPDATE;
      IF v_bal < r.quantity THEN
        RAISE EXCEPTION 'Estoque insuficiente de % (disponível: %, pedido: %)', r.name, v_bal, r.quantity USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.retail_stock_movements (company_id, unit_id, product_id, kind, quantity, balance_after, reason, sale_id, user_id)
      VALUES (v_company, _unit_id, r.product_id, 'venda', r.quantity, v_bal - r.quantity, 'Venda ' || v_code, v_sale, v_uid);
      UPDATE public.retail_stock_balances SET quantity = v_bal - r.quantity WHERE unit_id = _unit_id AND product_id = r.product_id;
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    -- Pedido repetido em paralelo: tudo neste bloco (contador, venda, estoque) é revertido.
    IF _idempotency_key IS NULL THEN RAISE; END IF;
    SELECT id INTO v_existing FROM public.retail_sales WHERE company_id = v_company AND idempotency_key = _idempotency_key;
    IF v_existing IS NULL THEN RAISE; END IF;
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'sale_id', v_existing);
  END;

  RETURN jsonb_build_object('success', true, 'idempotent_replay', false, 'sale_id', v_sale, 'code', v_code,
    'subtotal', v_subtotal, 'discount', v_discount, 'total', v_total, 'paid_total', v_paid, 'change_amount', v_change);
END $$;

-- 16. Cancelar venda (só gestor/owner/super admin; só com o caixa da venda ainda aberto)
CREATE OR REPLACE FUNCTION public.retail_sale_cancel(_sale_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_s public.retail_sales%ROWTYPE; v_company uuid; v_mgr boolean; v_status text; r record; v_bal numeric(12,3);
BEGIN
  SELECT * INTO v_s FROM public.retail_sales WHERE id = _sale_id FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Venda inexistente' USING ERRCODE = '22023'; END IF;
  SELECT a.o_company_id, a.o_is_manager INTO v_company, v_mgr FROM public.retail_assert_unit_operator(v_s.unit_id) a;
  IF NOT v_mgr THEN RAISE EXCEPTION 'Só gestores podem cancelar vendas' USING ERRCODE = '42501'; END IF;
  IF v_s.status = 'cancelada' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'sale_id', v_s.id);
  END IF;
  IF trim(COALESCE(_reason,'')) = '' THEN RAISE EXCEPTION 'O motivo do cancelamento é obrigatório' USING ERRCODE = '22023'; END IF;
  SELECT status INTO v_status FROM public.retail_cash_sessions WHERE id = v_s.session_id FOR UPDATE;
  IF v_status <> 'aberta' THEN
    RAISE EXCEPTION 'O caixa desta venda já foi fechado; o cancelamento não é permitido nesta etapa' USING ERRCODE = '22023';
  END IF;

  FOR r IN SELECT product_id, quantity, product_name FROM public.retail_sale_items WHERE sale_id = v_s.id ORDER BY product_id LOOP
    SELECT quantity INTO v_bal FROM public.retail_stock_balances WHERE unit_id = v_s.unit_id AND product_id = r.product_id FOR UPDATE;
    INSERT INTO public.retail_stock_movements (company_id, unit_id, product_id, kind, quantity, balance_after, reason, sale_id, user_id)
    VALUES (v_s.company_id, v_s.unit_id, r.product_id, 'cancelamento_venda', r.quantity, COALESCE(v_bal, 0) + r.quantity,
            'Cancelamento ' || v_s.code || ': ' || trim(_reason), v_s.id, auth.uid());
    UPDATE public.retail_stock_balances SET quantity = quantity + r.quantity WHERE unit_id = v_s.unit_id AND product_id = r.product_id;
  END LOOP;

  UPDATE public.retail_sales SET status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(_reason)
  WHERE id = v_s.id;
  RETURN jsonb_build_object('success', true, 'already_cancelled', false, 'sale_id', v_s.id);
END $$;

REVOKE ALL ON FUNCTION public.retail_cash_open(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retail_cash_move(uuid, text, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retail_cash_session_totals(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retail_cash_close(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retail_sale_create(uuid, jsonb, jsonb, numeric, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retail_sale_cancel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_cash_open(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retail_cash_move(uuid, text, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retail_cash_session_totals(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retail_cash_close(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retail_sale_create(uuid, jsonb, jsonb, numeric, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retail_sale_cancel(uuid, text) TO authenticated, service_role;
