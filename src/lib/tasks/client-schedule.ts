import { supabase } from "@/integrations/supabase/client";

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
  punchMode: string | null;
  frequency: string;
  intervalWeeks: number | null;
  scheduleType: "fixed" | "flexible";
};

export type ClientHabitualSchedule = {
  weekdays: number[];
  mode: "fixed" | "flexible";
  startTime: string | null;
  endTime: string | null;
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
    return [{ weekdays: [...new Set(weekdays)].sort(), mode, startTime, endTime }];
  });
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const norm = total < 0 ? total + 24 * 60 : total;
  return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
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
  const configured = parseHabitualSchedule(clientResult.data?.habitual_schedule).map((slot, index) => ({
    id: `client-habitual:${clientId}:${index}`,
    title: "Programação habitual do cliente",
    weekdays: slot.weekdays,
    startTime: slot.startTime,
    endTime:
      slot.startTime && contractedMinutes != null
        ? addMinutes(slot.startTime, contractedMinutes)
        : slot.endTime,
    durationMinutes:
      contractedMinutes ??
      (slot.startTime && slot.endTime
        ? Math.max(0, (Number(slot.endTime.slice(0, 2)) * 60 + Number(slot.endTime.slice(3)) -
            (Number(slot.startTime.slice(0, 2)) * 60 + Number(slot.startTime.slice(3)) + 1440)) % 1440)
        : null),
    punchMode: null,
    frequency: "weekly",
    intervalWeeks: 1,
    scheduleType: slot.mode,
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
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return [];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return slots.filter((s) => s.weekdays.length === 0 || s.weekdays.includes(dow));
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
      ? `${slot.startTime}–${slot.endTime}`
      : slot.startTime
        ? `a partir de ${slot.startTime}`
        : "sem horário definido";
  const mode = slot.scheduleType === "flexible" ? "horário flexível" : "horário fixo";
  return `${days} • ${window} • ${mode}`;
}
