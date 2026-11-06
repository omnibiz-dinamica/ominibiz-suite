/**
 * Etapa 2 · Lojas (Caixa e PDV) — testes de integração contra o banco real.
 * Mesmo padrão da Etapa 1: cria empresas/utilizadores temporários e apaga tudo no fim.
 * Requer SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY (sem elas, fica em skip).
 * Os mesmos cenários estão em tests/sql/retail-pos-stage2.sql para correr num Postgres local.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = !!(URL && ANON && SERVICE);
const d = enabled ? describe : describe.skip;

const tag = `pos${Date.now().toString(36)}`;
const PASS = `Pos!${crypto.randomUUID()}`;
const admin = enabled ? createClient(URL!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } }) : (null as unknown as SupabaseClient);
const createdUsers: string[] = [];
const createdCompanies: string[] = [];

type Ctx = {
  A: string;
  B: string;
  C: string;
  mgrA: SupabaseClient;
  empA: SupabaseClient;
  empA2: SupabaseClient;
  mgrB: SupabaseClient;
  mgrC: SupabaseClient;
  A1: string;
  A2: string;
  C1: string;
  p1: string;
  p2: string;
  pIn: string;
  pB: string;
  session: string;
};
const ctx = {} as Ctx;

async function mkCompany(key: string, modules: string[]) {
  const { data, error } = await admin
    .from("companies")
    .insert({ name: `POS Teste ${key} ${tag}`, slug: `${tag}-${key.toLowerCase()}`, enabled_modules: modules, country: "PT" } as never)
    .select("id")
    .single();
  if (error) throw error;
  createdCompanies.push(data.id);
  return data.id as string;
}
async function mkUser(key: string, companyId: string, role: "manager" | "employee") {
  const email = `${tag}-${key.toLowerCase()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true, user_metadata: { full_name: `Teste ${key}` } });
  if (error) throw error;
  createdUsers.push(data.user.id);
  await admin.from("profiles").upsert({ id: data.user.id, full_name: `Teste ${key}` } as never);
  const r = await admin.from("user_roles").insert({ user_id: data.user.id, company_id: companyId, role } as never);
  if (r.error) throw r.error;
  const c = createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await c.auth.signInWithPassword({ email, password: PASS });
  if (s.error) throw s.error;
  return { id: data.user.id, c };
}
async function ins(c: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await c.from(table).insert(row as never).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}
async function balance(unit: string, product: string) {
  const { data } = await admin.from("retail_stock_balances").select("quantity").eq("unit_id", unit).eq("product_id", product).maybeSingle();
  return Number((data as { quantity: number } | null)?.quantity ?? 0);
}
const rpc = (c: SupabaseClient, fn: string, args: Record<string, unknown>) => c.rpc(fn as never, args as never);
const sale = (c: SupabaseClient, a: { unit: string; items: { product_id: string; quantity: number; price?: number }[]; pays: { method: string; amount: number }[]; discount?: number; key?: string }) =>
  rpc(c, "retail_sale_create", { _unit_id: a.unit, _items: a.items, _payments: a.pays, _discount: a.discount ?? 0, _customer: null, _idempotency_key: a.key ?? null });
const errMsg = (r: { error: { message: string } | null }) => r.error?.message ?? "";

d("Lojas · Etapa 2 · caixa e PDV no banco", () => {
  beforeAll(async () => {
    const mods = ["core", "tasks", "time_clock", "hr", "support", "notes", "retail_core"];
    ctx.A = await mkCompany("A", mods);
    ctx.B = await mkCompany("B", mods);
    ctx.C = await mkCompany("C", ["core"]);
    const mA = await mkUser("mgrA", ctx.A, "manager");
    const eA = await mkUser("empA", ctx.A, "employee");
    const eA2 = await mkUser("empA2", ctx.A, "employee");
    const mB = await mkUser("mgrB", ctx.B, "manager");
    const mC = await mkUser("mgrC", ctx.C, "manager");
    Object.assign(ctx, { mgrA: mA.c, empA: eA.c, empA2: eA2.c, mgrB: mB.c, mgrC: mC.c });
    ctx.A1 = await ins(mA.c, "company_units", { company_id: ctx.A, name: "Loja 1", code: "L1" });
    ctx.A2 = await ins(mA.c, "company_units", { company_id: ctx.A, name: "Loja 2", code: "L2" });
    const B1 = await ins(mB.c, "company_units", { company_id: ctx.B, name: "Loja B", code: "B1" });
    ctx.C1 = (await admin.from("company_units").insert({ company_id: ctx.C, name: "Loja C", code: "C1" } as never).select("id").single()).data!.id as string;
    await ins(mA.c, "user_unit_assignments", { company_id: ctx.A, user_id: eA.id, unit_id: ctx.A1, is_primary: true });
    ctx.p1 = await ins(mA.c, "retail_products", { company_id: ctx.A, name: "Azulejo", sku: "AZ", price: 10 });
    ctx.p2 = await ins(mA.c, "retail_products", { company_id: ctx.A, name: "Suporte", sku: "SP", price: 2.5 });
    ctx.pIn = await ins(mA.c, "retail_products", { company_id: ctx.A, name: "Antigo", sku: "OLD", price: 1, active: false });
    ctx.pB = await ins(mB.c, "retail_products", { company_id: ctx.B, name: "Prod B", sku: "PB", price: 5 });
    void B1;
    for (const [p, q] of [[ctx.p1, 10], [ctx.p2, 100]] as const)
      await rpc(mA.c, "retail_stock_move", { _unit_id: ctx.A1, _product_id: p, _kind: "entrada", _quantity: q, _reason: "inicial", _related_unit_id: null, _idempotency_key: crypto.randomUUID() });
  }, 90_000);

  afterAll(async () => {
    for (const id of createdCompanies) await admin.from("companies").delete().eq("id", id);
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  test("1. sem caixa aberto não vende", async () => {
    const r = await sale(ctx.empA, { unit: ctx.A1, items: [{ product_id: ctx.p1, quantity: 1 }], pays: [{ method: "dinheiro", amount: 10 }] });
    expect(errMsg(r)).toContain("Abra o caixa");
  });

  test("2. funcionário vinculado abre caixa; segundo caixa e funcionário sem vínculo recusados", async () => {
    const r = await rpc(ctx.empA, "retail_cash_open", { _unit_id: ctx.A1, _opening_amount: 50, _notes: null });
    expect(r.error).toBeNull();
    ctx.session = (r.data as { session_id: string }).session_id;
    expect(errMsg(await rpc(ctx.empA, "retail_cash_open", { _unit_id: ctx.A1, _opening_amount: 0, _notes: null }))).toContain("Já existe um caixa aberto");
    expect(errMsg(await rpc(ctx.empA2, "retail_cash_open", { _unit_id: ctx.A2, _opening_amount: 0, _notes: null }))).toContain("Sem permissão");
  });

  test("3. venda: preço do cadastro, desconto até 10%, troco e baixa de estoque; replay não duplica", async () => {
    const key = crypto.randomUUID();
    const args = { unit: ctx.A1, items: [{ product_id: ctx.p1, quantity: 2, price: 0 }, { product_id: ctx.p2, quantity: 4 }], pays: [{ method: "dinheiro", amount: 50 }], discount: 3, key };
    const r = await sale(ctx.empA, args);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ total: 27, change_amount: 23, idempotent_replay: false });
    expect((r.data as { code: string }).code).toMatch(/^L1-\d{4}-000001$/);
    expect(await balance(ctx.A1, ctx.p1)).toBe(8);
    expect(await balance(ctx.A1, ctx.p2)).toBe(96);
    const again = await sale(ctx.empA, args);
    expect((again.data as { idempotent_replay: boolean }).idempotent_replay).toBe(true);
    expect(await balance(ctx.A1, ctx.p1)).toBe(8);
  });

  test("4. regras de valor: desconto acima do limite, pagamento insuficiente, troco de cartão", async () => {
    const one = [{ product_id: ctx.p1, quantity: 1 }];
    expect(errMsg(await sale(ctx.empA, { unit: ctx.A1, items: one, pays: [{ method: "dinheiro", amount: 10 }], discount: 2 }))).toContain("Desconto acima do limite");
    expect(errMsg(await sale(ctx.empA, { unit: ctx.A1, items: one, pays: [{ method: "pix", amount: 9.99 }] }))).toContain("Pagamento insuficiente");
    expect(errMsg(await sale(ctx.empA, { unit: ctx.A1, items: one, pays: [{ method: "cartao_credito", amount: 20 }] }))).toContain("Troco só pode");
    const mgr = await sale(ctx.mgrA, { unit: ctx.A1, items: one, pays: [{ method: "cartao_debito", amount: 5 }], discount: 5 });
    expect((mgr.data as { total: number }).total).toBe(5);
  });

  test("5. estoque insuficiente não grava nada; produto inativo/de outra empresa recusado", async () => {
    const before = await balance(ctx.A1, ctx.p2);
    const r = await sale(ctx.empA, { unit: ctx.A1, items: [{ product_id: ctx.p2, quantity: 1 }, { product_id: ctx.p1, quantity: 100 }], pays: [{ method: "dinheiro", amount: 2000 }] });
    expect(errMsg(r)).toContain("Estoque insuficiente");
    expect(await balance(ctx.A1, ctx.p2)).toBe(before);
    for (const p of [ctx.pIn, ctx.pB])
      expect(errMsg(await sale(ctx.empA, { unit: ctx.A1, items: [{ product_id: p, quantity: 1 }], pays: [{ method: "dinheiro", amount: 5 }] }))).toContain("Produto inválido");
  });

  test("6. vendas em paralelo: numeração sem saltos nem repetições", async () => {
    const res = await Promise.all(
      Array.from({ length: 8 }, () => sale(ctx.mgrA, { unit: ctx.A1, items: [{ product_id: ctx.p2, quantity: 1 }], pays: [{ method: "dinheiro", amount: 2.5 }], key: crypto.randomUUID() })),
    );
    for (const r of res) expect(r.error).toBeNull();
    const { data } = await admin.from("retail_sales").select("number").eq("unit_id", ctx.A1).order("number");
    const nums = (data ?? []).map((x: { number: number }) => x.number);
    expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
  });

  test("7. escrita direta proibida e isolamento entre empresas", async () => {
    const u = await ctx.mgrA.from("retail_sales").update({ total: 0 } as never).eq("unit_id", ctx.A1).select("id");
    expect(u.error !== null || (u.data ?? []).length === 0).toBe(true);
    const i = await ctx.mgrA.from("retail_cash_sessions").insert({ company_id: ctx.A, unit_id: ctx.A2, opening_amount: 0 } as never);
    expect(i.error).not.toBeNull();
    const seen = await ctx.mgrB.from("retail_sales").select("id").eq("company_id", ctx.A);
    expect(seen.data ?? []).toHaveLength(0);
    expect(errMsg(await rpc(ctx.mgrB, "retail_cash_open", { _unit_id: ctx.A1, _opening_amount: 0, _notes: null }))).toContain("Sem permissão");
    expect(errMsg(await rpc(ctx.mgrC, "retail_cash_open", { _unit_id: ctx.C1, _opening_amount: 0, _notes: null }))).toContain("Módulo Lojas inativo");
    const notMine = await ctx.empA2.from("retail_sales").select("id");
    expect(notMine.data ?? []).toHaveLength(0);
  });

  test("8. cancelamento: só gestor, devolve estoque, repetir é inofensivo", async () => {
    const { data } = await admin.from("retail_sales").select("id").eq("unit_id", ctx.A1).eq("number", 1).single();
    const id = (data as { id: string }).id;
    expect(errMsg(await rpc(ctx.empA, "retail_sale_cancel", { _sale_id: id, _reason: "x" }))).toContain("Só gestores");
    const b1 = await balance(ctx.A1, ctx.p1);
    const r = await rpc(ctx.mgrA, "retail_sale_cancel", { _sale_id: id, _reason: "Cliente desistiu" });
    expect(r.error).toBeNull();
    expect(await balance(ctx.A1, ctx.p1)).toBe(b1 + 2);
    const again = await rpc(ctx.mgrA, "retail_sale_cancel", { _sale_id: id, _reason: "x" });
    expect((again.data as { already_cancelled: boolean }).already_cancelled).toBe(true);
  });

  test("9. sangria, conferência e fecho; depois do fecho não vende nem cancela", async () => {
    const k = crypto.randomUUID();
    expect((await rpc(ctx.empA, "retail_cash_move", { _session_id: ctx.session, _kind: "sangria", _amount: 10, _reason: "Banco", _idempotency_key: k })).error).toBeNull();
    expect(((await rpc(ctx.empA, "retail_cash_move", { _session_id: ctx.session, _kind: "sangria", _amount: 10, _reason: "Banco", _idempotency_key: k })).data as { idempotent_replay: boolean }).idempotent_replay).toBe(true);
    const t = (await rpc(ctx.empA, "retail_cash_session_totals", { _session_id: ctx.session })).data as { expected_cash: number };
    // 50 inicial + 8×2,50 em dinheiro (venda 1 cancelada) − 10 sangria = 60
    expect(Number(t.expected_cash)).toBe(60);
    const c = await rpc(ctx.empA, "retail_cash_close", { _session_id: ctx.session, _counted_cash: 58.5, _notes: "falta" });
    expect(Number((c.data as { difference: number }).difference)).toBe(-1.5);
    expect(errMsg(await sale(ctx.empA, { unit: ctx.A1, items: [{ product_id: ctx.p1, quantity: 1 }], pays: [{ method: "dinheiro", amount: 10 }] }))).toContain("Abra o caixa");
    const { data } = await admin.from("retail_sales").select("id").eq("unit_id", ctx.A1).eq("number", 2).single();
    expect(errMsg(await rpc(ctx.mgrA, "retail_sale_cancel", { _sale_id: (data as { id: string }).id, _reason: "tarde" }))).toContain("já foi fechado");
  });

  test("10. loja com vendas não se apaga; empresa inteira sim (cascata)", async () => {
    const del = await ctx.mgrA.from("company_units").delete().eq("id", ctx.A1);
    expect(del.error?.code).toBe("23503");
    expect((await admin.from("companies").delete().eq("id", ctx.A)).error).toBeNull();
    for (const t of ["retail_sales", "retail_sale_items", "retail_sale_payments", "retail_cash_sessions", "retail_cash_movements"]) {
      const { count } = await admin.from(t).select("id", { count: "exact", head: true }).eq("company_id", ctx.A);
      expect(count).toBe(0);
    }
  });
});
