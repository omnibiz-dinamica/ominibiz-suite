import assert from "node:assert/strict";
import test from "node:test";

import {
  canArchiveTicketNow,
  canClaimTicket,
} from "../src/lib/support/close-permission.ts";

const base = {
  isSuperAdmin: false,
  isCompanyManager: false,
  isRequester: false,
  destinationCode: "secretary",
  status: "resolvido",
  archivedAt: null as string | null,
};

test("gestor arquiva ticket resolvido da sua empresa", () => {
  assert.equal(canArchiveTicketNow({ ...base, isCompanyManager: true }), true);
});

test("ticket ja arquivado nao mostra a acao novamente", () => {
  assert.equal(
    canArchiveTicketNow({ ...base, isCompanyManager: true, archivedAt: "2026-09-22T00:00:00Z" }),
    false,
  );
});

test("legado fechado continua arquivavel sem mexer no status", () => {
  assert.equal(canArchiveTicketNow({ ...base, isCompanyManager: true, status: "fechado" }), true);
});

test("gestor nao arquiva ticket da fila tecnica", () => {
  assert.equal(
    canArchiveTicketNow({ ...base, isCompanyManager: true, destinationCode: "tech" }),
    false,
  );
  assert.equal(
    canArchiveTicketNow({ ...base, isSuperAdmin: true, destinationCode: "tech" }),
    true,
  );
});

test("funcionario sem papel nao arquiva ticket alheio", () => {
  assert.equal(canArchiveTicketNow({ ...base }), false);
});

const claimBase = {
  isSuperAdmin: false,
  isCompanyManager: true,
  destinationCode: "secretary",
  assignedUserId: null as string | null,
  currentUserId: "u1",
};

test("gestor assume ticket administrativo sem responsavel", () => {
  assert.equal(canClaimTicket(claimBase), true);
});

test("ticket com responsavel nao volta a ser assumido", () => {
  assert.equal(canClaimTicket({ ...claimBase, assignedUserId: "u2" }), false);
});

test("fila tecnica so e assumida pelo super admin", () => {
  assert.equal(canClaimTicket({ ...claimBase, destinationCode: "tech" }), false);
  assert.equal(
    canClaimTicket({ ...claimBase, destinationCode: "tech", isSuperAdmin: true }),
    true,
  );
});

test("sem papel na empresa nao assume", () => {
  assert.equal(canClaimTicket({ ...claimBase, isCompanyManager: false }), false);
});
