/**
 * Ponto fora do padrão (SUP-2026-000301) — mesma regra da folha de ponto
 * (`timesheet_build_snapshot`), aplicada a um ponto na Gestão de Ponto:
 *  - entrada diferente (ao minuto) da hora marcada na tarefa;
 *  - saída diferente da hora de fim marcada (não nos clientes "Coifa");
 *  - clientes "Coifa": mais de 6 h de trabalho.
 * Horas marcadas são "hora de parede" (06:00 gravado como 06:00Z); o ponto é o
 * instante real, lido no fuso de onde o funcionário marcou (telemóvel).
 * Hora marcada 00:00 = tarefa sem horário (mesma convenção do "Previsto").
 * FOLGA REMUNERADA nunca fica a vermelho.
 */
import { supabase } from "@/integrations/supabase/client";

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD HH:MM" da hora de parede (componentes UTC). */
function wallKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "YYYY-MM-DD HH:MM" do instante no fuso indicado (sem fuso válido: o do dispositivo). */
export function localKey(iso: string, timeZone?: string | null): string {
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      ...opts,
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(new Date(iso));
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", opts).formatToParts(new Date(iso));
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const hasTime = (iso: string | null | undefined): iso is string =>
  !!iso && !wallKey(iso).endsWith(" 00:00");

export type ScheduleCheckInput = {
  started_at: string;
  ended_at: string | null;
  effective_minutes: number | null;
  scheduled_for?: string | null;
  scheduled_end?: string | null;
  clientName?: string | null;
  timeZone?: string | null;
};

export type ScheduleFlags = { start: boolean; end: boolean; over6h: boolean; coifa: boolean };

export function isCoifaClient(name: string | null | undefined): boolean {
  return /coifa/i.test(name ?? "");
}

/** Cliente "FOLGA REMUNERADA": nunca fica a vermelho. */
export function isPaidDayOffClient(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "folga remunerada";
}

export function entryScheduleFlags(e: ScheduleCheckInput): ScheduleFlags {
  const coifa = isCoifaClient(e.clientName);
  if (isPaidDayOffClient(e.clientName)) return { start: false, end: false, over6h: false, coifa };
  const start =
    hasTime(e.scheduled_for) && localKey(e.started_at, e.timeZone) !== wallKey(e.scheduled_for);
  const end =
    !coifa &&
    !!e.ended_at &&
    hasTime(e.scheduled_end) &&
    localKey(e.ended_at, e.timeZone) !== wallKey(e.scheduled_end);
  const over6h = coifa && (e.effective_minutes ?? 0) > 360;
  return { start, end, over6h, coifa };
}

/** Fuso do telemóvel na marcação de início de cada ponto (sem erro: mapa vazio). */
export async function fetchEntryTimeZones(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from("time_entry_geopoints")
      .select("time_entry_id, device_fingerprint, created_at")
      .in("time_entry_id", ids)
      .eq("event_kind", "start")
      .order("created_at", { ascending: true });
    if (error) throw error;
    for (const row of (data ?? []) as {
      time_entry_id: string;
      device_fingerprint: { tz?: string } | null;
    }[]) {
      const tz = row.device_fingerprint?.tz;
      if (tz && !out.has(row.time_entry_id)) out.set(row.time_entry_id, tz);
    }
  } catch (err) {
    console.error("[punch] time zones unavailable", err);
  }
  return out;
}
