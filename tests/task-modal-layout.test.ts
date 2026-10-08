import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { modalShell, modalBodyChrome, modalFooterChrome, modalHeaderChrome } from "../src/components/ui/dialog";

const page = readFileSync("src/routes/app.tarefas.tsx", "utf8");

describe("layout do modal Nova tarefa", () => {
  test("shell é coluna flex com altura máxima e não rolável", () => {
    expect(modalShell).toContain("flex flex-col");
    expect(modalShell).toContain("[overflow:clip]");
    expect(modalShell).toMatch(/max-h-\[90vh\]/);
    expect(modalShell).toContain("sm:h-auto");
  });
  test("cabeçalho e rodapé fixos, corpo rolável", () => {
    expect(modalHeaderChrome).toContain("shrink-0");
    expect(modalFooterChrome).toContain("shrink-0");
    expect(modalBodyChrome).toContain("flex-1");
    expect(modalBodyChrome).toContain("min-h-0");
    expect(modalBodyChrome).toContain("overflow-y-auto");
  });
  test("rodapé fica fora da área rolável e a rolagem é só no corpo", () => {
    const body = page.indexOf('<ModalBody className="space-y-4" data-modal-body>');
    const bodyEnd = page.indexOf("</ModalBody>", body);
    const footer = page.indexOf("<ModalFooter>", body);
    expect(body).toBeGreaterThan(0);
    expect(footer).toBeGreaterThan(bodyEnd);
    expect(page).not.toContain("recurrenceBlockRef.current?.scrollIntoView");
  });
});
