import { supabase } from "@/integrations/supabase/client";
import { addWallMinutes, calculateWallDurationMinutes, isOvernightTimeRange } from "@/lib/tasks/contracted-hours";
import { scheduleRuleAppliesToDate } from "@/lib/tasks/client-schedule-rules";

/**
 * SUP-2026-000110 — "Programação habitual do cliente".
 *
 * A programação habitual fica no cadastro do cliente. As séries de tarefas
 * existentes continuam sendo lidas como compatibilidade com os cadastros
 * antigos. O resultado é usado somente para sugestão no formulário de tarefa.
 */

export type ClientScheduleSlot = {
  id: string;
  title: string;
  weekdays: number[]; // 0 = domingo … 6 = sábado (mesmo índice de Date#getDay)
  startTime: string | null; // "HH:MM"
  endTime: string | null; // "HH:MM" derivado de duration_minutes
  durationMinutes: number | null;
  contractedMinutes: number | null;
  punchMode: string | null;
  frequency: string;
  intervalWeeks: number | null;
  scheduleType: "fixed" | "flexible";
  cycleLengthWeeks?: number | null;
  cyclePosition?: number | null;
  cycleAnchorDate?: string | null;
};

export type ClientHabitualSchedule = {
  id?: string;
  label?: string | null;
  weekdays: number[];
  mode: "fixed" | "flexible";
  startTime: string | null;
  endTime: string | null;
  contractedMinutes?: number | null;
  frequency?: "weekly" | "cycle";
  cycleLengthWeeks?: number | null;
  cyclePosition?: number | null;
  cycleAnchorDate?: string | null;
  active?: boolean;
  sortOrder?: number;
};

const WEEKDAY_LONG = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export function weekdayLabel(dow: number): string {
  return WEEKDAY_LONG[dow] ?? "";
}

function toHHMM(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : null;
}

function normaliseMode(value: unknown): "fixed" | "flexible" {
  return value === "flexible" ? "flexible" : "fixed";
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

function normaliseDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function parseHabitualSchedule(value: unknown): ClientHabitualSchedule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const weekdays = Array.isArray(row.weekdays)
      ? row.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : [];
    if (weekdays.length === 0) return [];
    const mode = normaliseMode(row.mode);
    const startTime = mode === "fixed" && typeof row.start_time === "string" ? toHHMM(row.start_time) : null;
    const endTime = mode === "fixed" && typeof row.end_time === "string" ? toHHMM(row.end_time) : null;
    const cycleLengthWeeks = positiveInteger(row.cycle_length_weeks);
    const cyclePosition = cycleLengthWeeks
      ? Number.isInteger(row.cycle_position) && (row.cycle_position as number) >= 0 && (row.cycle_position as number) < cycleLengthWeeks
        ? (row.cycle_position as number)
        : 0
      : null;
    const contractedMinutes = positiveInteger(row.contracted_minutes);
    return [{
      id: typeof row.id === "string" ? row.id : undefined,
      label: typeof row.label === "string" ? row.label : null,
      weekdays: [...new Set(weekdays)].sort(),
      mode,
      startTime,
      endTime,
      contractedMinutes,
      frequency: row.frequency === "cycle" || cycleLengthWeeks ? "cycle" : "weekly",
      cycleLengthWeeks,
      cyclePosition,
      cycleAnchorDate: normaliseDate(row.cycle_anchor_date),
      active: row.active !== false,
      sortOrder: Number.isInteger(row.sort_order) ? (row.sort_order as number) : undefined,
    }];
  });
}

function addMinutes(hhmm: string, minutes: number): string {
  return addWallMinutes("2000-01-01", hhmm, minutes)?.time ?? hhmm;
}

