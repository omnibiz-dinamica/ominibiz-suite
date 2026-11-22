import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { requesterReopenErrorMessage } from "../src/components/support/ReopenTicketDialog";

const dialog = readFileSync("src/components/support/ReopenTicketDialog.tsx", "utf8");
const page = readFileSync("src/routes/app.suporte.$id.tsx", "utf8");
const sql = readFileSync("docs/sql/suporte_reabrir_pelo_solicitante_20261122_aplicar.sql", "utf8");

test("22/11: funcionário que abriu o ticket reabre-o (volta à gestão, não a ele próprio)", () => {
  expect(page).toContain("asRequester={closeCtx.isRequester && !closeCtx.isCompanyManager && !isSuperAdmin}");
  expect(dialog).toContain("await requesterReopenTicket(ticket.id, message);");
  expect(dialog).toContain('data-testid="requester-reopen-destination"');
});

test("erros da reabertura viram mensagens claras", () => {
  expect(requesterReopenErrorMessage(new Error("not_authorized"))).toContain("Só quem abriu");
  expect(requesterReopenErrorMessage(new Error("ticket_not_closed"))).toContain("já está aberto");
});

test("SQL: só o solicitante, só ticket encerrado, mensagem obrigatória, exceção limitada", () => {
  expect(sql).toContain("t.requester_user_id IS DISTINCT FROM v_uid");
  expect(sql).toContain("RAISE EXCEPTION 'ticket_not_closed'");
  expect(sql).toContain("RAISE EXCEPTION 'message_required'");
  expect(sql).toContain("current_setting('omnibiz.support_requester_reopen', true), '') = OLD.id::text");
  expect(sql).toContain("PERFORM set_config('omnibiz.support_requester_reopen', '', true);");
  expect(sql).toContain("PARAR: este script já foi aplicado");
});
