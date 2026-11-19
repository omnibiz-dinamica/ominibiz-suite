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
