import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  OPEN_PENDING_DOCUMENTS_EVENT,
  openPendingDocuments,
} from "../src/lib/pending-documents-events";

const card = readFileSync("src/components/perfil/MyDocumentsCard.tsx", "utf8");
const modal = readFileSync("src/components/perfil/PendingDocumentsModal.tsx", "utf8");
const perfil = readFileSync("src/routes/app.perfil.tsx", "utf8");

describe("18/11 — Os meus documentos (Perfil)", () => {
  test("só os do próprio funcionário, na empresa ativa, marcados como visíveis", () => {
    expect(card).toContain('.eq("profile_id", user!.id)');
    expect(card).toContain('.eq("company_id", currentCompanyId!)');
    expect(card).toContain('.eq("employee_visible", true)');
  });
  test("baixa original e cópia assinada; pendentes reabrem a janela", () => {
    expect(card).toContain("download(d.signed_storage_path!)");
    expect(card).toContain("download(d.storage_path)");
    expect(card).toContain("openPendingDocuments()");
    expect(modal).toContain("window.addEventListener(OPEN_PENDING_DOCUMENTS_EVENT, reopen)");
    expect(modal).toContain('queryKey: ["my-documents", userId, companyId]');
    expect(perfil).toContain("<MyDocumentsCard />");
  });
  test("evento de reabrir", () => {
    let got = 0;
    const g = globalThis as unknown as { window?: EventTarget };
    const had = g.window;
    g.window = new EventTarget();
    g.window.addEventListener(OPEN_PENDING_DOCUMENTS_EVENT, () => (got += 1));
    openPendingDocuments();
    expect(got).toBe(1);
    g.window = had;
  });
});
