import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { timesheetPayLabel, type TimesheetSnapshot } from "../src/lib/timesheet";
import { generateTimesheetPdf } from "../src/lib/timesheet-pdf";

const snapshot = (summary: Partial<TimesheetSnapshot["summary"]>): TimesheetSnapshot =>
  ({
    company: { id: "c", name: "Empresa" },
    employee: {
      id: "u",
      full_name: "Funcionário Teste",
      job_title: null,
      work_location: null,
      team: null,
      signature_url: null,
      initials_url: null,
    },
    period: { year: 2026, month: 10 },
    days: [],
    summary: {
      worked_minutes: 720,
      paid_days: 6,
      payment_type_used: "multiple",
      rate_used: null,
      rate_source: "client",
      calculated_amount: 1217,
      monthly_amount: null,
      currency: "EUR",
      ...summary,
    },
    generated_at: "2026-11-10T12:00:00Z",
  }) as TimesheetSnapshot;

describe("folha calculada pela forma de pagamento do cliente", () => {
  test("rótulos: 'multiple' vira 'Vários (por cliente)'", () => {
    expect(timesheetPayLabel("multiple")).toBe("Vários (por cliente)");
    expect(timesheetPayLabel("hourly")).toBe("Por Hora");
    expect(timesheetPayLabel(null)).toBe("—");
    expect(timesheetPayLabel("outro")).toBe("outro");
  });

  test("PDF com vários clientes lista a composição; folha antiga sem by_client continua a gerar", async () => {
    const withClients = await generateTimesheetPdf(
      snapshot({
        by_client: [
          {
            client_id: "a",
            client_name: "Dia A",
            pay_model: "daily",
            unit_rate: 100,
            minutes: 180,
            entries: 2,
            days: 1,
            amount: 100,
          },
          {
            client_id: "f",
            client_name: "FOLGA REMUNERADA",
            pay_model: "fixed",
            unit_rate: 50,
            minutes: 0,
            entries: 2,
            days: 2,
            amount: 100,
          },
        ],
      }),
      { language: "pt-BR" },
    );
    const txt = Buffer.from(withClients).toString("latin1");
    expect(txt).toContain("FOLGA REMUNERADA");
    expect(txt).toContain("Dia A");
    const old = await generateTimesheetPdf(
      snapshot({ payment_type_used: "hourly", rate_used: 11.5 }),
      {
        language: "pt-BR",
      },
    );
    expect(old.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(old).toString("latin1")).not.toContain("FOLGA REMUNERADA");
  });

  test("diálogo do fechamento mostra a composição por cliente e o rótulo certo", () => {
    const d = readFileSync(
      new URL("../src/components/ponto/TimesheetViewerDialog.tsx", import.meta.url),
      "utf8",
    );
    expect(d).toContain("Composição por cliente");
    expect(d).toMatch(/timesheetPayLabel\(snap\.data\.snapshot\.summary\.payment_type_used\)/);
  });
});
