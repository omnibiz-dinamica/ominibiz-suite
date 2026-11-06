-- ETAPA 1: VERTICAL LOJAS (RETAIL)
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_business_vertical_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_business_vertical_check
  CHECK (business_vertical = ANY (ARRAY['cleaning_services'::text,'restaurant_delivery'::text,'generic'::text,'building_materials'::text,'hospitality'::text,'auto_repair'::text,'retail'::text]));

-- Lojas
CREATE TABLE public.company_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  legal_name text, tax_id text, address text, city text, postal_code text,
  country text, phone text, email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_units_company_code UNIQUE (company_id, code)
);
CREATE INDEX idx_company_units_company ON public.company_units(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_units TO authenticated;
GRANT ALL ON public.company_units TO service_role;

CREATE OR REPLACE FUNCTION public.trg_company_units_set_country()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR trim(NEW.country) = '' THEN
    SELECT COALESCE(NULLIF(country,''), NULLIF(billing_country,''), 'PT') INTO NEW.country
    FROM public.companies WHERE id = NEW.company_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_company_units_country BEFORE INSERT ON public.company_units
FOR EACH ROW EXECUTE FUNCTION public.trg_company_units_set_country();
CREATE TRIGGER trg_company_units_updated BEFORE UPDATE ON public.company_units
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Vínculos usuário-loja
CREATE TABLE public.user_unit_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_unit_assignments UNIQUE (user_id, unit_id)
);
CREATE INDEX idx_user_unit_assignments_company ON public.user_unit_assignments(company_id);
CREATE INDEX idx_user_unit_assignments_unit ON public.user_unit_assignments(unit_id);
CREATE INDEX idx_user_unit_assignments_user ON public.user_unit_assignments(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_unit_assignments TO authenticated;
GRANT ALL ON public.user_unit_assignments TO service_role;

CREATE OR REPLACE FUNCTION public.trg_user_unit_assignments_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_unit_company uuid; v_ok boolean;
BEGIN
  SELECT company_id INTO v_unit_company FROM public.company_units WHERE id = NEW.unit_id;
  IF v_unit_company IS NULL OR v_unit_company <> NEW.company_id THEN
    RAISE EXCEPTION 'A loja informada pertence a outra empresa ou não existe' USING ERRCODE = '23503';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = NEW.user_id AND ur.company_id = NEW.company_id
      AND COALESCE(p.is_active, true) = true
      AND lower(COALESCE(p.status, 'ativo')) NOT IN ('inativo','inactive')
      AND (p.termination_date IS NULL OR p.termination_date > CURRENT_DATE)
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'O usuário informado não é membro ativo desta empresa' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_user_unit_assignments_validate BEFORE INSERT OR UPDATE ON public.user_unit_assignments
FOR EACH ROW EXECUTE FUNCTION public.trg_user_unit_assignments_validate();
CREATE TRIGGER trg_user_unit_assignments_updated BEFORE UPDATE ON public.user_unit_assignments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Categorias
CREATE TABLE public.retail_product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_retail_categories_company_name ON public.retail_product_categories(company_id, lower(name));
CREATE INDEX idx_retail_categories_company ON public.retail_product_categories(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_product_categories TO authenticated;
GRANT ALL ON public.retail_product_categories TO service_role;
CREATE TRIGGER trg_retail_categories_updated BEFORE UPDATE ON public.retail_product_categories
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Produtos
CREATE TABLE public.retail_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.retail_product_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  sku text, barcode text,
  unit text NOT NULL DEFAULT 'un',
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost numeric(12,2) CHECK (cost IS NULL OR cost >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_retail_products_company_sku ON public.retail_products(company_id, lower(sku)) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX uq_retail_products_company_barcode ON public.retail_products(company_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_retail_products_company ON public.retail_products(company_id);
CREATE INDEX idx_retail_products_category ON public.retail_products(category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_products TO authenticated;
GRANT ALL ON public.retail_products TO service_role;

CREATE OR REPLACE FUNCTION public.trg_retail_products_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_cat uuid;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT company_id INTO v_cat FROM public.retail_product_categories WHERE id = NEW.category_id;
    IF v_cat IS NULL OR v_cat <> NEW.company_id THEN
      RAISE EXCEPTION 'A categoria pertence a outra empresa ou não existe' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_retail_products_validate BEFORE INSERT OR UPDATE ON public.retail_products
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_products_validate();
CREATE TRIGGER trg_retail_products_updated BEFORE UPDATE ON public.retail_products
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Saldos (Correção A: NO ACTION)
CREATE TABLE public.retail_stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE NO ACTION,
  product_id uuid NOT NULL REFERENCES public.retail_products(id) ON DELETE NO ACTION,
  quantity numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_retail_stock_balance UNIQUE (unit_id, product_id)
);
CREATE INDEX idx_retail_stock_balances_company ON public.retail_stock_balances(company_id);
CREATE INDEX idx_retail_stock_balances_product ON public.retail_stock_balances(product_id);
GRANT SELECT ON public.retail_stock_balances TO authenticated;
GRANT ALL ON public.retail_stock_balances TO service_role;

CREATE OR REPLACE FUNCTION public.trg_retail_stock_balances_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_u uuid; v_p uuid;
BEGIN
  SELECT company_id INTO v_u FROM public.company_units WHERE id = NEW.unit_id;
  IF v_u IS NULL OR v_u <> NEW.company_id THEN
    RAISE EXCEPTION 'A loja do saldo pertence a outra empresa ou não existe' USING ERRCODE = '23503';
  END IF;
  SELECT company_id INTO v_p FROM public.retail_products WHERE id = NEW.product_id;
  IF v_p IS NULL OR v_p <> NEW.company_id THEN
    RAISE EXCEPTION 'O produto do saldo pertence a outra empresa ou não existe' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_retail_stock_balances_validate BEFORE INSERT OR UPDATE OF company_id, unit_id, product_id ON public.retail_stock_balances
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_stock_balances_validate();
CREATE TRIGGER trg_retail_stock_balances_updated BEFORE UPDATE ON public.retail_stock_balances
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Movimentos (imutáveis; Correção A: NO ACTION)
CREATE TABLE public.retail_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.company_units(id) ON DELETE NO ACTION,
  product_id uuid NOT NULL REFERENCES public.retail_products(id) ON DELETE NO ACTION,
  kind text NOT NULL CHECK (kind IN ('entrada','saida','transferencia_saida','transferencia_entrada','ajuste')),
  quantity numeric(12,3) NOT NULL,
  balance_after numeric(12,3),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  related_unit_id uuid REFERENCES public.company_units(id) ON DELETE NO ACTION,
  transfer_group_id uuid,
  idempotency_key text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retail_stock_movements_quantity_check CHECK (quantity > 0 OR (kind = 'ajuste' AND quantity >= 0))
);
COMMENT ON COLUMN public.retail_stock_movements.quantity IS 'Quantidade movimentada (valor absoluto). Em ajuste: |novo saldo - saldo anterior|; balance_after guarda o novo saldo.';
CREATE UNIQUE INDEX uq_retail_stock_movements_idempotency ON public.retail_stock_movements(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_retail_stock_movements_company_created ON public.retail_stock_movements(company_id, created_at DESC);
CREATE INDEX idx_retail_stock_movements_unit ON public.retail_stock_movements(unit_id);
CREATE INDEX idx_retail_stock_movements_product ON public.retail_stock_movements(product_id);
CREATE INDEX idx_retail_stock_movements_related ON public.retail_stock_movements(related_unit_id);
CREATE INDEX idx_retail_stock_movements_user ON public.retail_stock_movements(user_id);
CREATE INDEX idx_retail_stock_movements_transfer ON public.retail_stock_movements(transfer_group_id);
GRANT SELECT ON public.retail_stock_movements TO authenticated;
GRANT ALL ON public.retail_stock_movements TO service_role;

CREATE OR REPLACE FUNCTION public.trg_retail_stock_movements_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_u uuid; v_p uuid; v_r uuid;
BEGIN
  SELECT company_id INTO v_u FROM public.company_units WHERE id = NEW.unit_id;
  IF v_u IS NULL OR v_u <> NEW.company_id THEN
    RAISE EXCEPTION 'A loja do movimento pertence a outra empresa ou não existe' USING ERRCODE = '23503';
  END IF;
  SELECT company_id INTO v_p FROM public.retail_products WHERE id = NEW.product_id;
  IF v_p IS NULL OR v_p <> NEW.company_id THEN
    RAISE EXCEPTION 'O produto do movimento pertence a outra empresa ou não existe' USING ERRCODE = '23503';
  END IF;
  IF NEW.related_unit_id IS NOT NULL THEN
    SELECT company_id INTO v_r FROM public.company_units WHERE id = NEW.related_unit_id;
    IF v_r IS NULL OR v_r <> NEW.company_id THEN
      RAISE EXCEPTION 'A loja relacionada pertence a outra empresa ou não existe' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_retail_stock_movements_validate BEFORE INSERT ON public.retail_stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_retail_stock_movements_validate();

CREATE OR REPLACE FUNCTION public.trg_prevent_retail_stock_movements_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Histórico de estoque é imutável (alteração proibida)' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
    RAISE EXCEPTION 'Histórico de estoque é imutável (exclusão proibida)' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER trg_retail_stock_movements_immutable BEFORE UPDATE OR DELETE ON public.retail_stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_retail_stock_movements_mutation();

-- Helper
CREATE OR REPLACE FUNCTION public.is_unit_member(_user_id uuid, _unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_unit_assignments WHERE user_id = _user_id AND unit_id = _unit_id);
$$;

-- RLS
ALTER TABLE public.company_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_unit_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY retail_categories_select ON public.retail_product_categories FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_member(auth.uid(), company_id)));
CREATE POLICY retail_categories_write ON public.retail_product_categories FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_manager(auth.uid(), company_id)))
WITH CHECK (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_manager(auth.uid(), company_id)));

