import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { normalizeSearch, ticketMatchesSearch } from "../src/lib/support/search";

describe("SUP-337 — pesquisar tickets por pessoa", () => {
  const ticket = ["Folha de ponto errada", "SUP-2026-000337", "Piandá Silva"];

  test("encontra pelo nome de quem abriu, sem acentos nem maiúsculas", () => {
    expect(ticketMatchesSearch(ticket, "pianda")).toBe(true);
    expect(ticketMatchesSearch(ticket, "PIANDÁ")).toBe(true);
    expect(ticketMatchesSearch(ticket, "Marco")).toBe(false);
  });

  test("continua a encontrar por título e número", () => {
    expect(ticketMatchesSearch(ticket, "000337")).toBe(true);
    expect(ticketMatchesSearch(ticket, "folha")).toBe(true);
  });

  test("várias palavras: todas têm de aparecer", () => {
    expect(ticketMatchesSearch(ticket, "pianda ponto")).toBe(true);
    expect(ticketMatchesSearch(ticket, "pianda despesa")).toBe(false);
  });

  test("campos vazios e pesquisa vazia", () => {
    expect(ticketMatchesSearch(["Título", null, undefined], "")).toBe(true);
    expect(ticketMatchesSearch(["Título", null], "x")).toBe(false);
    expect(normalizeSearch("  Léa ")).toBe("lea");
  });

  test("as duas listas usam a pesquisa por pessoa", () => {
    const list = readFileSync("src/routes/app.suporte.tsx", "utf8");
    expect(list).toContain("ticketMatchesSearch([t.title, t.ticket_number, requesterName(t)], q)");
    expect(list).toContain("ou pessoa");
    const admin = readFileSync("src/routes/app.admin.suporte.tsx", "utf8");
    expect(admin).toContain("requester_user_id, created_by_role, companies(name)");
    expect(admin).toContain("t.companies?.name, requesterName(t)");
    expect(admin).toContain('data-testid="ticket-requester"');
  });
});
