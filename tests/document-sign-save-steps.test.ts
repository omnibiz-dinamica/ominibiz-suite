import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { signatureProfilePatch, signatureStoragePath } from "../src/lib/employee-signature-save";

describe("Assinar documento sem assinatura guardada: guardar → guardar → enviar", () => {
  test("guarda no mesmo sítio do Perfil", () => {
    expect(signatureStoragePath("signature", "c1", "u1", 5)).toBe("c1/u1/signature-5.png");
    expect(signatureStoragePath("initials", "c1", "u1", 5)).toBe("c1/u1/initials-5.png");
    expect(signatureProfilePatch("signature", "p")).toEqual({ signature_url: "p" });
    expect(signatureProfilePatch("initials", "p")).toEqual({ initials_url: "p" });
  });

  test("janela: botões Guardar assinatura, Guardar visto e Enviar só com os dois guardados", () => {
    const modal = readFileSync("src/components/perfil/PendingDocumentsModal.tsx", "utf8");
    expect(modal).toContain('data-testid="save-signature"');
    expect(modal).toContain('data-testid="save-visto"');
    expect(modal).toContain('data-testid="send-signature"');
    expect(modal).toContain(
      "const readyToSend = hasSaved && hasVisto && !showPad && !showVistoPad;",
    );
    expect(modal).toContain("!readyToSend");
    expect(modal).toContain('saveDrawn("signature")');
    expect(modal).toContain('saveDrawn("initials")');
    expect(modal).toContain("3. Enviar assinatura");
  });
});

describe("botões de assinar sempre visíveis (telemóvel)", () => {
  test("conteúdo rola; botões ficam fixos em baixo", () => {
    const modal = readFileSync("src/components/perfil/PendingDocumentsModal.tsx", "utf8");
    expect(modal).toContain('data-testid="sign-step"');
    expect(modal).toContain(
      'className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"',
    );
    expect(modal).toContain('data-testid="sign-step-actions"');
    const actions = modal.indexOf('data-testid="sign-step-actions"');
    expect(modal.indexOf('data-testid="send-signature"')).toBeGreaterThan(actions);
    expect(modal.indexOf('data-testid="signature-pad"')).toBeLessThan(actions);
  });
});