CREATE POLICY retail_products_select ON public.retail_products FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_member(auth.uid(), company_id)));
CREATE POLICY retail_products_write ON public.retail_products FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_manager(auth.uid(), company_id)))
WITH CHECK (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_manager(auth.uid(), company_id)));

CREATE POLICY company_units_select ON public.company_units FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_unit_member(auth.uid(), id)))));
CREATE POLICY company_units_write ON public.company_units FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_manager(auth.uid(), company_id)))
WITH CHECK (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_manager(auth.uid(), company_id)));

CREATE POLICY user_unit_assignments_select ON public.user_unit_assignments FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id)))));
CREATE POLICY user_unit_assignments_write ON public.user_unit_assignments FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_manager(auth.uid(), company_id)))
WITH CHECK (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND public.is_company_manager(auth.uid(), company_id)));

CREATE POLICY retail_stock_balances_select ON public.retail_stock_balances FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_unit_member(auth.uid(), unit_id)))));

CREATE POLICY retail_stock_movements_select ON public.retail_stock_movements FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR (public.company_module_enabled(company_id,'retail_core') AND (
  public.is_company_manager(auth.uid(), company_id)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_unit_member(auth.uid(), unit_id)))));

-- RPC (Correção B: INSERT do movimento antes do UPDATE de saldo, no mesmo bloco protegido)
CREATE OR REPLACE FUNCTION public.retail_stock_move(
  _unit_id uuid, _product_id uuid, _kind text, _quantity numeric, _reason text,
  _related_unit_id uuid DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid; v_dest_company uuid;
  v_is_manager boolean := false;
  v_active boolean;
  v_cur numeric(12,3) := 0; v_new numeric(12,3);
  v_group uuid; v_mov uuid; v_existing uuid;
  v_l1 uuid; v_l2 uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  IF _kind NOT IN ('entrada','saida','ajuste','transferencia') THEN
    RAISE EXCEPTION 'Tipo de movimento inválido: %', _kind USING ERRCODE = '22023';
  END IF;
  IF _kind = 'ajuste' THEN
    IF _quantity IS NULL OR _quantity < 0 THEN RAISE EXCEPTION 'No ajuste, o novo saldo deve ser maior ou igual a zero' USING ERRCODE = '22023'; END IF;
  ELSIF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'A quantidade deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  IF trim(COALESCE(_reason,'')) = '' THEN RAISE EXCEPTION 'O motivo é obrigatório' USING ERRCODE = '22023'; END IF;

  SELECT company_id INTO v_company FROM public.company_units WHERE id = _unit_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Loja inválida' USING ERRCODE = '22023'; END IF;

  IF NOT public.is_super_admin(v_uid) THEN
    IF NOT public.company_module_enabled(v_company, 'retail_core') THEN
      RAISE EXCEPTION 'Módulo Lojas inativo para esta empresa' USING ERRCODE = '42501';
    END IF;
    v_is_manager := public.is_company_manager(v_uid, v_company);
    IF NOT v_is_manager THEN
      IF NOT public.is_company_member(v_uid, v_company) OR NOT public.is_unit_member(v_uid, _unit_id) THEN
        RAISE EXCEPTION 'Sem permissão para operar nesta loja' USING ERRCODE = '42501';
      END IF;
      IF _kind <> 'entrada' THEN
        RAISE EXCEPTION 'Funcionários só podem registar entradas de estoque' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Idempotência (por empresa, depois das permissões)
  IF _idempotency_key IS NOT NULL THEN
    SELECT id, transfer_group_id INTO v_existing, v_group FROM public.retail_stock_movements
    WHERE company_id = v_company AND idempotency_key = _idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'movement_id', v_existing, 'transfer_group_id', v_group);
    END IF;
  END IF;

  SELECT active INTO v_active FROM public.retail_products WHERE id = _product_id AND company_id = v_company;
  IF v_active IS NULL THEN RAISE EXCEPTION 'Produto inválido ou de outra empresa' USING ERRCODE = '22023'; END IF;
  IF NOT v_active AND _kind IN ('entrada','transferencia') THEN
    RAISE EXCEPTION 'Produto inativo: entrada e transferência não são permitidas' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.retail_stock_balances (company_id, unit_id, product_id, quantity)
  VALUES (v_company, _unit_id, _product_id, 0) ON CONFLICT (unit_id, product_id) DO NOTHING;

  IF _kind = 'transferencia' THEN
    IF _related_unit_id IS NULL THEN RAISE EXCEPTION 'Loja de destino obrigatória' USING ERRCODE = '22023'; END IF;
    IF _related_unit_id = _unit_id THEN RAISE EXCEPTION 'A loja de destino não pode ser a de origem' USING ERRCODE = '22023'; END IF;
    SELECT company_id INTO v_dest_company FROM public.company_units WHERE id = _related_unit_id;
    IF v_dest_company IS NULL OR v_dest_company <> v_company THEN
      RAISE EXCEPTION 'A loja de destino deve ser da mesma empresa' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.retail_stock_balances (company_id, unit_id, product_id, quantity)
    VALUES (v_company, _related_unit_id, _product_id, 0) ON CONFLICT (unit_id, product_id) DO NOTHING;

    IF _unit_id < _related_unit_id THEN v_l1 := _unit_id; v_l2 := _related_unit_id;
    ELSE v_l1 := _related_unit_id; v_l2 := _unit_id; END IF;
    PERFORM 1 FROM public.retail_stock_balances WHERE unit_id = v_l1 AND product_id = _product_id FOR UPDATE;
    PERFORM 1 FROM public.retail_stock_balances WHERE unit_id = v_l2 AND product_id = _product_id FOR UPDATE;

    SELECT quantity INTO v_cur FROM public.retail_stock_balances WHERE unit_id = _unit_id AND product_id = _product_id;
    IF v_cur < _quantity THEN
      RAISE EXCEPTION 'Saldo insuficiente (atual: %, pedido: %)', v_cur, _quantity USING ERRCODE = '23514';
    END IF;
    v_group := gen_random_uuid();

    BEGIN
      INSERT INTO public.retail_stock_movements (company_id, unit_id, product_id, kind, quantity, balance_after, reason, related_unit_id, transfer_group_id, idempotency_key, user_id)
      VALUES (v_company, _unit_id, _product_id, 'transferencia_saida', _quantity, v_cur - _quantity, _reason, _related_unit_id, v_group, _idempotency_key, v_uid)
      RETURNING id INTO v_mov;
      INSERT INTO public.retail_stock_movements (company_id, unit_id, product_id, kind, quantity, balance_after, reason, related_unit_id, transfer_group_id, idempotency_key, user_id)
      SELECT v_company, _related_unit_id, _product_id, 'transferencia_entrada', _quantity, b.quantity + _quantity, _reason, _unit_id, v_group,
             CASE WHEN _idempotency_key IS NULL THEN NULL ELSE _idempotency_key || ':dest' END, v_uid
      FROM public.retail_stock_balances b WHERE b.unit_id = _related_unit_id AND b.product_id = _product_id;
      UPDATE public.retail_stock_balances SET quantity = quantity - _quantity WHERE unit_id = _unit_id AND product_id = _product_id;
      UPDATE public.retail_stock_balances SET quantity = quantity + _quantity WHERE unit_id = _related_unit_id AND product_id = _product_id;
    EXCEPTION WHEN unique_violation THEN
      IF _idempotency_key IS NULL THEN RAISE; END IF;
      SELECT id, transfer_group_id INTO v_existing, v_group FROM public.retail_stock_movements
      WHERE company_id = v_company AND idempotency_key = _idempotency_key;
      IF v_existing IS NULL THEN RAISE; END IF;
      RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'movement_id', v_existing, 'transfer_group_id', v_group);
    END;
    RETURN jsonb_build_object('success', true, 'idempotent_replay', false, 'movement_id', v_mov, 'transfer_group_id', v_group, 'balance_after', v_cur - _quantity);
  END IF;

  SELECT quantity INTO v_cur FROM public.retail_stock_balances WHERE unit_id = _unit_id AND product_id = _product_id FOR UPDATE;
  IF _kind = 'entrada' THEN v_new := v_cur + _quantity;
  ELSIF _kind = 'saida' THEN
    IF v_cur < _quantity THEN
      RAISE EXCEPTION 'Saldo insuficiente (atual: %, pedido: %)', v_cur, _quantity USING ERRCODE = '23514';
    END IF;
    v_new := v_cur - _quantity;
  ELSE v_new := _quantity;
  END IF;

  BEGIN
    INSERT INTO public.retail_stock_movements (company_id, unit_id, product_id, kind, quantity, balance_after, reason, idempotency_key, user_id)
    VALUES (v_company, _unit_id, _product_id, _kind, CASE WHEN _kind = 'ajuste' THEN abs(v_new - v_cur) ELSE _quantity END, v_new, _reason, _idempotency_key, v_uid)
    RETURNING id INTO v_mov;
    UPDATE public.retail_stock_balances SET quantity = v_new WHERE unit_id = _unit_id AND product_id = _product_id;
  EXCEPTION WHEN unique_violation THEN
    IF _idempotency_key IS NULL THEN RAISE; END IF;
    SELECT id INTO v_existing FROM public.retail_stock_movements WHERE company_id = v_company AND idempotency_key = _idempotency_key;
    IF v_existing IS NULL THEN RAISE; END IF;
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'movement_id', v_existing);
  END;
  RETURN jsonb_build_object('success', true, 'idempotent_replay', false, 'movement_id', v_mov, 'balance_before', v_cur, 'balance_after', v_new);
END $$;
REVOKE ALL ON FUNCTION public.retail_stock_move(uuid, uuid, text, numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_stock_move(uuid, uuid, text, numeric, text, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_unit_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_unit_member(uuid, uuid) TO authenticated, service_role;