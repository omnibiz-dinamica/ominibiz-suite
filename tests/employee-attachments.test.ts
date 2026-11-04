import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

mock.module("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => ({}) } }));

const {
  attachmentStatusLabel,
  chooseSignaturePlacement,
  isPdfAttachment,
  isPendingForEmployee,
  pngAspect,
  reachedEnd,
  signedCopyPath,
  stampSignature,
} = await import("../src/lib/employee-attachments");
const { planZipEntries, profileColumns, profilesSheet, safeName } =
  await import("../src/lib/employee-export");

const A4 = [{ page: 1, width: 595, height: 842 }];
const item = (str: string, x: number, y: number, w = 100, page = 1) => ({
  page,
  str,
  x,
  y,
  w,
  h: 10,
});
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// PNG 1x1 transparente
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("onde pôr a assinatura no PDF", () => {
  test("linha ____ na mesma linha de 'Assinatura'", () => {
    const p = chooseSignaturePlacement(
      [
        item("Assinatura do funcionário:", 72, 120, 130),
        item("____________________", 210, 120, 160),
      ],
      A4,
      3,
    );
    expect(p).toMatchObject({ page: 1, x: 210, y: 122, found: "line" });
  });

  test("linha por cima da palavra (linha e, por baixo, 'Assinatura')", () => {
    const p = chooseSignaturePlacement(
      [item("______________________", 300, 140, 180), item("Assinatura", 330, 125, 60)],
      A4,
      3,
    );
    expect(p).toMatchObject({ x: 300, y: 142, found: "line" });
  });

  test("usa a última 'Assinatura' (a do funcionário costuma ser a última)", () => {
    const p = chooseSignaturePlacement(
      [
        item("Assinatura do empregador: ____________", 72, 700, 250, 1),
        item("Assinatura do trabalhador:", 72, 200, 140, 2),
        item("______________", 220, 200, 120, 2),
      ],
      [...A4, { page: 2, width: 595, height: 842 }],
      3,
    );
    expect(p).toMatchObject({ page: 2, x: 220, found: "line" });
  });

  test("só a palavra: à direita dela", () => {
    const p = chooseSignaturePlacement([item("Assinatura:", 72, 150, 60)], A4, 3);
    expect(p).toMatchObject({ x: 140, found: "label" });
    expect(p.x + p.width).toBeLessThanOrEqual(595);
  });

  test("palavra no fim da linha: por cima, sem sair da página", () => {
    const p = chooseSignaturePlacement([item("Assinatura", 500, 150, 60)], A4, 3);
    expect(p.found).toBe("label");
    expect(p.x + p.width).toBeLessThanOrEqual(595);
    expect(p.y).toBeGreaterThan(150);
  });

  test("só a linha ____: em cima da última linha", () => {
    const p = chooseSignaturePlacement([item("______________", 100, 90, 120)], A4, 3);
    expect(p).toMatchObject({ x: 100, y: 92, found: "underline" });
  });

  test("sem nada (PDF digitalizado): fim da última página", () => {
    const p = chooseSignaturePlacement([], [...A4, { page: 2, width: 595, height: 842 }], 3);
    expect(p).toMatchObject({ page: 2, y: 56, found: "fallback" });
    expect(p.x + p.width).toBeLessThanOrEqual(595);
  });

  test("tamanho respeita a proporção da imagem", () => {
    const p = chooseSignaturePlacement([], A4, 2);
    expect(p.width).toBe(150);
    expect(p.height).toBe(55);
    expect(pngAspect(PNG)).toBe(1);
  });
});

describe("carimbar a assinatura", () => {
  test("gera um PDF válido, com a imagem, sem alterar o original", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([595, 842]);
    const original = await doc.save();
    const copy = original.slice();
    const out = await stampSignature(
      original,
      PNG,
      { page: 2, x: 100, y: 80, width: 150, height: 50, found: "fallback" },
      "Assinado digitalmente por Ana em 04/11/2026 22:00",
    );
    expect(Buffer.from(original).equals(Buffer.from(copy))).toBe(true);
    const back = await PDFDocument.load(out);
    expect(back.getPageCount()).toBe(2);
    expect(out.byteLength).toBeGreaterThan(original.byteLength);
  });

  test("PDF danificado: mensagem clara", async () => {
    await expect(
      stampSignature(
        new Uint8Array([1, 2, 3]),
        PNG,
        { page: 1, x: 0, y: 0, width: 10, height: 10, found: "fallback" },
        "x",
      ),
    ).rejects.toThrow("Não foi possível abrir este PDF para assinar");
  });

  test("cópia assinada vai para a pasta do funcionário, termina em .pdf e não substitui o original", () => {
    const a = { company_id: "c1", profile_id: "u1", file_name: "Contrato de Trabalho (v2).PDF" };
    const p = signedCopyPath(a, 123);
    expect(p).toBe("c1/u1/123-assinado-Contrato_de_Trabalho_v2_.pdf");
    expect(p.startsWith("c1/u1/")).toBe(true);
    expect(p).not.toContain("..");
  });
});

