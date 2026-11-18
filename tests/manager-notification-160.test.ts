import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { validateManagerNotification } from "../src/components/notifications/NewManagerNotificationDialog";

const base = {
  companyId: "c",
  userIds: ["u1"],
  title: "Atualizar título",
  body: "",
  priority: "media" as const,
  forwardTo: "",
};

describe("SUP-160 — gestor cria notificações", () => {
  test("validação no ecrã", () => {
    expect(validateManagerNotification(base)).toBeNull();
    expect(validateManagerNotification({ ...base, title: "ab" })).toContain("título");
    expect(validateManagerNotification({ ...base, userIds: [], forwardTo: "" })).toContain(
      "pelo menos uma pessoa",
    );
    expect(validateManagerNotification({ ...base, userIds: [], forwardTo: "Léa" })).toBeNull();
    expect(validateManagerNotification({ ...base, body: "x".repeat(2001) })).toContain("2000");
  });

  test("botão, tipo e tradução", () => {
    const page = readFileSync("src/routes/app.notificacoes.tsx", "utf8");
    expect(page).toContain("Nova notificação");
    expect(page).toContain('manager_message: "Mensagem da gestão"');
    for (const l of ["nl", "en", "fr"]) {
      expect(readFileSync(`src/i18n/locales/${l}.ts`, "utf8")).toContain('"Mensagem da gestão"');
    }
  });

  test("SQL: só gestão, valida empresa, 2 passos, encaminhamento", () => {
    const sql = readFileSync("docs/sql/gestor_notificacoes_20261118_aplicar.sql", "utf8");
    expect(sql).toContain("Só a gestão pode enviar notificações.");
    expect(sql).toContain("ur.user_id = v_target AND ur.company_id = _company_id");
    expect(sql).toContain("corra primeiro o passo 1");
    expect(sql).toContain("'encaminhada', now(), v_uid, v_forward");
  });
});
