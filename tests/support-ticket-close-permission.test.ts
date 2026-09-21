import assert from "node:assert/strict";
import test from "node:test";

import {
  canCloseTicketByRole,
  canCloseTicketNow,
} from "../src/lib/support/close-permission.ts";

const base = {
  isSuperAdmin: false,
  isCompanyManager: false,
  isRequester: false,
  destinationCode: "secretary",
  status: "aberto",
};

test("super admin encerra qualquer categoria em qualquer estado", () => {
  for (const destinationCode of ["tech", "secretary", "accounting", null]) {
    for (const status of ["aberto", "em_desenvolvimento", "resolvido", "escalated"]) {
      assert.equal(
        canCloseTicketNow({ ...base, isSuperAdmin: true, destinationCode, status }),
        true,
      );
    }
  }
});

test("gestor encerra secretaria e contabilidade, mas nao suporte/desenvolvimento", () => {
  assert.equal(
    canCloseTicketByRole({ ...base, isCompanyManager: true, destinationCode: "secretary" }),
    true,
  );
  assert.equal(
    canCloseTicketByRole({ ...base, isCompanyManager: true, destinationCode: "accounting" }),
    true,
  );
  assert.equal(
    canCloseTicketByRole({ ...base, isCompanyManager: true, destinationCode: "tech" }),
    false,
  );
});

test("gestor so encerra em estados resolvidos ou a aguardar validacao", () => {
  const mgr = { ...base, isCompanyManager: true };
  assert.equal(canCloseTicketNow({ ...mgr, status: "aberto" }), false);
  assert.equal(canCloseTicketNow({ ...mgr, status: "resolvido" }), true);
  assert.equal(canCloseTicketNow({ ...mgr, status: "waiting_manager" }), true);
  assert.equal(canCloseTicketNow({ ...mgr, status: "fechado" }), false);
});

test("funcionario sem papel nao encerra ticket administrativo alheio", () => {
  assert.equal(canCloseTicketByRole({ ...base, status: "resolvido" }), false);
  assert.equal(canCloseTicketNow({ ...base, status: "resolvido" }), false);
});

test("solicitante continua a poder validar e arquivar o proprio ticket", () => {
  assert.equal(
    canCloseTicketNow({ ...base, isRequester: true, status: "waiting_employee" }),
    true,
  );
  assert.equal(
    canCloseTicketNow({ ...base, isRequester: true, destinationCode: "tech", status: "resolvido" }),
    true,
  );
  assert.equal(canCloseTicketNow({ ...base, isRequester: true, status: "aberto" }), false);
});
