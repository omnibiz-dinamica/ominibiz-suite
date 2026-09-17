import { describe, expect, it } from "vitest";
import {
  AUTO_RECURRENCE_BADGE_LABEL,
  AUTO_RECURRENCE_BADGE_TITLE,
  isAutoRecurrenceOccurrence,
  newTaskNotificationTitle,
} from "@/lib/tasks";

describe("origem da tarefa (manual vs recorrência)", () => {
  it("tarefa sem recurrence_id é manual", () => {
    expect(isAutoRecurrenceOccurrence({ recurrence_id: null })).toBe(false);
  });

  it("tarefa com recurrence_id é ocorrência automática", () => {
    expect(isAutoRecurrenceOccurrence({ recurrence_id: "e1d7feb4-b1d7-4471-931c-1a5e540647db" })).toBe(true);
  });

  it("selo de ocorrência automática tem texto e explicação", () => {
    expect(AUTO_RECURRENCE_BADGE_LABEL).toBe("Recorrente (automática)");
    expect(AUTO_RECURRENCE_BADGE_TITLE).toContain("gerada automaticamente");
  });

  it("notificação de tarefa manual mantém o título clássico", () => {
    expect(newTaskNotificationTitle(null)).toBe("Nova tarefa atribuída");
  });

  it("notificação de ocorrência de recorrência deixa clara a origem automática", () => {
    expect(newTaskNotificationTitle("e1d7feb4-b1d7-4471-931c-1a5e540647db")).toBe(
      "Tarefa gerada automaticamente pela recorrência",
    );
  });
});
