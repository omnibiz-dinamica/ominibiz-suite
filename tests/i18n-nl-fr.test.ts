import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

mock.module("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => ({}) } }));

const {
  enModules,
  nlModules,
  frModules,
  ptModules,
  LANGUAGES,
  isAppLanguage,
  translator,
  dateLocale,
} = await import("../src/i18n");
const { weekdayLetter, dayStatusText, revisionText, ptTr } =
  await import("../src/lib/timesheet-view");
const { translateNotificationTitle } = await import("../src/lib/notification-i18n");

const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");

describe("Nederlands e Français: mesmas chaves que o Inglês", () => {
  for (const [name, mods] of [
    ["nl-BE", nlModules],
    ["fr-BE", frModules],
  ] as const) {
    test(`${name}: todas as chaves, sem vazios, com as mesmas variáveis {{…}}`, () => {
      for (const [mod, pt] of Object.entries(ptModules)) {
        const dict = mods[mod as keyof typeof enModules];
        const missing = Object.keys(pt).filter((k) => !dict[k]?.trim());
        expect(missing, `${name}/${mod} em falta`).toEqual([]);
        const extra = Object.keys(dict).filter((k) => !(k in pt));
        expect(extra, `${name}/${mod} a mais`).toEqual([]);
        for (const k of Object.keys(pt))
          expect(vars(dict[k]), `${name}/${mod}: ${k}`).toBe(vars(k));
      }
    });
  }

  test("Inglês também tem as variáveis certas", () => {
    for (const [mod, pt] of Object.entries(ptModules))
      for (const k of Object.keys(pt))
        expect(vars(enModules[mod as keyof typeof enModules][k]), `en/${mod}: ${k}`).toBe(vars(k));
  });

  test("seletor com as 4 línguas; língua desconhecida não é aceite", () => {
    expect(LANGUAGES.map((l) => l.value)).toEqual(["pt-BR", "en", "nl-BE", "fr-BE"]);
    expect(LANGUAGES.map((l) => l.label)).toEqual([
      "Português",
      "English",
      "Nederlands",
      "Français",
    ]);
    expect(isAppLanguage("nl-BE")).toBe(true);
    expect(isAppLanguage("de")).toBe(false);
    expect(dateLocale("fr-BE")).toBe("fr-BE");
    expect(dateLocale("pt-BR")).toBe("pt-PT");
    const sw = readFileSync(
      new URL("../src/components/LanguageSwitcher.tsx", import.meta.url),
      "utf8",
    );
    expect(sw).toMatch(/LANGUAGES\.map/);
  });

  test("traduz e cai para o português quando falta", () => {
    expect(translator("nl-BE")("Folha de Ponto")).toBe("Prestatieblad");
    expect(translator("fr-BE")("Folha de Ponto")).toBe("Fiche de prestations");
    expect(translator("fr-BE")("há {{n}} min", { n: 5 })).toBe("il y a 5 min");
    expect(translator("nl-BE")("Texto sem tradução")).toBe("Texto sem tradução");
    expect(translator("pt-BR")("Folha de Ponto")).toBe("Folha de Ponto");
  });
});

describe("folha de ponto na língua de quem a gera", () => {
  test("letra do dia por língua (05/10/2026 = segunda)", () => {
    const week = ["05", "06", "07", "08", "09", "10", "11"].map((d) => `2026-10-${d}`);
    expect(week.map((d) => weekdayLetter(d)).join("")).toBe("STQQSSD");
    expect(week.map((d) => weekdayLetter(d, "en")).join("")).toBe("MTWTFSS");
    expect(week.map((d) => weekdayLetter(d, "nl-BE")).join("")).toBe("MDWDVZZ");
    expect(week.map((d) => weekdayLetter(d, "fr-BE")).join("")).toBe("LMMJVSD");
  });

  test("situação do dia e retificação traduzidas; português igual a antes", () => {
    const d = {
      work_date: "2026-10-05",
      attendance_status: "absence",
      absence_task_count: 2,
    } as never;
    expect(dayStatusText(d)).toBe("Falta (2 tarefa(s))");
    expect(dayStatusText(d, translator("fr-BE"))).toBe("Absence (2 tâche(s))");
    const rev = {
      revision: {
        at: "2026-11-03T16:00:00Z",
        by: "u",
        by_name: "Sara",
        reason: "erro",
        from_version: 1,
        original_signed_at: null,
      },
    };
    expect(revisionText(rev, ptTr)).toMatch(
      /^Retificada pela gestão em .* por Sara — erro\. Assinatura do funcionário mantida\.$/,
    );
    expect(revisionText(rev, translator("nl-BE"), "nl-BE")).toMatch(
      /^Gecorrigeerd door het beheer op .* door Sara — erro\./,
    );
  });

  test("gera o PDF em NL e FR (acentos incluídos)", async () => {
    const { generateTimesheetPdf } = await import("../src/lib/timesheet-pdf");
    const snap = {
      company: { id: "c", name: "Grupo" },
      employee: {
        id: "e",
        full_name: "Ana",
        job_title: null,
        work_location: null,
        team: null,
        signature_url: null,
        initials_url: null,
      },
      period: { year: 2026, month: 2 },
      summary: {
        worked_minutes: 60,
        paid_days: 1,
        payment_type_used: "hourly",
        rate_used: 15,
        rate_source: null,
        calculated_amount: 15,
        monthly_amount: null,
        currency: "EUR",
      },
      generated_at: "2026-11-05T10:00:00Z",
      days: [
        {
          work_date: "2026-02-02",
          first_in: "2026-02-02T08:00:00Z",
          last_out: "2026-02-02T09:00:00Z",
          worked_minutes: 60,
          break_minutes: 0,
          entries_count: 1,
          confirmed_at: null,
        },
      ],
    };
    for (const language of ["nl-BE", "fr-BE"] as const) {
      const bytes = await generateTimesheetPdf(snap as never, {
        versionLabel: "Versão 2",
        language,
      });
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    }
    const pdf = readFileSync(new URL("../src/lib/timesheet-pdf.ts", import.meta.url), "utf8");
    expect(pdf).toMatch(/opts\.language \?\? currentLanguage\(\)/);
    expect(pdf).not.toMatch(/doc\.text\("(FOLHA|RESUMO|Assinatura)/);
  });
});

describe("avisos na língua de quem os lê", () => {
  const nl = translator("nl-BE");
  const fr = translator("fr-BE");
  test("título conhecido, com nome à frente, e título desconhecido", () => {
    expect(translateNotificationTitle("Tarefa cancelada", nl)).toBe("Taak geannuleerd");
    expect(translateNotificationTitle("Ana — Tarefa cancelada", fr)).toBe("Ana — Tâche annulée");
    expect(translateNotificationTitle("Tarefa concluída: Faculty Club", nl)).toBe(
      "Taak afgerond: Faculty Club",
    );
    expect(translateNotificationTitle("Algo novo do banco", nl)).toBe("Algo novo do banco");
    expect(translateNotificationTitle(null, nl)).toBe("");
  });
  test("todos os tipos de aviso da tela têm tradução", () => {
    const page = readFileSync(
      new URL("../src/routes/app.notificacoes.tsx", import.meta.url),
      "utf8",
    );
    const block = page.slice(
      page.indexOf("const EVENT_LABEL"),
      page.indexOf("const PRIORITY_TONE"),
    );
    const labels = [...block.matchAll(/:\s*"([^"]+)",/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(30);
    for (const l of labels) {
      expect(nlModules.notifications[l], `nl: ${l}`).toBeTruthy();
      expect(frModules.notifications[l], `fr: ${l}`).toBeTruthy();
    }
    expect(page).toMatch(/\{t\(EVENT_LABEL\[n\.event\]\)\}/);
    expect(page).toMatch(/translateNotificationTitle\(n\.title, t\)/);
  });
});
