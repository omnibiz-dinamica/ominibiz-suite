import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { normalizePhone } from "../src/lib/messages/phone";
import { parseContactsCsv } from "../src/lib/messages/csv";
import { messagesAccess, MESSAGES_ALLOWED_ROLES } from "../src/lib/messages/permissions";
import { resolveAvailableNavigation, type NavContext } from "../src/lib/navigation";
import { MODULE_CATALOG, ROUTE_MODULES } from "../src/lib/locale";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const ctx = (
  role: NavContext["effectiveRole"],
  modules: NavContext["enabledModules"],
): NavContext => ({
  effectiveRole: role,
  isSuperAdmin: role === "super_admin",
  companyId: "c1",
  vertical: "cleaning_services" as NavContext["vertical"],
  enabledModules: modules,
  employeeHasVehicle: false,
  contextReady: true,
});
const paths = (c: NavContext) =>
  resolveAvailableNavigation(c).groups.flatMap((g) => g.items.map((i) => i.to));

test("whatsapp_ai continua adicional pago, desligado por padrão", () => {
  assert.equal(MODULE_CATALOG.whatsapp_ai.included, false);
  assert.ok(
    ROUTE_MODULES.some((r) => r.prefix === "/app/assistente" && r.module === "whatsapp_ai"),
  );
});

test("menu: Mensagens só aparece com o adicional ativo e nunca para employee/accountant", () => {
  for (const role of ["owner", "manager", "secretary"] as const) {
    assert.ok(
      paths(ctx(role, ["core", "whatsapp_ai"])).includes("/app/assistente"),
      `${role} com adicional`,
    );
    assert.ok(!paths(ctx(role, ["core"])).includes("/app/assistente"), `${role} sem adicional`);
  }
  assert.ok(paths(ctx("super_admin", ["core", "whatsapp_ai"])).includes("/app/assistente"));
  for (const role of ["employee", "accountant"] as const) {
    assert.ok(!paths(ctx(role, ["core", "whatsapp_ai"])).includes("/app/assistente"), role);
  }
});

test("menu: item Mensagens sem 'em breve'", () => {
  const nav = read("src/lib/navigation.ts");
  assert.match(
    nav,
    /to: "\/app\/assistente", label: "Mensagens", icon: MessageSquare, module: "whatsapp_ai" \}/,
  );
  assert.doesNotMatch(nav, /\/app\/assistente[^\n]*soon: true/);
  assert.match(read("src/i18n/locales/en.ts"), /"Mensagens": "Messages"/);
});

test("rota: URL direta protegida por ModuleGuard (whatsapp_ai) e RoleGuard", () => {
  const route = read("src/routes/app.assistente.tsx");
  assert.match(route, /<ModuleGuard module="whatsapp_ai">/);
  assert.match(route, /<RoleGuard allow=\{MESSAGES_ALLOWED_ROLES\}>/);
  assert.doesNotMatch(route, /ComingSoon/);
  assert.deepEqual([...MESSAGES_ALLOWED_ROLES].sort(), [
    "manager",
    "owner",
    "secretary",
    "super_admin",
  ]);
});

test("papéis: secretary só vê contatos; employee/accountant sem acesso", () => {
  assert.deepEqual(messagesAccess("owner"), {
    canOpen: true,
    canManage: true,
    canViewContacts: true,
  });
  assert.deepEqual(messagesAccess("manager"), {
    canOpen: true,
    canManage: true,
    canViewContacts: true,
  });
  assert.deepEqual(messagesAccess("super_admin"), {
    canOpen: true,
    canManage: true,
    canViewContacts: true,
  });
  assert.deepEqual(messagesAccess("secretary"), {
    canOpen: true,
    canManage: false,
    canViewContacts: true,
  });
  assert.deepEqual(messagesAccess("employee"), {
    canOpen: false,
    canManage: false,
    canViewContacts: false,
  });
  assert.deepEqual(messagesAccess("accountant"), {
    canOpen: false,
    canManage: false,
    canViewContacts: false,
  });
  assert.deepEqual(messagesAccess(null), {
    canOpen: false,
    canManage: false,
    canViewContacts: false,
  });
});

test("telefone: normaliza para E.164 e recusa sem código do país", () => {
  assert.deepEqual(normalizePhone("+351 912 345 678"), { ok: true, phone: "+351912345678" });
  assert.deepEqual(normalizePhone("0055 (11) 98765-4321"), { ok: true, phone: "+5511987654321" });
  assert.deepEqual(normalizePhone("+32 470.12.34.56"), { ok: true, phone: "+32470123456" });
  assert.deepEqual(normalizePhone(""), { ok: true, phone: null });
  assert.equal(normalizePhone("912345678").ok, false);
  assert.equal(normalizePhone("+0123456789").ok, false);
  assert.equal(normalizePhone("+35191234567890123").ok, false);
});

test("CSV: cabeçalho, separador ';', aspas, duplicados e erros", () => {
  const csv = [
    "Nome;Telefone;E-mail",
    "Ana;+351 912 345 678;ana@x.pt",
    '"Silva, João";+5511987654321;',
    "Repetida;00351912345678;",
    "Já existe;+32470123456;",
    "Sem país;912000000;",
    ";+351911111111;",
    "Mail mau;+351922222222;nao-e-email",
    "Sem telefone;;sem@tel.pt",
    "",
  ].join("\r\n");
  const r = parseContactsCsv(csv, ["+32470123456"]);
  assert.deepEqual(
    r.valid.map((v) => [v.name, v.phone, v.email]),
    [
      ["Ana", "+351912345678", "ana@x.pt"],
      ["Silva, João", "+5511987654321", null],
      ["Sem telefone", null, "sem@tel.pt"],
    ],
  );
  assert.deepEqual(
    r.duplicates.map((d) => d.line),
    [4, 5],
  );
  assert.deepEqual(
    r.errors.map((e) => e.line),
    [6, 7, 8],
  );
});

test("CSV: sem cabeçalho usa a ordem nome, telefone, e-mail", () => {
  const r = parseContactsCsv("Rui,+351933333333,rui@x.pt\n");
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].phone, "+351933333333");
});

test("dados: todas as consultas msg_* filtram por company_id e a página não acede ao Supabase", () => {
  const api = read("src/lib/messages/api.ts");
  const calls = api.match(/db\s*\.from\("msg_[a-z_]+"\)[\s\S]*?\);/g) ?? [];
  assert.ok(calls.length >= 15, `encontradas ${calls.length} chamadas`);
  for (const call of calls) assert.match(call, /company_id/, call.slice(0, 80));
  for (const f of readdirSync(new URL("../src/components/messages/", import.meta.url))) {
    assert.doesNotMatch(read(`src/components/messages/${f}`), /integrations\/supabase/, f);
  }
});

test("secretary não vê botões de edição de contatos nem as abas de gestão", () => {
  const page = read("src/components/messages/MessagesPage.tsx");
  assert.match(
    page,
    /access\.canManage\s*\?\s*\[[\s\S]*"Automações"[\s\S]*\]\s*:\s*\[\{ key: "contatos", label: "Contatos" \}\]/,
  );
  const contacts = read("src/components/messages/ContactsTab.tsx");
  assert.match(contacts, /\{canManage \? \(\s*<div className="flex gap-2">[\s\S]*Importar CSV/);
});
