/**
 * Fecho do mês (14/11/2026, pedido do Marco): somatório de horas da SEMANA e do
 * FIM DE SEMANA / FERIADO, e aviso quando falta o valor no cadastro do
 * funcionário. Só apresentação: os números vêm do snapshot do banco.
 */
import type { TimesheetClientTotal, TimesheetDayTypeTotals } from "@/lib/timesheet";

export type DayTypeRow = {
  key: "week" | "weekend";
  label: string;
  minutes: number;
  days: number;
  amount: number;
};

export function dayTypeRows(t: TimesheetDayTypeTotals | null | undefined): DayTypeRow[] | null {
  if (!t) return null; // folhas geradas antes de 14/11/2026
  return [
    {
      key: "week",
      label: "Semana (seg–sex)",
      minutes: Number(t.week_minutes ?? 0),
      days: Number(t.week_days ?? 0),
      amount: Number(t.week_amount ?? 0),
    },
    {
      key: "weekend",
      label: "Fim de semana / feriado",
      minutes: Number(t.weekend_minutes ?? 0),
      days: Number(t.weekend_days ?? 0),
      amount: Number(t.weekend_amount ?? 0),
    },
  ];
}

/** "11/11" de cada feriado trabalhado no mês. */
export function holidayLabels(t: TimesheetDayTypeTotals | null | undefined): string[] {
  return (t?.holidays ?? [])
    .map((d) => String(d).slice(0, 10))
    .sort()
    .map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
}

/**
 * Valor no cadastro em falta: horas (ou dias) pagas a 0 por hora/dia. A folga
 * remunerada (fixo do cliente) e o salário mensal não entram no aviso.
 */
export function missingEmployeeRate(byClient: TimesheetClientTotal[] | null | undefined): boolean {
  return (byClient ?? []).some(
    (c) =>
      (c.pay_model === "hourly" || c.pay_model === "daily") &&
      Number(c.minutes ?? 0) > 0 &&
      c.unit_rate != null &&
      Number(c.unit_rate) === 0,
  );
}
