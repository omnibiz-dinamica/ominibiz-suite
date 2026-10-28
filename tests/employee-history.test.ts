import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  filterHistoryByField,
  formatIban,
  historyFieldOptions,
  isValidIban,
  isValidSwift,
  maskIban,
  normalizeIban,
} from "../src/lib/employee-history";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const editor = read("../src/components/equipe/EmployeeEditor.tsx");
const historyTab = read("../src/components/equipe/EmployeeHistoryTab.tsx");
const team = read("../src/routes/app.equipe.tsx");
const bankCard = read("../src/components/perfil/BankDetailsCard.tsx");
const profilePage = read("../src/routes/app.perfil.tsx");

const events = [
  { id: "1", changes: { Funcionário: "Ana", "Valor Hora (€ / hora)": { de: 9, para: 10 } } },
  { id: "2", changes: { Funcionário: "Ana", IBAN: { de: "•••• 0154", para: "•••• 7034" } } },
  {
    id: "3",
    changes: {
      Funcionário: "Ana",
      "Valor Hora (€ / hora)": { de: 10, para: 11 },
      SWIFT: { de: null, para: "X" },
    },
  },
];

describe("histórico do funcionário", () => {
  test("o filtro por campo mostra só os eventos desse campo (ex.: quando passou a 10 €/h)", () => {
    expect(historyFieldOptions(events)).toEqual(["IBAN", "SWIFT", "Valor Hora (€ / hora)"]);
    expect(filterHistoryByField(events, "Valor Hora (€ / hora)").map((e) => e.id)).toEqual([
      "1",
      "3",
    ]);
    expect(filterHistoryByField(events, null)).toHaveLength(3);
  });

  test("a ficha tem a aba Histórico ligada ao funcionário e à empresa", () => {
    expect(editor).toMatch(/<TabsTrigger value="historico">Histórico<\/TabsTrigger>/);
    expect(editor).toMatch(/<EmployeeHistoryTab userId=\{userId\} companyId=\{companyId\} \/>/);
    expect(editor).toMatch(/queryKey: \["employee-history"\]/);
  });

  test("o histórico lê só eventos deste funcionário nesta empresa", () => {
    expect(historyTab).toMatch(/\.eq\("company_id", companyId\)/);
    expect(historyTab).toMatch(/\.eq\("entity_type", "employee"\)/);
    expect(historyTab).toMatch(/\.eq\("entity_id", userId\)/);
  });
});

describe("pedido de NIB/IBAN", () => {
  test("valida IBAN com dígitos de controlo, como o banco", () => {
    expect(isValidIban("PT50 0002 0123 1234 5678 9015 4")).toBe(true);
    expect(isValidIban("BE68 5390 0754 7034")).toBe(true);
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("PT50 0002 0123 1234 5678 9015 5")).toBe(false);
    expect(isValidIban("123")).toBe(false);
    expect(normalizeIban("be68 5390-0754.7034")).toBe("BE68539007547034");
    expect(formatIban("BE68539007547034")).toBe("BE68 5390 0754 7034");
  });

  test("SWIFT é opcional; IBAN aparece só com os últimos 4", () => {
    expect(isValidSwift("")).toBe(true);
    expect(isValidSwift("gkcc be bb")).toBe(true);
    expect(isValidSwift("XX")).toBe(false);
    expect(maskIban("PT50000201231234567890154")).toBe("•••• 0154");
    expect(maskIban(null)).toBe("—");
  });

  test("o funcionário pede pela RPC (não edita o IBAN direto) e pode cancelar", () => {
    expect(bankCard).toMatch(/"employee_bank_change_submit"/);
    expect(bankCard).toMatch(/"employee_bank_change_cancel"/);
    expect(bankCard).not.toMatch(/\.update\(/);
    expect(profilePage).toMatch(/<BankDetailsCard \/>/);
  });

  test("o gestor decide na Equipa; rejeitar exige motivo", () => {
    expect(team).toMatch(/"employee_bank_change_decide"/);
    expect(team).toMatch(/Motivo da rejeição \(obrigatório\)/);
    expect(team).toMatch(/id="pedidos-nib"/);
  });
});
