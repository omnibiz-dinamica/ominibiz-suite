/**
 * Regressão ADR-059 — assinatura e visto das folhas de ponto validadas.
 * Nenhum caso aqui altera horas, totais ou dados operacionais.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifySignatureBackfill,
  isDayVisto,
  isLateSignature,
  isVersionSigned,
  resolveVersionSignature,
  signatureNotice,
} from "../src/lib/timesheet-signature.ts";

const EMP = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

test("teste 1: assinatura anterior à validação é backfill seguro", () => {
  assert.equal(
    classifySignatureBackfill({
      snapshotSignatureUrl: null,
      profileSignatureUrl: "c/e/signature.png",
      signatureCreatedAt: "2026-08-15T10:00:00Z",
      validatedAt: "2026-08-31T18:00:00Z",
      validatedBy: EMP,
      employeeId: EMP,
    }),
    "B_SAFE_BACKFILL",
  );
});

test("teste 2: folha não validada nunca recebe assinatura nem visto", () => {
  assert.equal(
    classifySignatureBackfill({
      profileSignatureUrl: "c/e/signature.png",
      signatureCreatedAt: "2026-08-15T10:00:00Z",
      validatedAt: null,
      employeeId: EMP,
    }),
    "C_MANUAL_REVIEW",
  );
  assert.equal(isVersionSigned({ signedAt: null }), false);
  assert.equal(isDayVisto({ confirmed_at: null }, { signedAt: null }), false);
  // Possuir assinatura cadastrada não assina uma folha em aberto.
  assert.deepEqual(
    resolveVersionSignature({ signature_url: "c/e/s.png" }, { employee: { signature_url: "c/e/s.png" } }, {
      signedAt: null,
    }),
    { signatureUrl: null, initialsUrl: null },
  );
});

test("teste 3: assinatura cadastrada após a validação é elegível e marcada como tardia", () => {
  const input = {
    profileSignatureUrl: "c/e/signature.png",
    signatureCreatedAt: "2026-09-09T16:42:06Z",
    validatedAt: "2026-09-09T15:52:29Z",
    validatedBy: EMP,
    employeeId: EMP,
  };
  assert.equal(classifySignatureBackfill(input), "B_SAFE_BACKFILL");
  assert.equal(isLateSignature(input), true);
});

test("teste 4: assinatura histórica existente nunca é substituída", () => {
  assert.equal(
    classifySignatureBackfill({
      snapshotSignatureUrl: "c/e/signature-antiga.png",
      profileSignatureUrl: "c/e/signature-nova.png",
      signatureCreatedAt: "2026-01-01T00:00:00Z",
      validatedAt: "2026-08-31T18:00:00Z",
      validatedBy: EMP,
      employeeId: EMP,
    }),
    "A_SIGNATURE_PRESENT",
  );
  // A versão manda: mudar a assinatura do perfil não altera o histórico.
  assert.equal(
    resolveVersionSignature(
      { signature_url: "c/e/assinatura-A.png" },
      { employee: { signature_url: "c/e/assinatura-B.png" } },
      { signedAt: "2026-09-30T18:00:00Z" },
    ).signatureUrl,
    "c/e/assinatura-A.png",
  );
});

test("sem assinatura na versão, o snapshot histórico é o fallback", () => {
  assert.equal(
    resolveVersionSignature(
      { signature_url: null },
      { employee: { signature_url: "c/e/snap.png", initials_url: "c/e/rub.png" } },
      { signedAt: "2026-09-30T18:00:00Z" },
    ).signatureUrl,
    "c/e/snap.png",
  );
});

test("funcionário sem assinatura cadastrada: nada é inventado", () => {
  assert.equal(
    classifySignatureBackfill({
      profileSignatureUrl: null,
      validatedAt: "2026-08-31T18:00:00Z",
      validatedBy: EMP,
      employeeId: EMP,
    }),
    "C_MANUAL_REVIEW",
  );
  assert.equal(
    resolveVersionSignature(null, { employee: {} }, { signedAt: "2026-08-31T18:00:00Z" }).signatureUrl,
    null,
  );
});

test("validação feita por outra pessoa é inconsistente, não backfill", () => {
  assert.equal(
    classifySignatureBackfill({
      profileSignatureUrl: "c/e/signature.png",
      signatureCreatedAt: "2026-01-01T00:00:00Z",
      validatedAt: "2026-08-31T18:00:00Z",
      validatedBy: OTHER,
      employeeId: EMP,
    }),
    "D_INCONSISTENT",
  );
});

test("teste visto: versão validada dá visto a todas as linhas do snapshot", () => {
  assert.equal(isDayVisto({ confirmed_at: null }, { signedAt: "2026-08-31T18:00:00Z" }), true);
  assert.equal(isDayVisto({ confirmed_at: "2026-08-10T09:00:00Z" }, { signedAt: null }), true);
});

test("aviso só aparece em versão validada sem assinatura associada", () => {
  assert.equal(signatureNotice({ signedAt: null, snapshotSignatureUrl: null }), null);
  assert.equal(
    signatureNotice({ signedAt: "2026-09-09T15:52:29Z", snapshotSignatureUrl: "c/e/s.png" }),
    null,
  );
  assert.match(
    signatureNotice({ signedAt: "2026-09-09T15:52:29Z", snapshotSignatureUrl: null }) ?? "",
    /assinatura/i,
  );
});
