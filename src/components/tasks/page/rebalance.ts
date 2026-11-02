// Tarefas · divisão de horas entre colegas da mesma tarefa ao excluir (extraído de app.tarefas.tsx).

import { supabase } from "@/integrations/supabase/client";
import { parseHabitualSchedule, teamStartTimeFor, type TeamStartVariation } from "@/lib/tasks/client-schedule";
import { distributeContractedMinutes } from "@/lib/tasks/contracted-hours";


import { wallISOToDateInput, wallDateTimeToISO, formatWallTime } from "@/lib/wall-clock";
/**
 * Divisão de horas contratadas entre colegas da mesma tarefa (mesmo task_group_id e dia).
 * Antes de excluir, guarda o grupo; só considera "dividido" quando todos começam à mesma hora
 * e a soma das durações é igual às horas contratadas do cliente.
 */
export type RebalanceTask = {
  id: string;
  scheduled_for: string | null;
  scheduled_end: string | null;
  recurrence_date: string | null;
  due_at: string | null;
  status: string;
};
export type RebalanceSnapshot = {
  total: number;
  group: RebalanceTask[];
  /** Entradas alternativas por nº de pessoas da programação do cliente para este dia (se houver). */
  teamVariations?: TeamStartVariation[];
};
export type RebalanceResult =
  | { kind: "updated"; count: number; minutes: number[]; startTime?: string }
  | { kind: "skipped_started" }
  | { kind: "none" };

/**
 * Programação do cliente a que pertence a tarefa do grupo: primeiro pelo nome
 * da programação gravado na tarefa; senão pelo dia da semana + hora de entrada
 * (normal ou alternativa). Só devolve quando há UMA correspondência certa.
 */
export async function teamVariationsForGroup(
  clientId: string | null,
  scheduleName: string | null,
  scheduledFor: string,
): Promise<TeamStartVariation[] | undefined> {
  if (!clientId) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from("clients" as never) as any)
    .select("habitual_schedule")
    .eq("id", clientId)
    .maybeSingle();
  const slots = parseHabitualSchedule(data?.habitual_schedule).filter(
    (slot) => slot.active !== false && (slot.teamVariations?.length ?? 0) > 0,
  );
  if (slots.length === 0) return undefined;
  const name = scheduleName?.trim();
  if (name) {
    const named = slots.filter((slot) => slot.label?.trim() === name);
    if (named.length === 1) return named[0].teamVariations;
    if (named.length > 1) return undefined;
  }
  const weekday = new Date(scheduledFor).getUTCDay();
  const time = formatWallTime(scheduledFor);
  const matches = slots.filter(
    (slot) =>
      (slot.weekdays.length === 0 || slot.weekdays.includes(weekday)) &&
      (slot.startTime === time || (slot.teamVariations ?? []).some((v) => v.startTime === time)),
  );
  return matches.length === 1 ? matches[0].teamVariations : undefined;
}

export const rebalanceDayKey = (t: { recurrence_date: string | null; scheduled_for: string | null; due_at: string | null }) =>
  t.recurrence_date ?? (t.scheduled_for ?? t.due_at ?? "").slice(0, 10);

export async function snapshotGroupForRebalance(
  ids: string[],
  contractedOf: (clientId: string | null) => number | null,
): Promise<RebalanceSnapshot | null> {
  try {
    if (ids.length === 0) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: base } = await (supabase.from("tasks" as never) as any)
      .select("id, task_group_id, client_id, schedule_name, scheduled_for, recurrence_date, due_at")
      .eq("id", ids[0])
      .maybeSingle();
    if (!base?.task_group_id) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mates, error } = await (supabase.from("tasks" as never) as any)
      .select("id, scheduled_for, scheduled_end, recurrence_date, due_at, status")
      .eq("task_group_id", base.task_group_id)
      .is("deleted_at", null);
    if (error || !mates) return null;
    const day = rebalanceDayKey(base);
    const group = (mates as RebalanceTask[]).filter(
      (t) => rebalanceDayKey(t) === day && String(t.status) !== "cancelado",
    );
    if (group.length < 2) return null;
    const start = group[0].scheduled_for;
    if (!start || group.some((t) => t.scheduled_for !== start || !t.scheduled_end)) return null;
    const durations = group.map((t) =>
      Math.round((Date.parse(t.scheduled_end as string) - Date.parse(t.scheduled_for as string)) / 60000),
    );
    if (durations.some((m) => !(m > 0))) return null;
    const total = durations.reduce((a, b) => a + b, 0);
    const contracted = contractedOf(base.client_id ?? null);
    if (contracted == null || Math.abs(total - contracted) > 1) return null;
    let teamVariations: TeamStartVariation[] | undefined;
    try {
      teamVariations = await teamVariationsForGroup(base.client_id ?? null, base.schedule_name ?? null, start);
    } catch {
      teamVariations = undefined;
    }
    return { total, group, teamVariations };
  } catch {
    return null;
  }
}

export async function applyGroupRebalance(snapshot: RebalanceSnapshot, deletedIds: Set<string>): Promise<RebalanceResult> {
  const remaining = snapshot.group.filter((t) => !deletedIds.has(t.id));
  if (remaining.length === 0 || remaining.length === snapshot.group.length) return { kind: "none" };
  // Não mexe em tarefas já iniciadas, concluídas ou ausentes.
  if (remaining.some((t) => !["pendente", "autorizado"].includes(String(t.status)))) {
    return { kind: "skipped_started" };
  }
  const shares = distributeContractedMinutes(snapshot.total, remaining.length);
  // Entrada alternativa da programação do cliente para quem fica (ex.: 1 pessoa entra às 07:30).
  // Sem variação para esse número de pessoas, a entrada mantém-se (comportamento anterior).
  const newStartTime = teamStartTimeFor({ teamVariations: snapshot.teamVariations }, remaining.length);
  const minutes: number[] = [];
  for (const [index, t] of remaining.entries()) {
    const share = shares[index] ?? shares[0] ?? 0;
    if (!(share > 0) || !t.scheduled_for) continue;
    const start =
      (newStartTime ? wallDateTimeToISO(wallISOToDateInput(t.scheduled_for), newStartTime) : null) ?? t.scheduled_for;
    const end = new Date(Date.parse(start) + share * 60000).toISOString();
    const patch = start !== t.scheduled_for
      ? { scheduled_for: start, scheduled_end: end, due_at: end }
      : { scheduled_end: end, due_at: end };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedRows, error } = await (supabase.from("tasks" as never) as any)
      .update(patch)
      .eq("id", t.id)
      .select("id");
    // Só conta se a linha foi mesmo alterada (a RLS pode bloquear sem devolver erro).
    if (!error && Array.isArray(updatedRows) && updatedRows.length > 0) minutes.push(share);
  }
  return minutes.length > 0
    ? { kind: "updated", count: minutes.length, minutes, ...(newStartTime ? { startTime: newStartTime } : {}) }
    : { kind: "none" };
}
