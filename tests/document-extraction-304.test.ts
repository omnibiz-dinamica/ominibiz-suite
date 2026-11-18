import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  EMPTY_FILTERS,
  extractionIndexCsv,
  planExtraction,
  selectForExtraction,
  type ExtractionProfile,
} from "../src/lib/document-extraction";
import type { EmployeeAttachment } from "../src/lib/employee-attachments";

const att = (
  id: string,
  profile_id: string,
  category: string,
  file_name: string,
  extra: Partial<EmployeeAttachment> = {},
) =>
  ({
    id,
    profile_id,
    company_id: "c",
    category,
    file_name,
    storage_path: `c/${profile_id}/${id}`,
    uploaded_at: "2026-03-10T10:00:00Z",
    ...extra,
  }) as EmployeeAttachment;

const profiles: ExtractionProfile[] = [
  {
    id: "a",
    full_name: "Ana Maria Silva",
    job_title: "Life Tidy",
    sector: "COIFAS",
    team_number: 1,
    hire_date: "2025-01-10",
  },
  {
    id: "b",
    full_name: "Bruno Costa",
    job_title: "Tokmagico",
    sector: "RK",
    team_number: 2,
    hire_date: "2026-02-01",
  },
  {
    id: "c",
    full_name: "Carla Dias",
    job_title: "life tidy",
    is_active: false,
    hire_date: "2024-05-01",
  },
];
const attachments = [
  att("1", "a", "tr", "scan001.PDF"),
  att("2", "a", "tr", "verso.jpg"),
  att("3", "b", "tr", "tr.pdf"),
  att("4", "a", "work_contract", "contrato.pdf", { signed_storage_path: "c/a/4-assinado.pdf" }),
  att("5", "c", "tr", "x.pdf"),
];

describe("SUP-304 — extração de documentos", () => {
  test("todos os títulos de residência da Life: nome completo no arquivo, sem inativos", () => {
    const sel = selectForExtraction(
      { profiles, attachments },
      { ...EMPTY_FILTERS, categories: ["tr"], employer: "Life Tidy" },
    );
    expect(sel.entries.map((e) => e.zipPath)).toEqual([
      "Ana Maria Silva - Titulo de Residencia.pdf",
      "Ana Maria Silva - Titulo de Residencia.jpg",
    ]);
  });

  test("inativos só quando pedido; filtros de admissão e carregamento", () => {
    const withInactive = selectForExtraction(
      { profiles, attachments },
      { ...EMPTY_FILTERS, categories: ["tr"], employer: "life tidy", includeInactive: true },
    );
    expect(withInactive.entries.some((e) => e.employee === "Carla Dias")).toBe(true);
    const hired2026 = selectForExtraction(
      { profiles, attachments },
      { ...EMPTY_FILTERS, hireFrom: "2026-01-01" },
    );
    expect([...new Set(hired2026.entries.map((e) => e.employee))]).toEqual(["Bruno Costa"]);
    const none = selectForExtraction(
      { profiles, attachments },
      { ...EMPTY_FILTERS, uploadedFrom: "2026-04-01" },
    );
    expect(none.entries).toHaveLength(0);
  });

  test("cópia assinada e nomes repetidos", () => {
    const plan = planExtraction(
      [
        att("1", "a", "tr", "a.pdf"),
        att("2", "a", "tr", "b.pdf"),
        att("4", "a", "work_contract", "c.pdf", { signed_storage_path: "s" }),
      ],
      () => "Ana",
      true,
    );
    expect(plan.map((e) => e.zipPath)).toEqual([
      "Ana - Titulo de Residencia.pdf",
      "Ana - Titulo de Residencia (2).pdf",
      "Ana - Contrato de Trabalho.pdf",
      "Ana - Contrato de Trabalho - assinado.pdf",
    ]);
    expect(extractionIndexCsv(plan)).toContain(
      "Ana - Contrato de Trabalho - assinado.pdf;Ana;Contrato de Trabalho;c.pdf;2026-03-10;Sim",
    );
  });

  test("botão na Equipe", () => {
    expect(readFileSync("src/routes/app.equipe.tsx", "utf8")).toContain("Extrair documentos");
  });
});
