import { supabase } from "@/integrations/supabase/client";

/**
 * SUP-2026-000110 — "Programação habitual do cliente".
 *
 * NÃO cria nova fonte de verdade: lê as séries recorrentes ativas
 * (`public.task_recurrences`) já vinculadas ao cliente. É onde o OmniBiz
 * guarda hoje dia da semana + hora + duração + modo de ponto do serviço.
 *
 * Uso estritamente de sugestão/pré-preenchimento (nunca sobrescreve escolha
 * manual do Gestor, nunca altera dados históricos).
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

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const norm = total < 0 ? total + 24 * 60 : total;
  return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
}

export async function fetchClientSchedule(clientId: string): Promise<ClientScheduleSlot[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("task_recurrences" as any) as any)
    .select("id,title,weekdays,scheduled_time,duration_minutes,punch_mode_override,frequency,interval_weeks,status")
    .eq("client_id", clientId)
    .eq("status", "active");
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => {
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
    } satisfies ClientScheduleSlot;
  });
}

/** Slots que se aplicam a uma data (YYYY-MM-DD) informada pelo Gestor. */
export function slotsForDate(slots: ClientScheduleSlot[], dateKey: string): ClientScheduleSlot[] {
  if (!dateKey) return [];
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return [];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return slots.filter((s) => s.startTime && (s.weekdays.length === 0 || s.weekdays.includes(dow)));
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
  return `${days} • ${window}`;
}
