import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

const calls: Array<[string, Record<string, unknown>]> = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      if (args._reason === "falha")
        return { data: null, error: { message: "Horário sobreposto com outro ponto" } };
      return { data: { version: 2, version_id: "v2", changed: 1 }, error: null };
    },
  },
}));

const { buildCorrectionChanges, saveTimesheetCorrection } =
  await import("../src/components/ponto/TimesheetCorrectionEditor");
const { dayEntryRows, revisionText, zonedLocalToIso } = await import("../src/lib/timesheet-view");

const entry = (over: Record<string, unknown> = {}) =>
  ({
    time_entry_id: "e1",
    task_id: "t1",
    task_title: "Limpeza",
    client_id: "c1",
    client_name: "Faculty Club",
    entry_kind: "work",
    started_at: "2026-11-03T05:00:00Z",
    ended_at: "2026-11-03T09:00:00Z",
    time_zone: "Europe/Brussels",
    started_local: "2026-11-03T06:00",
    ended_local: "2026-11-03T10:00",
    first_in_local: "06:00",
    last_out_local: "10:00",
    break_minutes: 0,
    worked_minutes: 240,
    effective_minutes: 240,
    start_off: false,
    end_off: false,
    over_6h: false,
    ...over,
  }) as never;

describe("hora local -> instante (correção na hora do sítio onde se marcou)", () => {
  test("Bruxelas inverno e verão; Lisboa", () => {
    expect(zonedLocalToIso("2026-11-03T06:00", "Europe/Brussels")).toBe("2026-11-03T05:00:00.000Z");
    expect(zonedLocalToIso("2026-07-03T06:00", "Europe/Brussels")).toBe("2026-07-03T04:00:00.000Z");
    expect(zonedLocalToIso("2026-11-03T06:00", "Europe/Lisbon")).toBe("2026-11-03T06:00:00.000Z");
    expect(zonedLocalToIso("x", "Europe/Lisbon")).toBeNull();
  });
});

describe("o que se envia ao gravar", () => {
  test("só os pontos e campos que mudaram", () => {
    const e1 = entry();
    const e2 = entry({ time_entry_id: "e2" });
    const changes = buildCorrectionChanges([e1, e2], {
      e1: { start: "2026-11-03T06:30", end: "2026-11-03T10:00", clientId: "c1" },
      e2: { start: "2026-11-03T06:00", end: "2026-11-03T10:00", clientId: "c9" },
    });
    expect(changes).toEqual([
      { time_entry_id: "e1", started_at: "2026-11-03T05:30:00.000Z" },
      { time_entry_id: "e2", client_id: "c9" },
    ]);
    expect(buildCorrectionChanges([e1], {})).toEqual([]);
  });

  test("grava pela RPC do banco; o erro do banco chega ao gestor", async () => {
    const r = await saveTimesheetCorrection(
      "p1",
      [{ time_entry_id: "e1", client_id: "c9" }],
      "Cliente errado",
    );
    expect(calls[0]).toEqual([
      "timesheet_manager_correct",
      {
        _period_id: "p1",
        _changes: [{ time_entry_id: "e1", client_id: "c9" }],
        _reason: "Cliente errado",
      },
    ]);
    expect(r.version).toBe(2);
    await expect(saveTimesheetCorrection("p1", [], "falha")).rejects.toThrow("Horário sobreposto");
  });
});

describe("folha com vários pontos no dia e retificação", () => {
  test("uma linha por ponto só quando há mais de um", () => {
    expect(dayEntryRows({ entries: [entry()] } as never)).toEqual([]);
    expect(
      dayEntryRows({ entries: [entry(), entry({ time_entry_id: "e2" })] } as never).length,
    ).toBe(2);
    expect(dayEntryRows({} as never)).toEqual([]);
  });

  test("nota de retificação pela gestão", () => {
    const t = revisionText({
      revision: {
        at: "2026-11-03T16:00:00Z",
        by: "u",
        by_name: "Sara",
        reason: "hora errada",
        from_version: 1,
        original_signed_at: null,
      },
    });
    expect(t).toMatch(
      /^Retificada pela gestão em .* por Sara — hora errada\. Assinatura do funcionário mantida\.$/,
    );
    expect(revisionText({})).toBeNull();
  });

  test("PDF com dois pontos no mesmo dia", async () => {
    const { generateTimesheetPdf } = await import("../src/lib/timesheet-pdf");
    const day = {
      work_date: "2026-11-03",
      first_in: "2026-11-03T05:00:00Z",
      last_out: "2026-11-03T15:00:00Z",
      worked_minutes: 480,
      break_minutes: 0,
      entries_count: 2,
      confirmed_at: null,
      entries: [
        entry(),
        entry({ time_entry_id: "e2", client_name: "FOLGA REMUNERADA", start_off: true }),
      ],
    };
    const snap = {
      company: { id: "c", name: "G" },
      employee: {
        id: "e",
        full_name: "X",
        job_title: null,
        work_location: null,
        team: null,
        signature_url: null,
        initials_url: null,
      },
      period: { year: 2026, month: 11 },
      summary: {
        worked_minutes: 480,
        paid_days: 1,
        payment_type_used: "hourly",
        rate_used: null,
        rate_source: null,
        calculated_amount: null,
        monthly_amount: null,
        currency: "EUR",
      },
      generated_at: "2026-11-03T16:00:00Z",
      days: [day],
      revision: {
        at: "2026-11-03T16:00:00Z",
        by: "u",
        by_name: "Sara",
        reason: "x",
        from_version: 1,
        original_signed_at: null,
      },
    };
    const bytes = await generateTimesheetPdf(snap as never, { versionLabel: "Versão 2" });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  test("Ver do Fechamento permite corrigir; contabilidade não", () => {
    const fech = readFileSync(
      new URL("../src/routes/app.ponto_.fechamento.tsx", import.meta.url),
      "utf8",
    );
    expect(fech).toMatch(/canEdit\s+onChanged=\{invalidate\}/);
    const acc = readFileSync(
      new URL("../src/routes/app.contabilidade.folhas-ponto.tsx", import.meta.url),
      "utf8",
    );
    expect(acc).not.toMatch(/canEdit/);
    const viewer = readFileSync(
      new URL("../src/components/ponto/TimesheetViewerDialog.tsx", import.meta.url),
      "utf8",
    );
    expect(viewer).toMatch(/<TimesheetCorrectionEditor/);
    expect(viewer).toMatch(/setVersionOverride\(\{ period: row\.period_id, version \}\)/);
  });
});