export async function fetchClientSchedule(clientId: string): Promise<ClientScheduleSlot[]> {
  const [clientResult, recurrenceResult] = await Promise.all([
    // The generated database types may lag behind the Cloud Database migration.
    (supabase.from("clients" as any) as any)
      .select("habitual_schedule,contracted_minutes")
      .eq("id", clientId)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("task_recurrences" as any) as any)
      .select("id,title,weekdays,scheduled_time,duration_minutes,punch_mode_override,frequency,interval_weeks,status")
      .eq("client_id", clientId)
      .eq("status", "active"),
  ]);
  if (clientResult.error) throw clientResult.error;
  if (recurrenceResult.error) throw recurrenceResult.error;

  const contractedMinutes =
    Number.isInteger(clientResult.data?.contracted_minutes) && clientResult.data.contracted_minutes > 0
      ? clientResult.data.contracted_minutes
      : null;
  const configured = parseHabitualSchedule(clientResult.data?.habitual_schedule)
    .filter((slot) => slot.active !== false)
    .map((slot, index) => ({
    id: `client-habitual:${clientId}:${slot.id || index}`,
    title: slot.label?.trim() || `Programação ${index + 1}`,
    weekdays: slot.weekdays,
    startTime: slot.startTime,
    endTime:
      slot.startTime && (slot.contractedMinutes ?? contractedMinutes) != null
        ? addMinutes(slot.startTime, slot.contractedMinutes ?? contractedMinutes!)
        : slot.endTime,
    durationMinutes:
      slot.contractedMinutes ?? contractedMinutes ??
      (slot.startTime && slot.endTime
        ? calculateWallDurationMinutes(slot.startTime, slot.endTime)
        : null),
    contractedMinutes: slot.contractedMinutes ?? contractedMinutes,
    punchMode: null,
    frequency: slot.frequency === "cycle" ? "cycle" : "weekly",
    intervalWeeks: slot.cycleLengthWeeks ?? 1,
    scheduleType: slot.mode,
    cycleLengthWeeks: slot.cycleLengthWeeks,
    cyclePosition: slot.cyclePosition,
    cycleAnchorDate: slot.cycleAnchorDate,
  } satisfies ClientScheduleSlot));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recurrences = ((recurrenceResult.data ?? []) as any[]).map((r) => {
    const startTime = toHHMM(r.scheduled_time ?? null);
    const duration = typeof r.duration_minutes === "number" ? r.duration_minutes : null;
    return {
      id: r.id as string,
      title: (r.title as string) ?? "",
      weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]) : [],
      startTime,
      endTime: startTime && duration ? addMinutes(startTime, duration) : null,
      durationMinutes: duration,
      contractedMinutes: duration,
      punchMode: (r.punch_mode_override as string | null) ?? null,
      frequency: (r.frequency as string) ?? "weekly",
      intervalWeeks: (r.interval_weeks as number | null) ?? null,
      scheduleType: startTime ? "fixed" : "flexible",
    } satisfies ClientScheduleSlot;
  });
  return [...configured, ...recurrences];
}

/** Slots que se aplicam a uma data (YYYY-MM-DD) informada pelo Gestor. */
export function slotsForDate(slots: ClientScheduleSlot[], dateKey: string): ClientScheduleSlot[] {
  if (!dateKey) return [];
  return slots.filter((s) => scheduleRuleAppliesToDate(s, dateKey));
}

/** Próxima data local que atende a uma programação semanal. */
export function nextDateForSchedule(slots: ClientScheduleSlot[], from = new Date()): string | null {
  for (let offset = 0; offset <= 370; offset += 1) {
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    const dateKey = [candidate.getFullYear(), candidate.getMonth() + 1, candidate.getDate()]
      .map((part) => String(part).padStart(2, "0"))
      .join("-");
    if (slotsForDate(slots, dateKey).length > 0) return dateKey;
  }
  return null;
}

export function describeSlot(slot: ClientScheduleSlot): string {
  const days = slot.weekdays.length
    ? slot.weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => weekdayLabel(d).replace("-feira", ""))
        .join(", ")
    : "Todos os dias";
  const window =
    slot.startTime && slot.endTime
      ? `${slot.startTime}–${slot.endTime}${isOvernightTimeRange(slot.startTime, slot.endTime) ? " (+1 dia)" : ""}`
      : slot.startTime
        ? `a partir de ${slot.startTime}`
        : "sem horário definido";
  const mode = slot.scheduleType === "flexible" ? "horário flexível" : "horário fixo";
  const cycle = slot.cycleLengthWeeks && slot.cycleLengthWeeks > 1
    ? ` • semana ${(slot.cyclePosition ?? 0) + 1}/${slot.cycleLengthWeeks}`
    : "";
  const load = slot.contractedMinutes ? ` • ${Math.floor(slot.contractedMinutes / 60)}h${slot.contractedMinutes % 60 ? String(slot.contractedMinutes % 60).padStart(2, "0") : ""}` : "";
  return `${slot.title} • ${days} • ${window} • ${mode}${load}${cycle}`;
}
