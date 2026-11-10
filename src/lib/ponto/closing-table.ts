/**
 * Fechamento mensal: "Folha" e "Conferência Previsto x Real" numa só tabela
 * (pedido do dono, 10/11/2026).
 *
 * Só apresentação. Junta, por dia do mês:
 *  - as linhas da conferência (tarefas previstas, faltas e pontos sem previsto);
 *  - os registos da folha que a conferência não cobre (folga remunerada, férias);
 *  - os dias sem nada, para o gestor poder "Adicionar ponto".
 * As regras e as permissões continuam no banco.
 */
import type { SnapshotDay, SnapshotEntry, TimesheetSnapshot } from "@/lib/timesheet";
import type { ReconciliationRow } from "@/lib/ponto/reconciliation";

export type ClosingRowKind = "reconciliation" | "paid_leave" | "sheet" | "vacation" | "empty";

/** Folga remunerada: ponto do tipo folga OU tarefa do cliente "FOLGA REMUNERADA". */
export function isPaidLeaveEntry(e: Pick<SnapshotEntry, "entry_kind" | "client_name">): boolean {
  return (
    (e.entry_kind ?? "work") === "paid_leave" ||
    (e.client_name ?? "").trim().toLowerCase() === "folga remunerada"
  );
}

export interface ClosingRow {
  key: string;
  date: string;
  kind: ClosingRowKind;
  /** Primeira linha do dia (mostra a data). */
  firstOfDay: boolean;
  recon: ReconciliationRow | null;
  /** Registo da folha (folga remunerada). */
  entry: SnapshotEntry | null;
  breakMinutes: number | null;
  /** Observação que o funcionário escreveu ao concluir a tarefa (da folha). */
  note: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: string | null | undefined) => String(d ?? "").slice(0, 10);

function monthKeys(year: number, month: number): string[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);
}

/** Pausas dos pontos da folha que pertencem a esta linha da conferência. */
function breakFor(row: ReconciliationRow, entries: SnapshotEntry[]): number | null {
  if (row.entries_count === 0) return null;
  const mine = entries.filter((e) =>
    row.task_id ? e.task_id === row.task_id : e.time_entry_id === row.time_entry_id,
  );
  if (mine.length === 0) return null;
  return mine.reduce((s, e) => s + (e.break_minutes ?? 0), 0);
}

/** Todas as datas do mês, cada uma com as suas linhas (pelo menos uma). */
export function buildClosingRows(
  year: number,
  month: number,
  recon: ReconciliationRow[],
  snapshot: Pick<TimesheetSnapshot, "days"> | null | undefined,
): ClosingRow[] {
  const reconByDay = new Map<string, ReconciliationRow[]>();
  for (const r of recon) {
    const k = keyOf(r.work_date);
    reconByDay.set(k, [...(reconByDay.get(k) ?? []), r]);
  }
  const dayByKey = new Map<string, SnapshotDay>();
  for (const d of snapshot?.days ?? []) dayByKey.set(keyOf(d.work_date), d);

  const keys = new Set(monthKeys(year, month));
  for (const k of reconByDay.keys()) if (k.startsWith(`${year}-${pad(month)}-`)) keys.add(k);

  // O que a conferência já mostra (o resto da folha aparece à parte, nunca some).
  const coveredTasks = new Set(recon.map((r) => r.task_id).filter(Boolean) as string[]);
  const coveredEntries = new Set(recon.map((r) => r.time_entry_id).filter(Boolean) as string[]);

  const out: ClosingRow[] = [];
  for (const date of [...keys].sort()) {
    const day = dayByKey.get(date);
    const entries = day?.entries ?? [];
    const rows: Omit<ClosingRow, "firstOfDay">[] = [];

    for (const r of reconByDay.get(date) ?? []) {
      rows.push({
        key: `r:${r.row_key}`,
        date,
        kind: "reconciliation",
        recon: r,
        entry: null,
        breakMinutes: breakFor(r, entries),
        note:
          (r.task_id && (day?.task_notes ?? []).find((n) => n.task_id === r.task_id)?.note) || null,
      });
    }
    // Folga remunerada (e qualquer ponto que a conferência não cubra) vem da folha.
    for (const e of entries) {
      if (e.task_id ? coveredTasks.has(e.task_id) : coveredEntries.has(e.time_entry_id)) continue;
      rows.push({
        key: `l:${e.time_entry_id}`,
        date,
        kind: isPaidLeaveEntry(e) ? "paid_leave" : "sheet",
        recon: null,
        entry: e,
        breakMinutes: null,
        note: null,
      });
    }
    if (rows.length === 0 && day?.day_type === "vacation") {
      rows.push({
        key: `v:${date}`,
        date,
        kind: "vacation",
        recon: null,
        entry: null,
        breakMinutes: null,
        note: null,
      });
    }
    if (rows.length === 0) {
      rows.push({
        key: `e:${date}`,
        date,
        kind: "empty",
        recon: null,
        entry: null,
        breakMinutes: null,
        note: null,
      });
    }
    rows.forEach((r, i) => out.push({ ...r, firstOfDay: i === 0 }));
  }
  return out;
}

/** Folha assinada/fechada: ações por linha bloqueadas (corrige-se em "Corrigir pontos"). */
export const CLOSING_LOCKED_STATUSES = [
  "assinado_funcionario",
  "em_conferencia",
  "fechado_gestor",
  "disponivel_contabilidade",
] as const;

export function isClosingLocked(row: { status: string; current_version: number }): boolean {
  return (
    row.current_version > 0 || (CLOSING_LOCKED_STATUSES as readonly string[]).includes(row.status)
  );
}

/** Início e fim sugeridos ao adicionar ponto num dia vazio (hora de parede, 08:00–12:00). */
export function addPointDefaults(date: string): { startedAt: string; endedAt: string } {
  return { startedAt: `${date}T08:00:00Z`, endedAt: `${date}T12:00:00Z` };
}

/**
 * Horário previsto para "Lançar ponto" numa falta. Nas recorrências o
 * scheduled_end guarda o FIM DA SÉRIE: usa-se só a hora, no dia da ocorrência.
 */
export function launchDefaults(
  scheduledFor: string | null | undefined,
  scheduledEnd: string | null | undefined,
): { startedAt: string | null; endedAt: string | null } {
  if (!scheduledFor) return { startedAt: null, endedAt: null };
  if (!scheduledEnd) return { startedAt: scheduledFor, endedAt: null };
  const day = scheduledFor.slice(0, 10);
  if (scheduledEnd.slice(0, 10) === day) return { startedAt: scheduledFor, endedAt: scheduledEnd };
  const time = /T(\d{2}:\d{2})/.exec(scheduledEnd)?.[1];
  return { startedAt: scheduledFor, endedAt: time ? `${day}T${time}:00Z` : null };
}