describe("estado dos anexos", () => {
  const base = {
    id: "a",
    profile_id: "u1",
    company_id: "c1",
    category: "other",
    file_name: "x.pdf",
    storage_path: "c1/u1/x.pdf",
    mime_type: "application/pdf",
    uploaded_at: "2026-11-04T10:00:00Z",
  };
  test("textos para o gestor", () => {
    expect(attachmentStatusLabel({ ...base, employee_visible: false })).toBe("Só gestão");
    expect(
      attachmentStatusLabel({
        ...base,
        employee_visible: true,
        employee_action: "view",
        employee_status: "pending",
      }),
    ).toBe("Aguarda leitura");
    expect(
      attachmentStatusLabel({
        ...base,
        employee_visible: true,
        employee_action: "sign",
        employee_status: "pending",
      }),
    ).toBe("Aguarda assinatura");
    expect(
      attachmentStatusLabel({
        ...base,
        employee_visible: true,
        employee_status: "signed",
        signed_at: "2026-11-04T10:00:00Z",
      }),
    ).toMatch(/^Assinado em /);
  });
  test("pendente só para o próprio, marcado e pendente", () => {
    expect(
      isPendingForEmployee({ ...base, employee_visible: true, employee_status: "pending" }, "u1"),
    ).toBe(true);
    expect(
      isPendingForEmployee({ ...base, employee_visible: true, employee_status: "viewed" }, "u1"),
    ).toBe(false);
    expect(isPendingForEmployee({ ...base, employee_visible: false }, "u1")).toBe(false);
    expect(isPendingForEmployee({ ...base, employee_visible: true }, "u2")).toBe(false);
  });
  test("assinar só em PDF", () => {
    expect(isPdfAttachment({ mime_type: "application/pdf", file_name: "a" })).toBe(true);
    expect(isPdfAttachment({ mime_type: null, file_name: "a.PDF" })).toBe(true);
    expect(isPdfAttachment({ mime_type: "image/jpeg", file_name: "a.jpg" })).toBe(false);
  });
  test("botão Lido/Assinar só no fim do documento", () => {
    expect(reachedEnd({ scrollTop: 0, clientHeight: 500, scrollHeight: 2000 })).toBe(false);
    expect(reachedEnd({ scrollTop: 1480, clientHeight: 500, scrollHeight: 2000 })).toBe(true);
    expect(reachedEnd({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })).toBe(true);
  });
});

describe("exportação Excel", () => {
  const p1 = {
    id: "u1",
    full_name: "Ana",
    iban: "PT50",
    is_active: true,
    company_roles: ["employee"],
    signature_url: "s.png",
    initials_url: "i.png",
    campo_novo: "x",
  };
  test("sem assinatura/visto; nomes legíveis; colunas novas no fim", () => {
    const cols = profileColumns([p1]);
    expect(cols.some(([k]) => k === "signature_url" || k === "initials_url" || k === "id")).toBe(
      false,
    );
    expect(cols[cols.length - 1]).toEqual(["campo_novo", "campo_novo"]);
    const sheet = profilesSheet([p1]);
    const head = sheet[0];
    const row = sheet[1];
    expect(row[head.indexOf("Nome completo")]).toBe("Ana");
    expect(row[head.indexOf("IBAN")]).toBe("PT50");
    expect(row[head.indexOf("Ativo")]).toBe("Sim");
    expect(row[head.indexOf("Papel na empresa")]).toBe("Funcionário");
  });
  test("anexos no zip: pasta por funcionário, cópia assinada e nomes sem repetir", () => {
    const att = (id: string, file: string, signed?: string) => ({
      id,
      profile_id: "u1",
      company_id: "c",
      category: "other",
      file_name: file,
      storage_path: `c/u1/${id}`,
      mime_type: null,
      uploaded_at: "2026-11-04T10:00:00Z",
      signed_storage_path: signed ?? null,
    });
    const e = planZipEntries(
      [att("1", "contrato.pdf", "c/u1/s.pdf"), att("2", "contrato.pdf")],
      () => "Ana Gonçalves",
    );
    expect(e.map((x) => x.path)).toEqual([
      "anexos/Ana Goncalves/contrato.pdf",
      "anexos/Ana Goncalves/assinado - contrato.pdf",
      "anexos/Ana Goncalves/contrato (2).pdf",
    ]);
    expect(e[1].bucketPath).toBe("c/u1/s.pdf");
    expect(safeName('a/b:c*"?')).toBe("a_b_c_");
  });
});

describe("telas", () => {
  test("ficha do gestor sem a aba Assinaturas; Anexos nova; exportar", () => {
    const ed = read("../src/components/equipe/EmployeeEditor.tsx");
    expect(ed).not.toMatch(/value="sig"/);
    expect(ed).not.toMatch(/employee-signatures/);
    expect(ed).toMatch(/<EmployeeAttachmentsTab /);
    expect(ed).toMatch(/exportEmployees\(\{ companyId, profileId: userId \}\)/);
  });
  test("Histórico com sub-aba Anotações separada", () => {
    const h = read("../src/components/equipe/EmployeeHistoryTab.tsx");
    expect(h).toMatch(/Histórico do sistema/);
    expect(h).toMatch(/<EmployeeNotesPanel /);
  });
  test("modal de documentos pendentes no layout; aviso abre a ficha nos Anexos", () => {
    expect(read("../src/components/AppLayout.tsx")).toMatch(
      /<PendingDocumentsModal userId=\{user\.id\} companyId=\{currentCompanyId\} \/>/,
    );
    const eq = read("../src/routes/app.equipe.tsx");
    expect(eq).toMatch(/setEditingTab\("anx"\)/);
    expect(eq).toMatch(/Exportar todos \(Excel\)/);
    expect(read("../src/routes/app.contabilidade.folhas-ponto.tsx")).toMatch(
      /exportEmployees\(\{ companyId: currentCompanyId \}\)/,
    );
    expect(read("../src/routes/app.notificacoes.tsx")).toMatch(
      /employee_document_signed: "Documento assinado"/,
    );
  });
});
