\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
SET client_min_messages = notice;

-- IDs fixos
\set cA '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set cB '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set cC '''cccccccc-0000-0000-0000-00000000000c'''
\set mgrA '''11111111-0000-0000-0000-000000000001'''
\set empA '''11111111-0000-0000-0000-000000000002'''
\set empA2 '''11111111-0000-0000-0000-000000000003'''
\set mgrB '''22222222-0000-0000-0000-000000000001'''
\set empC '''33333333-0000-0000-0000-000000000001'''
\set uA1 '''a1a1a1a1-0000-0000-0000-0000000000a1'''
\set uA2 '''a2a2a2a2-0000-0000-0000-0000000000a2'''
\set uB1 '''b1b1b1b1-0000-0000-0000-0000000000b1'''
\set uC1 '''c1c1c1c1-0000-0000-0000-0000000000c1'''
\set p1 '''99999999-0000-0000-0000-000000000001'''
\set p2 '''99999999-0000-0000-0000-000000000002'''
\set pIn '''99999999-0000-0000-0000-000000000003'''
\set pB '''99999999-0000-0000-0000-000000000004'''

-- ===== Setup (superuser) =====
INSERT INTO companies (id, name, enabled_modules) VALUES (:cA,'A','{core,retail_core}'), (:cB,'B','{core,retail_core}'), (:cC,'C','{core}');
INSERT INTO profiles (id, full_name) VALUES (:mgrA,'Gestor A'),(:empA,'Func A'),(:empA2,'Func A2'),(:mgrB,'Gestor B'),(:empC,'Func C');
INSERT INTO user_roles VALUES (:mgrA,:cA,'manager'),(:empA,:cA,'employee'),(:empA2,:cA,'employee'),(:mgrB,:cB,'manager'),(:empC,:cC,'employee');
INSERT INTO company_units (id, company_id, name, code) VALUES (:uA1,:cA,'Loja A1','A1'),(:uA2,:cA,'Loja A2','A2'),(:uB1,:cB,'Loja B1','B1'),(:uC1,:cC,'Loja C1','C1');
INSERT INTO user_unit_assignments (company_id, user_id, unit_id) VALUES (:cA,:empA,:uA1),(:cC,:empC,:uC1);
INSERT INTO retail_products (id, company_id, name, price) VALUES (:p1,:cA,'Azulejo 10x10',10.00),(:p2,:cA,'Suporte',2.50),(:pB,:cB,'Prod B',5);
INSERT INTO retail_products (id, company_id, name, price, active) VALUES (:pIn,:cA,'Inativo',1,false);

CREATE TABLE IF NOT EXISTS t_results (n serial, name text, ok boolean, detail text);
GRANT ALL ON t_results TO authenticated; GRANT ALL ON SEQUENCE t_results_n_seq TO authenticated;
CREATE OR REPLACE FUNCTION t_ok(_name text, _ok boolean, _detail text DEFAULT '') RETURNS void LANGUAGE sql AS $$ INSERT INTO t_results(name, ok, detail) VALUES (_name, _ok, _detail) $$;
GRANT EXECUTE ON FUNCTION t_ok(text, boolean, text) TO authenticated;

-- Estoque inicial pelo gestor (RPC da Etapa 1)
SET ROLE authenticated; SELECT set_config('test.uid', :mgrA, false);
SELECT retail_stock_move(:uA1, :p1, 'entrada', 10, 'inicial', NULL, 'init-1') IS NOT NULL;
SELECT retail_stock_move(:uA1, :p2, 'entrada', 100, 'inicial', NULL, 'init-2') IS NOT NULL;

