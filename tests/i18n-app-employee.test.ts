import { describe, expect, test } from "bun:test";
import table from "../src/i18n/locales/app.json";
import i18n, { tr } from "../src/i18n";

const rows = table as unknown as Record<string, string[]>;
const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");

describe("i18n telas do funcionário (app.json)", () => {
  test("cada chave tem en, nl e fr não vazios e com as mesmas variáveis", () => {
    const keys = Object.keys(rows);
    expect(keys.length).toBeGreaterThan(700);
    for (const k of keys) {
      const r = rows[k];
      expect(r.length).toBe(3);
      for (const v of r) {
        expect(v.trim().length).toBeGreaterThan(0);
        expect(vars(v)).toBe(vars(k));
      }
    }
  });

  test("tr() segue a língua ativa e volta ao português", async () => {
    await i18n.changeLanguage("nl-BE");
    expect(tr("Enviar agora")).toBe("Nu verzenden");
    await i18n.changeLanguage("fr-BE");
    expect(tr("Confirmar falta")).toBe("Confirmer l'absence");
    await i18n.changeLanguage("en");
    expect(tr("Minhas Tarefas")).toBe("My Tasks");
    await i18n.changeLanguage("pt-BR");
    expect(tr("Minhas Tarefas")).toBe("Minhas Tarefas");
    expect(tr("texto sem tradução")).toBe("texto sem tradução");
  });
});
