import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

// withLiveExtras chama o snapshot atual pelo cliente Supabase: substituído por um de teste.
let liveCalls = 0;
let liveDays: unknown[] = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => {
      liveCalls += 1;
      return { data: { days: liveDays }, error: null };
    },
  },
}));

const {
  dayStatusText,
  fillMonthDays,
  isWeekendKey,
  mergeLiveExtras,
  monthDateKeys,
  offScheduleText,
  snapshotNeedsLiveExtras,
  weekdayLetter,
  withLiveExtras,
} = await import("../src/lib/timesheet-view");

const base = {
  company: { id: "c1", name: "Grupo" },
  employee: {
    id: "e1",
    full_name: "Alessandro",
    job_title: null,
    work_location: null,
    team: null,
    signature_url: null,
    initials_url: null,
  },
  period: { year: 2026, month: 10 },
  summary: {
    worked_minutes: 0,
    paid_days: 0,
    payment_type_used: "hourly",
    rate_used: null,
    rate_source: null,
    calculated_amount: null,
    monthly_amount: null,
    currency: "EUR",
  },
  generated_at: "2026-11-03T10:00:00Z",
};
const day = (work_date: string, extra: Record<string, unknown> = {}) => ({
  work_date,
  first_in: `${work_date}T08:00:00Z`,
  last_out: `${work_date}T10:00:00Z`,
  worked_minutes: 120,
  break_minutes: 0,
  entries_count: 1,
  confirmed_at: null,
  ...extra,
});

describe("folha de ponto — mês inteiro e letra do dia", () => {
  test("letra do dia: S T Q Q S S D", () => {
    // 05/10/2026 é segunda-feira
    expect(
      ["05", "06", "07", "08", "09", "10", "11"].map((d) => weekdayLetter(`2026-10-${d}`)).join(""),
    ).toBe("STQQSSD");
    expect(weekdayLetter("x")).toBe("");
    expect(isWeekendKey("2026-10-10")).toBe(true);
    expect(isWeekendKey("2026-10-11")).toBe(true);
    expect(isWeekendKey("2026-10-12")).toBe(false);
  });

  test("todos os dias do mês, com os registos no sítio certo", () => {
    expect(monthDateKeys(2026, 2).length).toBe(28);
    expect(monthDateKeys(2028, 2).length).toBe(29);
    const days = fillMonthDays({ ...base, days: [day("2026-10-03"), day("2026-10-01")] });
    expect(days.length).toBe(31);
    expect(days[0].work_date).toBe("2026-10-01");
    expect(days[0].placeholder).toBeUndefined();
    expect(days[1].placeholder).toBe(true);
    expect(days[1].worked_minutes).toBe(0);
    expect(days[2].entries_count).toBe(1);
    expect(dayStatusText(days[1])).toBe("—");
    expect(dayStatusText(days[0])).toBe("Trabalhado");
  });
});

describe("folhas assinadas antes: dados atuais só para mostrar", () => {
  test("snapshot antigo precisa dos dados atuais; novo não", () => {
    expect(snapshotNeedsLiveExtras({ days: [day("2026-10-01")] })).toBe(true);
    expect(
      snapshotNeedsLiveExtras({
        days: [
          day("2026-10-01", {
            clients: [],
            schedule_flags: { start_off: false, end_off: false, over_6h: false },
            time_zone: null,
            entries: [],
          }),
        ],
      }),
    ).toBe(false);
  });

  test("junta cliente/observação/vermelho por data sem alterar o original", () => {
    const stored = { ...base, days: [day("2026-10-01"), day("2026-10-02")] };
    const copy = JSON.stringify(stored);
    const live = {
      days: [
        day("2026-10-01", {
          clients: ["Faculty Club"],
          task_notes: [
            { task_id: "t", title: "x", client_name: "Faculty Club", note: "ok", created_at: "" },
          ],
          schedule_flags: { start_off: true, end_off: false, over_6h: false },
          schedule_issues: [],
        }),
      ],
    };
    const { snapshot, merged } = mergeLiveExtras(stored as never, live as never);
    expect(merged).toBe(true);
    expect(snapshot.days[0].clients).toEqual(["Faculty Club"]);
    expect(snapshot.days[0].schedule_flags?.start_off).toBe(true);
    // horas e totais da versão assinada não mudam
    expect(snapshot.days[0].first_in).toBe("2026-10-01T08:00:00Z");
    expect(snapshot.days[1].clients).toBeUndefined();
    expect(JSON.stringify(stored)).toBe(copy);
  });

  test("withLiveExtras só pede os dados atuais quando a folha é antiga", async () => {
    liveCalls = 0;
    liveDays = [
      day("2026-10-01", {
        clients: ["A"],
        schedule_flags: { start_off: false, end_off: false, over_6h: false },
      }),
    ];
    const fresh = {
      ...base,
      days: [
        day("2026-10-01", {
          clients: ["A"],
          schedule_flags: { start_off: false, end_off: false, over_6h: false },
          time_zone: null,
          entries: [],
        }),
      ],
    };
    expect((await withLiveExtras(fresh as never)).extrasLive).toBe(false);
    expect(liveCalls).toBe(0);
    const old = await withLiveExtras({ ...base, days: [day("2026-10-01")] } as never);
    expect(liveCalls).toBe(1);
    expect(old.extrasLive).toBe(true);
    expect(old.snapshot.days[0].clients).toEqual(["A"]);
  });
});

