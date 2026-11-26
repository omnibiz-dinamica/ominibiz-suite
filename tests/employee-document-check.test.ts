import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  checkAgainstProfile,
  guessCategoryFromName,
  isAnalyzable,
  nameLooksLikeSamePerson,
  normalizeDocNumber,
  profileFieldsFor,
} from "../src/lib/documents/document-check";
import { __test, type DocumentReading } from "../src/lib/documents/analyze-document.functions";

const reading = (p: Partial<DocumentReading> = {}): DocumentReading => ({
  document_type: "tr",
  document_number: "B 123 456 789",
  expiry_date: "2030-05-01",
  full_name: "Jessica Oliveira Gomes",
  birth_date: null,
  nationality: null,
  issuing_country: "BE",
  confidence: "high",
  notes: null,
  ...p,
});
const TODAY = "2026-11-26";

describe("tipo sugerido pelo nome do arquivo", () => {
  test("reconhece títulos de residência, CC, passaporte, carta, A1, contrato", () => {
    expect(guessCategoryFromName("Titulo_de_residencia_frente.jpg")).toBe("tr");
    expect(guessCategoryFromName("verblijfstitel.pdf")).toBe("tr");
    expect(guessCategoryFromName("Cartão de Cidadão.pdf")).toBe("cc");
    expect(guessCategoryFromName("passport-scan.png")).toBe("passport");
    expect(guessCategoryFromName("rijbewijs.jpg")).toBe("driver_license");
    expect(guessCategoryFromName("foto123.jpg")).toBeNull();
  });
  test("só os tipos com número na ficha são analisáveis", () => {
    for (const c of ["cc", "tr", "passport", "driver_license", "a1", "health_card"]) expect(isAnalyzable(c)).toBe(true);
    expect(isAnalyzable("work_contract")).toBe(false);
    expect(isAnalyzable("other")).toBe(false);
  });
  test("CC e TR usam o documento principal da ficha", () => {
    expect(profileFieldsFor("tr")).toMatchObject({ number: "main_doc_number", mainDocType: "TR" });
    expect(profileFieldsFor("cc")).toMatchObject({ number: "main_doc_number", mainDocType: "CC" });
    expect(profileFieldsFor("passport").number).toBe("passport_number");
  });
});

describe("conferência com a ficha", () => {
  test("número igual ignora espaços, pontos e maiúsculas", () => {
    expect(normalizeDocNumber(" b-123.456 789 ")).toBe(normalizeDocNumber("B123456789"));
    const c = checkAgainstProfile(
      "tr",
      reading(),
      { main_doc_type: "TR", main_doc_number: "b123456789", main_doc_expires_at: "2030-05-01", full_name: "Jessica Gomes" },
      TODAY,
    );
    expect(c.number.kind).toBe("same");
    expect(c.proposedPatch).toBeNull();
    expect(c.name).toBe(true);
  });
  test("ficha sem número → propõe gravar número, validade e tipo TR", () => {
    const c = checkAgainstProfile("tr", reading(), { main_doc_type: "CC", full_name: "Jessica Gomes" }, TODAY);
    expect(c.number.kind).toBe("missing_in_profile");
    expect(c.proposedPatch).toEqual({
      main_doc_number: "B 123 456 789",
      main_doc_expires_at: "2030-05-01",
      main_doc_type: "TR",
    });
  });
  test("número diferente → avisa e propõe; nunca grava sozinho", () => {
    const c = checkAgainstProfile("passport", reading({ document_type: "passport", document_number: "CB998877" }), {
      passport_number: "CA112233",
      passport_expires_at: "2030-05-01",
    }, TODAY);
    expect(c.number).toEqual({ kind: "different", profileNumber: "CA112233", documentNumber: "CB998877" });
    expect(c.proposedPatch).toEqual({ passport_number: "CB998877" });
  });
  test("número ilegível → não propõe número", () => {
    const c = checkAgainstProfile("tr", reading({ document_number: null, expiry_date: null }), { main_doc_number: "X1" }, TODAY);
    expect(c.number.kind).toBe("not_read");
    expect(c.proposedPatch).toBeNull();
  });
  test("documento caducado e tipo trocado são assinalados", () => {
    const c = checkAgainstProfile("cc", reading({ expiry_date: "2025-01-01" }), {}, TODAY);
    expect(c.expiry.expired).toBe(true);
    expect(c.typeMismatch).toBe(true);
  });
  test("nome de outra pessoa é detetado", () => {
    expect(nameLooksLikeSamePerson("Maria Silva", "Jessica Oliveira Gomes")).toBe(false);
    expect(nameLooksLikeSamePerson("GOMES, Jéssica", "Jessica Oliveira Gomes")).toBe(true);
    expect(nameLooksLikeSamePerson(null, "Jessica")).toBeNull();
  });
});

describe("servidor: entrada, permissão e leitura da IA", () => {
  const cid = "11111111-1111-1111-1111-111111111111";
  const pid = "22222222-2222-2222-2222-222222222222";
  const img = "data:image/jpeg;base64,AAAA";
  test("valida entrada", () => {
    expect(__test.validate({ companyId: cid, profileId: pid, images: [img] }).images).toHaveLength(1);
    expect(() => __test.validate({ companyId: "x", profileId: pid, images: [img] })).toThrow();
    expect(() => __test.validate({ companyId: cid, profileId: pid, images: [] })).toThrow();
    expect(() => __test.validate({ companyId: cid, profileId: pid, images: ["data:text/html;base64,AA"] })).toThrow();
    expect(() => __test.validate({ companyId: cid, profileId: pid, images: [img, img, img, img] })).toThrow();
  });
  test("só Super Admin ou Owner/Manager da própria empresa", () => {
    expect(__test.canAnalyze([{ role: "super_admin", company_id: null }], cid)).toBe(true);
    expect(__test.canAnalyze([{ role: "manager", company_id: cid }], cid)).toBe(true);
    expect(__test.canAnalyze([{ role: "owner", company_id: cid }], cid)).toBe(true);
    expect(__test.canAnalyze([{ role: "manager", company_id: pid }], cid)).toBe(false);
    expect(__test.canAnalyze([{ role: "employee", company_id: cid }], cid)).toBe(false);
    expect(__test.canAnalyze([{ role: "secretary", company_id: cid }], cid)).toBe(false);
  });
  test("lê JSON mesmo com texto à volta e descarta valores inválidos", () => {
    const r = __test.parseReading(
      'Aqui está:\n```json\n{"document_type":"tr","document_number":" B123 ","expiry_date":"01/05/2030","confidence":"x"}\n```',
    );
    expect(r.document_type).toBe("tr");
    expect(r.document_number).toBe("B123");
    expect(r.expiry_date).toBeNull();
    expect(r.confidence).toBe("low");
    expect(() => __test.parseReading("sem json")).toThrow();
  });
});

describe("interface dos anexos", () => {
  const ui = readFileSync("src/components/equipe/AttachmentUploadQueue.tsx", "utf8");
  const tab = readFileSync("src/components/equipe/EmployeeAttachmentsTab.tsx", "utf8");
  test("aceita vários arquivos e grava cada um com o seu tipo", () => {
    expect(ui).toContain("multiple");
    expect(ui).toContain("category: it.category");
    expect(tab).toContain("<AttachmentUploadQueue");
  });
  test("análise só quando o gestor clica; ficha só muda após confirmar", () => {
    expect(ui).toContain('data-testid="attachment-analyze"');
    expect(ui).toMatch(/if \(!confirm\(`Atualizar a ficha/);
    expect(ui).not.toMatch(/useEffect\([^)]*analyze/);
  });
});
