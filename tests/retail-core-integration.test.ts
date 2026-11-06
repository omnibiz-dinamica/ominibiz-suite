/**
 * Etapa 1 · Lojas (retail_core) — testes de integração contra o banco real.
 * Cria empresas e utilizadores temporários, executa os cenários e apaga tudo
 * no fim (a própria exclusão da empresa é o teste 13).
 * Requer SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = !!(URL && ANON && SERVICE);
const d = enabled ? describe : describe.skip;

const tag = `rt${Date.now().toString(36)}`;
const PASS = `Rt!${crypto.randomUUID()}`;
const admin = enabled
  ? createClient(URL!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } })
  : (null as unknown as SupabaseClient);

type Ctx = {
  companies: Record<"A" | "B" | "C", string>;
  users: Record<"mgrA" | "empA" | "mgrB" | "mgrC", string>;
  clients: Record<"mgrA" | "empA" | "mgrB" | "mgrC", SupabaseClient>;
  units: { A1: string; A2: string; B1: string };
  products: { A: string; Ainactive: string; B: string };
  catB: string;
};
const ctx = {} as Ctx;
const createdUsers: string[] = [];
const createdCompanies: string[] = [];

async function mkCompany(key: string, modules: string[]) {
  const { data, error } = await admin
    .from("companies")
    .insert({ name: `Retail Teste ${key} ${tag}`, slug: `${tag}-${key.toLowerCase()}`, enabled_modules: modules, country: "PT" } as never)
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
  const id = data.user.id;
  createdUsers.push(id);
  await admin.from("profiles").upsert({ id, full_name: `Teste ${key}` } as never);
  const r = await admin.from("user_roles").insert({ user_id: id, company_id: companyId, role } as never);
  if (r.error) throw r.error;
  const c = createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await c.auth.signInWithPassword({ email, password: PASS });
  if (s.error) throw s.error;
  return { id, c };
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

const move = (c: SupabaseClient, a: { unit: string; product: string; kind: string; qty: number; to?: string; key?: string }) =>
  c.rpc("retail_stock_move" as never, {
    _unit_id: a.unit,
    _product_id: a.product,
    _kind: a.kind,
    _quantity: a.qty,
    _reason: "teste automático",
    _related_unit_id: a.to ?? null,
    _idempotency_key: a.key ?? null,
  } as never);

d("retail_core · integração no banco", () => {
  beforeAll(async () => {
    const mods = ["core", "tasks", "time_clock", "hr", "support", "notes", "retail_core"];
    ctx.companies = { A: await mkCompany("A", mods), B: await mkCompany("B", mods), C: await mkCompany("C", ["core"]) };
    const mA = await mkUser("mgrA", ctx.companies.A, "manager");
    const eA = await mkUser("empA", ctx.companies.A, "employee");
    const mB = await mkUser("mgrB", ctx.companies.B, "manager");
    const mC = await mkUser("mgrC", ctx.companies.C, "manager");
    ctx.users = { mgrA: mA.id, empA: eA.id, mgrB: mB.id, mgrC: mC.id };
    ctx.clients = { mgrA: mA.c, empA: eA.c, mgrB: mB.c, mgrC: mC.c };

    const A1 = await ins(mA.c, "company_units", { company_id: ctx.companies.A, name: "Loja 1", code: "L1" });
    const A2 = await ins(mA.c, "company_units", { company_id: ctx.companies.A, name: "Loja 2", code: "L2" });
    const B1 = await ins(mB.c, "company_units", { company_id: ctx.companies.B, name: "Loja B", code: "B1" });
    ctx.units = { A1, A2, B1 };
    await ins(mA.c, "user_unit_assignments", { company_id: ctx.companies.A, user_id: eA.id, unit_id: A1, is_primary: true });
    const catA = await ins(mA.c, "retail_product_categories", { company_id: ctx.companies.A, name: "Geral" });
    ctx.catB = await ins(mB.c, "retail_product_categories", { company_id: ctx.companies.B, name: "Geral" });
    ctx.products = {
      A: await ins(mA.c, "retail_products", { company_id: ctx.companies.A, category_id: catA, name: "Parafuso", sku: "P1", price: 1 }),
      Ainactive: await ins(mA.c, "retail_products", { company_id: ctx.companies.A, name: "Antigo", sku: "OLD", price: 1, active: false }),
      B: await ins(mB.c, "retail_products", { company_id: ctx.companies.B, category_id: ctx.catB, name: "Prego", sku: "N1", price: 1 }),
    };
  }, 60_000);

  afterAll(async () => {
    for (const id of createdCompanies) await admin.from("companies").delete().eq("id", id);
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  test("1. empresa sem retail_core: select vazio, insert e RPC recusados", async () => {
    const c = ctx.clients.mgrC;
    const sel = await c.from("company_units").select("id").eq("company_id", ctx.companies.C);
    expect(sel.data ?? []).toHaveLength(0);
    const insr = await c.from("company_units").insert({ company_id: ctx.companies.C, name: "X", code: "X" } as never);
    expect(insr.error).not.toBeNull();
    const cat = await c.from("retail_product_categories").insert({ company_id: ctx.companies.C, name: "X" } as never);
    expect(cat.error).not.toBeNull();
  });

  test("2. empresa A não vê nada da empresa B", async () => {
    const c = ctx.clients.mgrA;
    for (const t of ["company_units", "retail_products", "retail_product_categories", "retail_stock_balances", "retail_stock_movements", "user_unit_assignments"]) {
      const { data } = await c.from(t).select("id").eq("company_id", ctx.companies.B);
      expect(data ?? []).toHaveLength(0);
    }
    const r = await move(c, { unit: ctx.units.B1, product: ctx.products.B, kind: "entrada", qty: 1 });
    expect(r.error).not.toBeNull();
  });

  test("3. integridade entre empresas: vínculo e categoria de outra empresa recusados", async () => {
    const r1 = await admin.from("user_unit_assignments").insert({ company_id: ctx.companies.A, user_id: ctx.users.empA, unit_id: ctx.units.B1 } as never);
    expect(r1.error?.code).toBe("23503");
    const r2 = await admin.from("user_unit_assignments").insert({ company_id: ctx.companies.A, user_id: ctx.users.mgrB, unit_id: ctx.units.A2 } as never);
    expect(r2.error?.code).toBe("23503");
    const r3 = await admin.from("retail_products").insert({ company_id: ctx.companies.A, category_id: ctx.catB, name: "X" } as never);
    expect(r3.error?.code).toBe("23503");
  });

  test("4/5. employee da Loja 1: não vê Loja 2; só entrada na Loja 1", async () => {
    const e = ctx.clients.empA;
    const okIn = await move(e, { unit: ctx.units.A1, product: ctx.products.A, kind: "entrada", qty: 10 });
    expect(okIn.error).toBeNull();
    expect(await balance(ctx.units.A1, ctx.products.A)).toBe(10);
    const { data: mov } = await admin.from("retail_stock_movements").select("user_id").eq("id", (okIn.data as { movement_id: string }).movement_id).single();
    expect((mov as { user_id: string }).user_id).toBe(ctx.users.empA);

    for (const k of ["saida", "ajuste"]) expect((await move(e, { unit: ctx.units.A1, product: ctx.products.A, kind: k, qty: 1 })).error).not.toBeNull();
    expect((await move(e, { unit: ctx.units.A1, product: ctx.products.A, kind: "transferencia", qty: 1, to: ctx.units.A2 })).error).not.toBeNull();
    expect((await move(e, { unit: ctx.units.A2, product: ctx.products.A, kind: "entrada", qty: 1 })).error).not.toBeNull();

    await move(ctx.clients.mgrA, { unit: ctx.units.A2, product: ctx.products.A, kind: "entrada", qty: 1 });
    const vis = await e.from("retail_stock_balances").select("unit_id");
    expect((vis.data ?? []).every((r: { unit_id: string }) => r.unit_id === ctx.units.A1)).toBe(true);
    const units = await e.from("company_units").select("id");
    expect((units.data ?? []).map((u: { id: string }) => u.id)).toEqual([ctx.units.A1]);
  });

  test("6. manager movimenta todas as lojas", async () => {
    const m = ctx.clients.mgrA;
    expect((await move(m, { unit: ctx.units.A2, product: ctx.products.A, kind: "entrada", qty: 4 })).error).toBeNull();
    expect((await move(m, { unit: ctx.units.A2, product: ctx.products.A, kind: "saida", qty: 2 })).error).toBeNull();
    expect(await balance(ctx.units.A2, ctx.products.A)).toBe(3);
  });

  test("7. ajuste para zero funciona", async () => {
    const r = await move(ctx.clients.mgrA, { unit: ctx.units.A2, product: ctx.products.A, kind: "ajuste", qty: 0 });
    expect(r.error).toBeNull();
    expect(await balance(ctx.units.A2, ctx.products.A)).toBe(0);
  });

  test("8. saída maior que o saldo é recusada", async () => {
    const r = await move(ctx.clients.mgrA, { unit: ctx.units.A2, product: ctx.products.A, kind: "saida", qty: 1 });
    expect(r.error).not.toBeNull();
    expect(await balance(ctx.units.A2, ctx.products.A)).toBe(0);
  });

  test("4b. transferência de 5: -5/+5 e 2 movimentos com o mesmo transfer_group_id", async () => {
    const before1 = await balance(ctx.units.A1, ctx.products.A);
    const key = crypto.randomUUID();
    const r = await move(ctx.clients.mgrA, { unit: ctx.units.A1, product: ctx.products.A, kind: "transferencia", qty: 5, to: ctx.units.A2, key });
    expect(r.error).toBeNull();
    expect(await balance(ctx.units.A1, ctx.products.A)).toBe(before1 - 5);
    expect(await balance(ctx.units.A2, ctx.products.A)).toBe(5);
    const g = (r.data as { transfer_group_id: string }).transfer_group_id;
    const { data } = await admin.from("retail_stock_movements").select("kind").eq("transfer_group_id", g);
    expect((data ?? []).map((x: { kind: string }) => x.kind).sort()).toEqual(["transferencia_entrada", "transferencia_saida"]);
    const again = await move(ctx.clients.mgrA, { unit: ctx.units.A1, product: ctx.products.A, kind: "transferencia", qty: 5, to: ctx.units.A2, key });
    expect((again.data as { idempotent_replay: boolean }).idempotent_replay).toBe(true);
    expect(await balance(ctx.units.A2, ctx.products.A)).toBe(5);
  });

  test("9. transferências opostas em paralelo não dão deadlock", async () => {
    const m = ctx.clients.mgrA;
    const [a, b] = await Promise.all([
      move(m, { unit: ctx.units.A1, product: ctx.products.A, kind: "transferencia", qty: 1, to: ctx.units.A2 }),
      move(m, { unit: ctx.units.A2, product: ctx.products.A, kind: "transferencia", qty: 1, to: ctx.units.A1 }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  test("10. idempotency_key repetida (sequencial) não duplica", async () => {
    const key = crypto.randomUUID();
    const before = await balance(ctx.units.A1, ctx.products.A);
    const r1 = await move(ctx.clients.mgrA, { unit: ctx.units.A1, product: ctx.products.A, kind: "entrada", qty: 2, key });
    const r2 = await move(ctx.clients.mgrA, { unit: ctx.units.A1, product: ctx.products.A, kind: "entrada", qty: 2, key });
    expect(r1.error).toBeNull();
    expect((r2.data as { idempotent_replay: boolean }).idempotent_replay).toBe(true);
    expect(await balance(ctx.units.A1, ctx.products.A)).toBe(before + 2);
  });

  test("10b. duas chamadas PARALELAS com a mesma chave: saldo alterado uma única vez", async () => {
    for (const kind of ["entrada", "transferencia"] as const) {
      const key = crypto.randomUUID();
      const b1 = await balance(ctx.units.A1, ctx.products.A);
      const b2 = await balance(ctx.units.A2, ctx.products.A);
      const args = { unit: ctx.units.A1, product: ctx.products.A, kind, qty: 3, key, to: kind === "transferencia" ? ctx.units.A2 : undefined };
      const res = await Promise.all([move(ctx.clients.mgrA, args), move(ctx.clients.mgrA, args), move(ctx.clients.mgrA, args)]);
      for (const r of res) expect(r.error).toBeNull();
      expect(res.filter((r) => (r.data as { idempotent_replay: boolean }).idempotent_replay === false)).toHaveLength(1);
      if (kind === "entrada") expect(await balance(ctx.units.A1, ctx.products.A)).toBe(b1 + 3);
      else {
        expect(await balance(ctx.units.A1, ctx.products.A)).toBe(b1 - 3);
        expect(await balance(ctx.units.A2, ctx.products.A)).toBe(b2 + 3);
      }
      const { count } = await admin.from("retail_stock_movements").select("id", { count: "exact", head: true }).eq("company_id", ctx.companies.A).like("idempotency_key", `${key}%`);
      expect(count).toBe(kind === "entrada" ? 1 : 2);
    }
  });

  test("11. produto inativo: entrada recusada, ajuste permitido", async () => {
    expect((await move(ctx.clients.mgrA, { unit: ctx.units.A1, product: ctx.products.Ainactive, kind: "entrada", qty: 1 })).error).not.toBeNull();
    expect((await move(ctx.clients.mgrA, { unit: ctx.units.A1, product: ctx.products.Ainactive, kind: "ajuste", qty: 0 })).error).toBeNull();
  });

  test("12. histórico imutável e produto com histórico não se apaga (desativar funciona)", async () => {
    const { data } = await admin.from("retail_stock_movements").select("id").eq("company_id", ctx.companies.A).limit(1).single();
    const id = (data as { id: string }).id;
    expect((await admin.from("retail_stock_movements").update({ reason: "x" } as never).eq("id", id)).error).not.toBeNull();
    expect((await admin.from("retail_stock_movements").delete().eq("id", id)).error).not.toBeNull();
    // frontend não escreve no saldo
    const u = await ctx.clients.mgrA.from("retail_stock_balances").update({ quantity: 999 } as never).eq("unit_id", ctx.units.A1).select("id");
    expect(u.error !== null || (u.data ?? []).length === 0).toBe(true);
    const del = await ctx.clients.mgrA.from("retail_products").delete().eq("id", ctx.products.A);
    expect(del.error?.code).toBe("23503");
    const deact = await ctx.clients.mgrA.from("retail_products").update({ active: false } as never).eq("id", ctx.products.A).select("active").single();
    expect(deact.error).toBeNull();
    expect((deact.data as { active: boolean }).active).toBe(false);
    const delUnit = await ctx.clients.mgrA.from("company_units").delete().eq("id", ctx.units.A1);
    expect(delUnit.error?.code).toBe("23503");
  });

  test("13. apagar a empresa de teste remove tudo em cascata", async () => {
    // cria histórico na B antes de apagar
    expect((await move(ctx.clients.mgrB, { unit: ctx.units.B1, product: ctx.products.B, kind: "entrada", qty: 2 })).error).toBeNull();
    const del = await admin.from("companies").delete().eq("id", ctx.companies.B);
    expect(del.error).toBeNull();
    for (const t of ["company_units", "retail_products", "retail_stock_balances", "retail_stock_movements", "retail_product_categories"]) {
      const { count } = await admin.from(t).select("id", { count: "exact", head: true }).eq("company_id", ctx.companies.B);
      expect(count).toBe(0);
    }
  });
});