describe("horas fora do padrão", () => {
  test("texto do que ficou fora do padrão", () => {
    const d = day("2026-10-01", {
      schedule_issues: [
        {
          task_id: "t",
          client_name: "Coifa CM",
          is_coifa: true,
          planned_start_hhmm: "01/10 06:00",
          planned_end_hhmm: "01/10 12:00",
          actual_start_hhmm: "01/10 06:07",
          actual_end_hhmm: "01/10 13:00",
          effective_minutes: 400,
          start_off: true,
          end_off: false,
          over_6h: true,
        },
      ],
    });
    expect(offScheduleText(d as never)).toBe(
      "Coifa CM: entrada 06:07, 7 min depois da hora marcada (06:00), 6h40 de trabalho (mais de 6 h)",
    );
  });

  test("diferença antes/depois e noutro dia", () => {
    const issue = (a: string, p: string) => ({
      task_id: "t",
      client_name: "Faculty Club",
      is_coifa: false,
      planned_start_hhmm: p,
      planned_end_hhmm: "01/10 12:00",
      actual_start_hhmm: a,
      actual_end_hhmm: "01/10 13:30",
      effective_minutes: 60,
      start_off: true,
      end_off: true,
      over_6h: false,
    });
    expect(
      offScheduleText(
        day("2026-10-01", { schedule_issues: [issue("01/10 07:45", "01/10 08:00")] }) as never,
      ),
    ).toBe(
      "Faculty Club: entrada 07:45, 15 min antes da hora marcada (08:00), saída 13:30, 1h30 depois da hora marcada (12:00)",
    );
    expect(
      offScheduleText(
        day("2026-10-03", { schedule_issues: [issue("03/10 08:00", "01/10 08:00")] }) as never,
      ),
    ).toMatch(/^Faculty Club: entrada noutro dia \(marcada 01\/10 08:00\)/);
  });

  test("tela e PDF marcam a vermelho entrada, saída e total", () => {
    const table = readFileSync(
      new URL("../src/components/ponto/TimesheetDaysTable.tsx", import.meta.url),
      "utf8",
    );
    expect(table).toMatch(/f\.start \? RED/);
    expect(table).toMatch(/f\.end \? RED/);
    expect(table).toMatch(/f\.over6h \? RED/);
    const pdf = readFileSync(new URL("../src/lib/timesheet-pdf.ts", import.meta.url), "utf8");
    expect(pdf).toMatch(
      /: \[false, false, flags\.start, flags\.end, false, flags\.over6h, false, false\]/,
    );
    expect(pdf).toMatch(
      /\[false, false, first\.start_off, first\.end_off, false, first\.over_6h, false, false\]/,
    );
    expect(pdf).toMatch(/fillMonthDays\(snapshot\)/);
  });

  test("todas as telas e o PDF em lote usam os dados atuais nas folhas antigas", () => {
    for (const f of [
      "../src/components/ponto/TimesheetViewerDialog.tsx",
      "../src/routes/app.ponto_.meus-relatorios.tsx",
      "../src/lib/timesheet-batch.ts",
    ]) {
      expect(readFileSync(new URL(f, import.meta.url), "utf8")).toMatch(
        /withLiveExtras\(v(ersion)?\.snapshot\)/,
      );
    }
  });
});

describe("PDF da folha", () => {
  test("gera o PDF com mês inteiro, cliente, observação, vermelho e aviso", async () => {
    const { generateTimesheetPdf } = await import("../src/lib/timesheet-pdf");
    const flags = { start_off: true, end_off: true, over_6h: false };
    const snap = {
      ...base,
      days: [
        day("2026-10-01", {
          clients: ["Faculty Club", "Coifa Holanda com um nome muito comprido para caber"],
          task_notes: [
            {
              task_id: "t",
              title: "x",
              client_name: "Faculty Club",
              note: "Faltou produto ".repeat(20),
              created_at: "",
            },
          ],
          schedule_flags: flags,
          schedule_issues: [],
        }),
      ],
    };
    const bytes = await generateTimesheetPdf(snap as never, {
      versionLabel: "Versão 1",
      extrasLive: true,
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("hora do sítio onde o funcionário marcou", () => {
  test("mostra a hora local quando existe; sem ela, como sempre", async () => {
    const { dayInText, dayOutText, formatTimeInZone } = await import("../src/lib/timesheet-view");
    expect(
      dayInText(day("2026-10-01", { first_in_local: "10:00", last_out_local: null }) as never),
    ).toBe("10:00");
    expect(
      dayOutText(day("2026-10-01", { first_in_local: "10:00", last_out_local: null }) as never),
    ).toBe("—");
    expect(dayInText(day("2026-10-01") as never)).toBe("08:00");
    // 01/10 08:00 UTC = 10:00 em Bruxelas (verão) e 09:00 em Lisboa
    expect(formatTimeInZone("2026-10-01T08:00:00Z", "Europe/Brussels")).toBe("10:00");
    expect(formatTimeInZone("2026-10-01T08:00:00Z", "Europe/Lisbon")).toBe("09:00");
    expect(formatTimeInZone("2026-10-01T08:00:00Z", "Marte/Base")).toBe("08:00");
    expect(formatTimeInZone(null, "Europe/Brussels")).toBeNull();
  });

  test("folha assinada antiga: horas guardadas mostradas no fuso de onde se marcou", () => {
    const stored = { ...base, days: [day("2026-10-01")] };
    const live = {
      days: [
        day("2026-10-01", {
          first_in: "2026-10-01T09:00:00Z",
          time_zone: "Europe/Brussels",
          first_in_local: "11:00",
          last_out_local: "12:00",
        }),
      ],
    };
    const { snapshot } = mergeLiveExtras(stored as never, live as never);
    // usa as horas da versão assinada (08:00Z/10:00Z), não as atuais
    expect(snapshot.days[0].first_in_local).toBe("10:00");
    expect(snapshot.days[0].last_out_local).toBe("12:00");
    expect(snapshot.days[0].time_zone).toBe("Europe/Brussels");
  });
});