-- 1. Venda sem caixa aberto
SELECT set_config('test.uid', :empA, false);
DO $$ BEGIN
  PERFORM retail_sale_create('a1a1a1a1-0000-0000-0000-0000000000a1', '[{"product_id":"99999999-0000-0000-0000-000000000001","quantity":1}]', '[{"method":"dinheiro","amount":10}]');
  PERFORM t_ok('01 venda sem caixa recusada', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('01 venda sem caixa recusada', SQLERRM LIKE 'Abra o caixa%', SQLERRM); END $$;

-- 2. Abrir caixa (funcionário vinculado) e segunda abertura recusada
SELECT t_ok('02a abrir caixa funcionário', (retail_cash_open(:uA1, 50)->>'success')::boolean);
DO $$ BEGIN
  PERFORM retail_cash_open('a1a1a1a1-0000-0000-0000-0000000000a1', 0);
  PERFORM t_ok('02b segundo caixa recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('02b segundo caixa recusado', SQLERRM LIKE 'Já existe um caixa aberto%', SQLERRM); END $$;

-- 3. Funcionário sem vínculo não opera a loja
SELECT set_config('test.uid', :empA2, false);
DO $$ BEGIN
  PERFORM retail_cash_open('a2a2a2a2-0000-0000-0000-0000000000a2', 0);
  PERFORM t_ok('03 funcionário sem vínculo recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('03 funcionário sem vínculo recusado', SQLERRM LIKE 'Sem permissão%', SQLERRM); END $$;

-- 4. Venda: preço do cadastro (preço enviado pelo cliente é ignorado), desconto 10%, troco
SELECT set_config('test.uid', :empA, false);
SELECT set_config('test.r4', retail_sale_create(:uA1,
  '[{"product_id":"99999999-0000-0000-0000-000000000001","quantity":2,"price":0},{"product_id":"99999999-0000-0000-0000-000000000002","quantity":4}]',
  '[{"method":"dinheiro","amount":50}]', 3, '{"name":"Cliente X","tax_id":"123"}', 'sale-1')::text, false);
SELECT t_ok('04a total = 30 - 3 = 27 e troco 23',
  (current_setting('test.r4')::jsonb->>'total')::numeric = 27 AND (current_setting('test.r4')::jsonb->>'change_amount')::numeric = 23, current_setting('test.r4'));
SELECT t_ok('04b código A1-ANO-000001', current_setting('test.r4')::jsonb->>'code' LIKE 'A1-____-000001', current_setting('test.r4')::jsonb->>'code');
SELECT t_ok('04c estoque baixou (8 e 96)',
  (SELECT quantity FROM retail_stock_balances WHERE unit_id = :uA1 AND product_id = :p1) = 8
  AND (SELECT quantity FROM retail_stock_balances WHERE unit_id = :uA1 AND product_id = :p2) = 96);
SELECT t_ok('04d 2 movimentos "venda" ligados à venda',
  (SELECT count(*) FROM retail_stock_movements WHERE kind = 'venda' AND sale_id = (current_setting('test.r4')::jsonb->>'sale_id')::uuid) = 2);

-- 5. Idempotência: repetir a mesma chave não cria venda nem mexe no estoque
SELECT t_ok('05 replay idempotente', (retail_sale_create(:uA1,
  '[{"product_id":"99999999-0000-0000-0000-000000000001","quantity":2}]', '[{"method":"dinheiro","amount":50}]', 0, NULL, 'sale-1')->>'idempotent_replay')::boolean
  AND (SELECT quantity FROM retail_stock_balances WHERE unit_id = :uA1 AND product_id = :p1) = 8
  AND (SELECT count(*) FROM retail_sales) = 1);

-- 6. Desconto acima do limite (funcionário) recusado; gestor pode
DO $$ BEGIN
  PERFORM retail_sale_create('a1a1a1a1-0000-0000-0000-0000000000a1', '[{"product_id":"99999999-0000-0000-0000-000000000001","quantity":1}]', '[{"method":"dinheiro","amount":10}]', 2);
  PERFORM t_ok('06a desconto > 10% recusado ao funcionário', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('06a desconto > 10% recusado ao funcionário', SQLERRM LIKE 'Desconto acima do limite%', SQLERRM); END $$;
SELECT set_config('test.uid', :mgrA, false);
SELECT t_ok('06b gestor dá desconto de 50%', (retail_sale_create(:uA1, '[{"product_id":"99999999-0000-0000-0000-000000000001","quantity":1}]', '[{"method":"cartao_debito","amount":5}]', 5)->>'total')::numeric = 5);

-- 7. Pagamento insuficiente; troco a partir de cartão
SELECT set_config('test.uid', :empA, false);
DO $$ BEGIN
  PERFORM retail_sale_create('a1a1a1a1-0000-0000-0000-0000000000a1', '[{"product_id":"99999999-0000-0000-0000-000000000001","quantity":1}]', '[{"method":"pix","amount":9.99}]');
  PERFORM t_ok('07a pagamento insuficiente recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('07a pagamento insuficiente recusado', SQLERRM LIKE 'Pagamento insuficiente%', SQLERRM); END $$;
DO $$ BEGIN
  PERFORM retail_sale_create('a1a1a1a1-0000-0000-0000-0000000000a1', '[{"product_id":"99999999-0000-0000-0000-000000000001","quantity":1}]', '[{"method":"cartao_credito","amount":20}]');
  PERFORM t_ok('07b troco em cartão recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('07b troco em cartão recusado', SQLERRM LIKE 'Troco só pode%', SQLERRM); END $$;

-- 8. Estoque insuficiente: nada fica gravado e a numeração não salta
DO $$ BEGIN
  PERFORM retail_sale_create('a1a1a1a1-0000-0000-0000-0000000000a1', '[{"product_id":"99999999-0000-0000-0000-000000000002","quantity":1},{"product_id":"99999999-0000-0000-0000-000000000001","quantity":100}]', '[{"method":"dinheiro","amount":2000}]');
  PERFORM t_ok('08a estoque insuficiente recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('08a estoque insuficiente recusado', SQLERRM LIKE 'Estoque insuficiente%', SQLERRM); END $$;
SELECT t_ok('08b sem gravação parcial (Suporte continua 96)', (SELECT quantity FROM retail_stock_balances WHERE unit_id = :uA1 AND product_id = :p2) = 96);
SELECT set_config('test.r8', retail_sale_create(:uA1, '[{"product_id":"99999999-0000-0000-0000-000000000002","quantity":2}]', '[{"method":"mbway","amount":5}]', 0, NULL, 'sale-3')::text, false);
SELECT t_ok('08c numeração sequencial sem saltos (000003)', current_setting('test.r8')::jsonb->>'code' LIKE '%-000003', current_setting('test.r8')::jsonb->>'code');

-- 9. Produto inativo / de outra empresa
DO $$ BEGIN
  PERFORM retail_sale_create('a1a1a1a1-0000-0000-0000-0000000000a1', '[{"product_id":"99999999-0000-0000-0000-000000000003","quantity":1}]', '[{"method":"dinheiro","amount":1}]');
  PERFORM t_ok('09a produto inativo recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('09a produto inativo recusado', SQLERRM LIKE 'Produto inválido%', SQLERRM); END $$;
DO $$ BEGIN
  PERFORM retail_sale_create('a1a1a1a1-0000-0000-0000-0000000000a1', '[{"product_id":"99999999-0000-0000-0000-000000000004","quantity":1}]', '[{"method":"dinheiro","amount":5}]');
  PERFORM t_ok('09b produto de outra empresa recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('09b produto de outra empresa recusado', SQLERRM LIKE 'Produto inválido%', SQLERRM); END $$;

-- 10. Escrita direta proibida (só RPC)
DO $$ BEGIN
  UPDATE retail_sales SET total = 0;
  PERFORM t_ok('10a UPDATE direto em vendas recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('10a UPDATE direto em vendas recusado', SQLSTATE = '42501', SQLERRM); END $$;
DO $$ BEGIN
  INSERT INTO retail_cash_sessions (company_id, unit_id, opening_amount) VALUES ('aaaaaaaa-0000-0000-0000-00000000000a','a2a2a2a2-0000-0000-0000-0000000000a2',0);
  PERFORM t_ok('10b INSERT direto em caixa recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('10b INSERT direto em caixa recusado', SQLSTATE = '42501', SQLERRM); END $$;
DO $$ BEGIN
  PERFORM 1 FROM retail_unit_counters;
  PERFORM t_ok('10c contadores invisíveis ao utilizador', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('10c contadores invisíveis ao utilizador', SQLSTATE = '42501', SQLERRM); END $$;

-- 11. Cancelamento: funcionário não pode; gestor pode; estoque volta; repetir é inofensivo
DO $$ BEGIN
  PERFORM retail_sale_cancel((SELECT id FROM retail_sales WHERE number = 1), 'erro');
  PERFORM t_ok('11a funcionário não cancela', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('11a funcionário não cancela', SQLERRM LIKE 'Só gestores%', SQLERRM); END $$;
SELECT set_config('test.uid', :mgrA, false);
SELECT t_ok('11b gestor cancela', NOT (retail_sale_cancel((SELECT id FROM retail_sales WHERE number = 1), 'Cliente desistiu')->>'already_cancelled')::boolean);
SELECT t_ok('11c estoque devolvido (Azulejo 10-2-1+2 = 9, Suporte 96-2+4 = 98)',
  (SELECT quantity FROM retail_stock_balances WHERE unit_id = :uA1 AND product_id = :p1) = 9
  AND (SELECT quantity FROM retail_stock_balances WHERE unit_id = :uA1 AND product_id = :p2) = 98,
  (SELECT string_agg(quantity::text, ',') FROM retail_stock_balances WHERE unit_id = :uA1));
SELECT t_ok('11d cancelar de novo é inofensivo', (retail_sale_cancel((SELECT id FROM retail_sales WHERE number = 1), 'x')->>'already_cancelled')::boolean);

-- 12. Isolamento: empresa B e empresa sem módulo
SELECT set_config('test.uid', :mgrB, false);
SELECT t_ok('12a gestor B não vê vendas de A', (SELECT count(*) FROM retail_sales) = 0);
DO $$ BEGIN
  PERFORM retail_cash_open('a1a1a1a1-0000-0000-0000-0000000000a1', 0);
  PERFORM t_ok('12b gestor B não opera loja de A', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('12b gestor B não opera loja de A', SQLERRM LIKE 'Sem permissão%', SQLERRM); END $$;
SELECT set_config('test.uid', :empC, false);
DO $$ BEGIN
  PERFORM retail_cash_open('c1c1c1c1-0000-0000-0000-0000000000c1', 0);
  PERFORM t_ok('12c empresa sem módulo recusada', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('12c empresa sem módulo recusada', SQLERRM LIKE 'Módulo Lojas inativo%', SQLERRM); END $$;
SELECT set_config('test.uid', :empA2, false);
SELECT t_ok('12d funcionário sem vínculo não vê vendas da loja', (SELECT count(*) FROM retail_sales) = 0);

-- 13. Sangria, conferência e fecho
SELECT set_config('test.uid', :empA, false);
SELECT t_ok('13a sangria', (retail_cash_move((SELECT id FROM retail_cash_sessions WHERE status = 'aberta' AND unit_id = :uA1), 'sangria', 10, 'Depósito banco', 'cm-1')->>'success')::boolean);
SELECT t_ok('13b sangria idempotente', (retail_cash_move((SELECT id FROM retail_cash_sessions WHERE status = 'aberta' AND unit_id = :uA1), 'sangria', 10, 'Depósito banco', 'cm-1')->>'idempotent_replay')::boolean);
-- esperado: 50 inicial + 0 dinheiro (venda 1 cancelada) - 0 troco - 10 sangria = 40
SELECT set_config('test.t13', retail_cash_session_totals((SELECT id FROM retail_cash_sessions WHERE status = 'aberta' AND unit_id = :uA1))::text, false);
SELECT t_ok('13c dinheiro esperado = 40 (venda cancelada fora)', (current_setting('test.t13')::jsonb->>'expected_cash')::numeric = 40, current_setting('test.t13'));
SELECT set_config('test.c13', retail_cash_close((SELECT id FROM retail_cash_sessions WHERE status = 'aberta' AND unit_id = :uA1), 38.5, 'falta troco')::text, false);
SELECT t_ok('13d diferença = -1.50', (current_setting('test.c13')::jsonb->>'difference')::numeric = -1.5, current_setting('test.c13'));
DO $$ BEGIN
  PERFORM retail_sale_create('a1a1a1a1-0000-0000-0000-0000000000a1', '[{"product_id":"99999999-0000-0000-0000-000000000001","quantity":1}]', '[{"method":"dinheiro","amount":10}]');
  PERFORM t_ok('13e venda com caixa fechado recusada', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('13e venda com caixa fechado recusada', SQLERRM LIKE 'Abra o caixa%', SQLERRM); END $$;
SELECT set_config('test.uid', :mgrA, false);
DO $$ BEGIN
  PERFORM retail_sale_cancel((SELECT id FROM retail_sales WHERE number = 2), 'tarde');
  PERFORM t_ok('13f cancelar após fecho recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('13f cancelar após fecho recusado', SQLERRM LIKE 'O caixa desta venda já foi fechado%', SQLERRM); END $$;

-- 14. Exclusões: loja com caixa não se apaga; empresa inteira sim (cascata)
RESET ROLE;
DO $$ BEGIN
  DELETE FROM company_units WHERE id = 'a2a2a2a2-0000-0000-0000-0000000000a2';
  PERFORM t_ok('14a loja sem histórico pode ser apagada', true);
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('14a loja sem histórico pode ser apagada', false, SQLERRM); END $$;
DO $$ BEGIN
  DELETE FROM company_units WHERE id = 'a1a1a1a1-0000-0000-0000-0000000000a1';
  PERFORM t_ok('14b loja com vendas não pode ser apagada', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('14b loja com vendas não pode ser apagada', SQLSTATE = '23503', SQLERRM); END $$;
DO $$ BEGIN
  UPDATE retail_sales SET total = 1 WHERE number = 2;
  PERFORM t_ok('14c alterar valores de venda (mesmo superuser) recusado', false, 'passou');
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('14c alterar valores de venda (mesmo superuser) recusado', SQLERRM LIKE 'Venda imutável%', SQLERRM); END $$;
DO $$ BEGIN
  DELETE FROM companies WHERE id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  PERFORM t_ok('14d apagar empresa inteira (cascata) funciona', NOT EXISTS (SELECT 1 FROM retail_sales));
EXCEPTION WHEN OTHERS THEN PERFORM t_ok('14d apagar empresa inteira (cascata) funciona', false, SQLERRM); END $$;

SELECT CASE WHEN ok THEN 'PASS ' ELSE 'FAIL ' END || name || CASE WHEN ok THEN '' ELSE ' :: ' || detail END FROM t_results ORDER BY n;
SELECT 'TOTAL ' || count(*) FILTER (WHERE ok) || '/' || count(*) FROM t_results;
