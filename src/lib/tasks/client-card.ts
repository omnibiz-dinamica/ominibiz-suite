import { parseHabitualSchedule, weekdayLabel } from "@/lib/tasks/client-schedule";
import { addWallMinutes, isOvernightTimeRange } from "@/lib/tasks/contracted-hours";

export type ClientCardScheduleData = {
  habitual_schedule?: unknown;
  contracted_minutes?: number | null;
};

export function describeClientSchedule(client: ClientCardScheduleData): string[] {
  const schedules = parseHabitualSchedule(client.habitual_schedule);
  if (schedules.length === 0) return ["Horário: Não configurado"];

  return schedules.map((schedule) => {
    const mode = schedule.mode === "flexible" ? "Flexível" : "Fixo";
    const days = schedule.weekdays.map(weekdayLabel).join(", ");
    let endTime = schedule.endTime;
    if (schedule.mode === "fixed" && schedule.startTime && !endTime && client.contracted_minutes != null) {
      endTime = addWallMinutes("2000-01-01", schedule.startTime, client.contracted_minutes)?.time ?? null;
    }
    const time = schedule.startTime
      ? endTime
        ? `${schedule.startTime} - ${endTime}${isOvernightTimeRange(schedule.startTime, endTime) ? " (+1 dia)" : ""}`
        : `a partir de ${schedule.startTime}`
      : null;
    return [`Horário: ${mode}`, days, time].filter(Boolean).join(" · ");
  });
}
