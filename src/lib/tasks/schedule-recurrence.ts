import type { RecurrenceFormValue } from "@/components/tasks/RecurrenceForm";
import { nextDateForSchedule, type ClientScheduleSlot } from "@/lib/tasks/client-schedule";

/**
 * Programação do cliente → recorrência pré-preenchida (somente ao CRIAR).
 * Só programações semanais/ciclo; mensais ficam como estão (sem auto-ativar).
 * A data final fica sempre em branco (regra atual: sem fim, 12 meses).
 */
export function recurrenceFromScheduleSlot(
  prev: RecurrenceFormValue,
  slot: ClientScheduleSlot,
  from: Date = new Date(),
): RecurrenceFormValue | null {
  if (slot.frequency === "monthly" || slot.weekdays.length === 0) return null;
  const startDate = nextDateForSchedule([slot], from) ?? prev.startDate;
  return {
    ...prev,
    enabled: true,
    frequency: "weekly",
    weekdays: [...slot.weekdays].sort((a, b) => a - b),
    intervalWeeks: slot.cycleLengthWeeks && slot.cycleLengthWeeks > 1 ? slot.cycleLengthWeeks : 1,
    startDate,
    endDate: "",
  };
}

/** "Livre / Manual": desliga só o que foi ligado automaticamente. */
export function disableAutoRecurrence(prev: RecurrenceFormValue, autoEnabled: boolean): RecurrenceFormValue {
  return autoEnabled ? { ...prev, enabled: false } : prev;
}

const WEEKDAY_SHORT_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Linha-resumo da programação escolhida (ex.: "Quinzenal · Sábado · 10:00–13:00 · Klein · sem data final"). */
export function scheduleSlotSummary(
  slot: ClientScheduleSlot,
  t: (key: string) => string = (k) => k,
): string {
  const cycle = slot.cycleLengthWeeks && slot.cycleLengthWeeks > 1 ? slot.cycleLengthWeeks : 1;
  const freq = cycle === 2 ? t("Quinzenal") : cycle > 2 ? `${t("A cada")} ${cycle} ${t("semanas")}` : t("Semanal");
  const days = [...slot.weekdays].sort((a, b) => a - b).map((d) => t(WEEKDAY_SHORT_PT[d] ?? "")).join(", ");
  const time = slot.startTime && slot.endTime ? `${slot.startTime}–${slot.endTime}` : slot.startTime ?? t("sem horário definido");
  return [freq, days, time, slot.label?.trim() || null, t("sem data final")].filter(Boolean).join(" · ");
}
