import { resolveOperationalStatus, wallClockEpoch } from "./operational-rules.ts";

/**
 * Contadores canónicos do Dashboard.
 *
 * Regras (14092026-D):
 * - o dia operacional vem de scheduled_for -> recurrence_date -> due_at,
 *   NUNCA de created_at;
 * - as categorias são mutuamente exclusivas (uma tarefa conta uma única vez);
 * - o "zero diário" é apenas um filtro de data: nada é apagado ou alterado.
 */

export type DashboardTaskInput = {
  id?: string;
  status: string;
  scheduled_for?: string | null;
  recurrence_date?: string | null;
  due_at?: string | null;
  started_at?: string | null;
  refused_by?: string | null;
  absence_source?: string | null;
  absence_reason?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
};

export type DashboardBucket =
  | "pendente"
  | "em_andamento"
  | "concluido"
  | "atrasada"
  | "cancelada"
  | "recusada"
  | "ausente";

export type DashboardCompanyRole = {
  user_id: string;
  role: string;
};

/**
 * Responsáveis operacionais do Dashboard. Um utilizador que também possua
 * função de gestor/owner deixa de contar, mesmo que conserve outro papel.
 */
export function dashboardOperationalAssigneeIds(roles: readonly DashboardCompanyRole[]): string[] {
  const managers = new Set(
    roles
      .filter(({ role }) => role === "manager" || role === "owner" || role === "super_admin")
      .map(({ user_id }) => user_id),
  );
  return [...new Set(roles.map(({ user_id }) => user_id).filter((userId) => !managers.has(userId)))];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Dia local (fuso operacional do dispositivo/empresa) no formato YYYY-MM-DD. */
export function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Dia operacional da tarefa, lido em wall-clock (sem conversão de fuso). */
export function taskOperationalDay(task: DashboardTaskInput): string | null {
  const source = task.scheduled_for ?? task.recurrence_date ?? task.due_at;
  if (!source) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;
  const parsed = new Date(source);
  if (!Number.isFinite(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
}

function operationalDeadlineMs(task: DashboardTaskInput): number | null {
  const source = task.scheduled_for ?? task.due_at;
  if (source) {
    const ms = new Date(source).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const day = taskOperationalDay(task);
  if (!day) return null;
  const ms = new Date(`${day}T23:59:59.000Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Uma tarefa pertence a exactamente uma categoria (ou a nenhuma). */
export function classifyDashboardTask(task: DashboardTaskInput, now = new Date()): DashboardBucket | null {
  if (task.archived_at || task.deleted_at) return null;

  if (task.status === "cancelado") return task.refused_by ? "recusada" : "cancelada";
  if (task.status === "concluido") return "concluido";

  // A lista de Tarefas já corrige ausências automáticas gravadas antes da
  // janela de 24h. O Dashboard precisa usar exactamente a mesma fonte de
  // verdade para nunca mostrar Ausente num lugar e Atrasada no outro.
  if (task.status === "ausente") {
    const operationalStatus = resolveOperationalStatus(
      {
        status: "ausente",
        scheduled_for: task.scheduled_for,
        recurrence_date: task.recurrence_date,
        due_at: task.due_at,
        absence_source: task.absence_source,
        absence_reason: task.absence_reason,
      },
      now,
    );
    return operationalStatus === "atrasada" ? "atrasada" : "ausente";
  }
  if (task.status === "em_andamento") return "em_andamento";
  if (task.status !== "pendente" && task.status !== "autorizado") return null;

  const deadline = operationalDeadlineMs(task);
  if (deadline !== null && wallClockEpoch(now) > deadline) return "atrasada";
  return "pendente";
}

export type DashboardCounts = Record<DashboardBucket, number>;

export function emptyDashboardCounts(): DashboardCounts {
  return {
    pendente: 0,
    em_andamento: 0,
    concluido: 0,
    atrasada: 0,
    cancelada: 0,
    recusada: 0,
    ausente: 0,
  };
}

/**
 * Conta as tarefas do dia operacional indicado. Sem `day`, conta tudo o que foi
 * carregado (usado pelo modo histórico da própria página).
 */
export function countDashboardTasks(
  tasks: readonly DashboardTaskInput[] | undefined | null,
  options: { day?: string | null; now?: Date } = {},
): DashboardCounts {
  const counts = emptyDashboardCounts();
  const now = options.now ?? new Date();
  const day = options.day ?? null;
  const seen = new Set<string>();

  for (const task of tasks ?? []) {
    if (task.id) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
    }
    if (day && taskOperationalDay(task) !== day) continue;
    const bucket = classifyDashboardTask(task, now);
    if (bucket) counts[bucket] += 1;
  }

  return counts;
}

/** Filtro de lista alinhado com os cartões do Dashboard. */
export function matchesDashboardBucket(
  task: DashboardTaskInput,
  bucket: DashboardBucket,
  now = new Date(),
): boolean {
  return classifyDashboardTask(task, now) === bucket;
}
