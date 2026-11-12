/**
 * Recusas do dia (ticket SUP-2026-000174, 12/11/2026).
 *
 * O cartão "Recusadas" do Dashboard conta as recusas FEITAS hoje (refused_at no
 * fuso da empresa), seja qual for o dia da tarefa — o mesmo critério das
 * notificações task_rejected, que chegam no momento da recusa. Uma tarefa
 * recusada e depois reatribuída/concluída, arquivada ou apagada não conta.
 */
import { inputInTzToIso, isoToInputInTz } from "@/lib/company-time";

export type RefusalTask = {
  status: string;
  refused_by?: string | null;
  refused_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
};

/** Dia (YYYY-MM-DD) em que a recusa foi feita, no fuso indicado. */
export function refusalDayKey(task: Pick<RefusalTask, "refused_at">, tz: string): string | null {
  if (!task.refused_at) return null;
  const local = isoToInputInTz(task.refused_at, tz);
  return local ? local.slice(0, 10) : null;
}

/** Recusa ainda válida (a tarefa continua recusada, não arquivada nem apagada). */
export function isActiveRefusal(task: RefusalTask): boolean {
  return (
    task.status === "cancelado" &&
    !!task.refused_by &&
    !!task.refused_at &&
    !task.archived_at &&
    !task.deleted_at
  );
}

export function isRefusedOn(task: RefusalTask, day: string, tz: string): boolean {
  return isActiveRefusal(task) && refusalDayKey(task, tz) === day;
}

/** Intervalo [início, fim) do dia no fuso indicado, em ISO (UTC), para a consulta. */
export function dayRangeInTz(day: string, tz: string): { from: string; to: string } {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  return { from: inputInTzToIso(`${day}T00:00`, tz)!, to: inputInTzToIso(`${next}T00:00`, tz)! };
}

/** Hoje (YYYY-MM-DD) no fuso indicado. */
export function todayInTz(tz: string, now = new Date()): string {
  return isoToInputInTz(now.toISOString(), tz).slice(0, 10);
}
