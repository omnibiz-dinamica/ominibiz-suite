import { describe, expect, test } from "bun:test";

describe("SUP-2026-000303: Excel dos usuários com todas as informações", async () => {
  const lib = await import("../src/lib/employee-export");

  test("todos os campos do perfil saem (os desconhecidos no fim) e o e-mail logo a seguir ao nome", () => {
    const rows = lib.withEmails(
      [
        {
          id: "p1",
          full_name: "Ana",
          iban: "BE00",
          campo_novo: "x",
          signature_url: "s",
          created_at: "t",
        },
      ],
      new Map([["p1", "ana@x.pt"]]),
    );
    const sheet = lib.profilesSheet(rows);
    const header = sheet[0];
    expect(header.slice(0, 2)).toEqual(["Nome completo", "E-mail"]);
    expect(sheet[1][1]).toBe("ana@x.pt");
    expect(header).toContain("IBAN");
    expect(header).toContain("campo_novo"); // campo que ainda não tem nome bonito
    expect(header).not.toContain("signature_url"); // assinatura nunca vai para o Excel
  });

  test("folha de notas de RH", () => {
    const sheet = lib.notesSheet(
      [
        {
          profile_id: "p1",
          body: "Entregou atestado",
          created_at: "2026-11-15T10:20:00Z",
          created_by_name: "Marco",
        },
      ],
      () => "Ana",
    );
    expect(sheet).toEqual([
      ["Funcionário", "Data", "Autor", "Nota"],
      ["Ana", "2026-11-15 10:20", "Marco", "Entregou atestado"],
    ]);
  });
});
