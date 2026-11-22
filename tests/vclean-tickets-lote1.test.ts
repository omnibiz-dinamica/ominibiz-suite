import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { destinationsForCompany, type SupportDestination } from "../src/lib/support/destinations";
import { readSource } from "./helpers/read-source";

const read = (p: string) => readSource(p, "utf8");
const dest = (code: string, company_id: string | null = null): SupportDestination => ({
  code,
  label: code,
  description: "",
  icon: "Users",
  target_role: null,
  is_technical: false,
  sort_order: 1,
  is_active: true,
  company_id,
});

describe("18/11 — tickets V-clean, lote 1", () => {
  test("SUP-310: Léa/Luc só aparecem na empresa deles", () => {
    const list = [dest("tech"), dest("lea", "vclean"), dest("luc", "vclean")];
    expect(destinationsForCompany(list, "vclean").map((d) => d.code)).toEqual([
      "tech",
      "lea",
      "luc",
    ]);
    expect(destinationsForCompany(list, "outra").map((d) => d.code)).toEqual(["tech"]);
    expect(read("src/routes/app.suporte.$id.tsx")).toContain(
      "destinationsForCompany(destinations, t.company_id)",
    );
    expect(read("src/components/support/NewTicketDialog.tsx")).toContain(
      "destinationsForCompany(destinations, currentCompanyId)",
    );
  });

  test("SUP-205: lista da Central mostra quem abriu", () => {
    const page = read("src/routes/app.suporte.tsx");
    expect(page).toContain("requester_user_id, created_by_role");
    expect(page).toContain("Aberto por {requesterName(t)}");
  });

  test("SUP-324: filtros de funcionário têm 'Limpar seleção'", () => {
    const picker = read("src/components/common/EmployeePicker.tsx");
    expect(picker).toContain('data-testid="employee-picker-clear"');
    expect(picker).toContain('onChange("")');
    for (const p of [
      "src/routes/app.despesas.tsx",
      "src/routes/app.ferias.tsx",
      "src/routes/app.ponto_.gestao.tsx",
    ]) {
      expect(read(p)).toMatch(/clearable/);
    }
  });

  test("SUP-318: série — por omissão 'esta e as futuras', hora sincronizada, aviso na edição", () => {
    const dlg = read("src/components/tasks/EditRecurrenceDialog.tsx");
    expect(dlg).toContain('useState<ReassignScope>("future")');
    expect(dlg).toContain("setScheduledTime(e.target.value.slice(11, 16))");
    expect(dlg).toContain('"Salvar esta e as futuras"');
    const form = read("src/components/tasks/page/task-form.tsx");
    expect(form).toContain('data-testid="series-occurrence-note"');
    expect(read("src/routes/app.tarefas.tsx")).toContain("setEditingSeries(row);");
  });

  test("SQL: 298, 310, 236, 330 com guardas e cópia", () => {
    const sql = read("docs/sql/suporte_tarefas_20261118_aplicar.sql");
    expect(sql).toContain("_support_dest_reaches_managers");
    expect(sql).toContain("('lea', 'Léa'");
    expect(sql).toContain("O seu ticket foi encaminhado");
    expect(sql).toContain("t.scheduled_for + interval ''24 hours''");
    expect(sql).toContain("RAISE EXCEPTION 'PARAR: este script já foi aplicado.");
  });
});
