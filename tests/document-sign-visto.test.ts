import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import {
  chooseSignaturePlacement,
  placementAtPoint,
  stampSignature,
  vistoPlacements,
  type SignaturePlacement,
} from "../src/lib/employee-attachments";

const A4 = { width: 595.2, height: 841.8 };
const pages = [1, 2, 3, 4, 5, 6].map((page) => ({ page, ...A4 }));
// PNG 1x1 transparente
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("18/11 — assinar documento: local escolhido e visto em cada página", () => {
  test("PDF digitalizado (sem texto) = fallback → o ecrã exige escolher o local", () => {
    expect(chooseSignaturePlacement([], pages, 3).found).toBe("fallback");
  });

  test("toque na página: caixa centrada no ponto, dentro da página, sem deformar", () => {
    const p = placementAtPoint(pages[5], 300, 200, 3);
    expect(p.page).toBe(6);
    expect(p.x + p.width / 2).toBeCloseTo(300);
    expect(p.y + p.height / 2).toBeCloseTo(200);
    expect(p.width / p.height).toBeCloseTo(3);
    const corner = placementAtPoint(pages[0], 2, 2, 3);
    expect(corner.x).toBeGreaterThanOrEqual(4);
    expect(corner.y).toBeGreaterThanOrEqual(4);
    const tall = placementAtPoint(pages[0], 300, 300, 1);
    expect(tall.width / tall.height).toBeCloseTo(1);
  });

  test("visto em todas as páginas; foge da assinatura na mesma página", () => {
    const sig: SignaturePlacement = {
      page: 6,
      x: 400,
      y: 10,
      width: 150,
      height: 50,
      found: "label",
    };
    const v = vistoPlacements(pages, sig, 2);
    expect(v.map((x) => x.page)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(v[0].x).toBeGreaterThan(A4.width / 2); // canto inferior direito
    expect(v[5].x).toBe(20); // página da assinatura: canto esquerdo
    expect(v[0].width / v[0].height).toBeCloseTo(2);
  });

  test("PDF assinado tem a assinatura e o visto em cada página", async () => {
    const src = await PDFDocument.create();
    for (let i = 0; i < 3; i++) src.addPage([A4.width, A4.height]);
    const bytes = await src.save();
    const three = pages.slice(0, 3);
    const sig = placementAtPoint(three[2], 300, 150, 3);
    const out = await stampSignature(bytes, PNG, sig, "Assinado digitalmente por Teste", {
      png: PNG,
      placements: vistoPlacements(three, sig, 2),
    });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    // imagens por página: visto em todas; na última também a assinatura
    const images = doc.getPages().map((pg) => {
      const xo = pg.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
      return xo ? xo.keys().length : 0;
    });
    expect(images).toEqual([1, 1, 2]);
  });

  test("ecrã e banco: obrigatório escolher em fallback; ler avisa a gestão", () => {
    const modal = readFileSync("src/components/perfil/PendingDocumentsModal.tsx", "utf8");
    expect(modal).toContain('setPlaceChosen(p.found !== "fallback")');
    expect(modal).toContain("!placeChosen");
    expect(modal).toContain("vistoPlacements(layout.data.pages, finalPlacement, vistoPng.aspect)");
    const sql = readFileSync("docs/sql/documento_lido_20261118_aplicar.sql", "utf8");
    expect(sql).toContain("'employee_document_viewed'::public.notification_event");
    expect(sql).toContain("RAISE EXCEPTION 'PARAR: este script já foi aplicado.");
    const notif = readFileSync("src/routes/app.notificacoes.tsx", "utf8");
    expect(notif).toContain('employee_document_viewed: "Documento lido"');
  });
});
