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
