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
    const contractedMinutes = schedule.contractedMinutes ?? client.contracted_minutes;
    if (schedule.mode === "fixed" && schedule.startTime && !endTime && contractedMinutes != null) {
      endTime = addWallMinutes("2000-01-01", schedule.startTime, contractedMinutes)?.time ?? null;
    }
    const time = schedule.startTime
      ? endTime
        ? `${schedule.startTime} - ${endTime}${isOvernightTimeRange(schedule.startTime, endTime) ? " (+1 dia)" : ""}`
        : `a partir de ${schedule.startTime}`
      : null;
    const load = contractedMinutes != null ? formatScheduleMinutes(contractedMinutes) : null;
    const cycle = schedule.frequency === "cycle" ? `Semana ${(schedule.cyclePosition ?? 0) + 1}` : null;
    return [schedule.label, cycle, `Horário: ${mode}`, days, time, load].filter(Boolean).join(" · ");
  });
}

function formatScheduleMinutes(minutes: number): string {
  return `Carga: ${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`;
}
