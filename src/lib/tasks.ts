import { supabase } from "@/integrations/supabase/client";

// Status persistidos (fonte única de verdade no banco)
export const TASK_STATUSES = [
  "pendente",
  "autorizado",
  "em_andamento",
  "concluido",
  "cancelado",
  "ausente",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_ACTIONS = [
  "autorizar",
  "iniciar",
  "concluir",
  "cancelar",
  "marcar_ausente",
] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: "Pendente",
  autorizado: "Autorizado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  ausente: "Ausente",
};

export const STATUS_TONE: Record<TaskStatus, string> = {
  pendente: "bg-info/15 text-info",
  autorizado: "bg-warning/15 text-warning-foreground",
  em_andamento: "bg-primary/15 text-primary",
  concluido: "bg-success/15 text-success",
  cancelado: "bg-muted text-muted-foreground",
  ausente: "bg-destructive/15 text-destructive",
};

export const TERMINAL_STATUSES: TaskStatus[] = ["concluido", "cancelado", "ausente"];

export interface TaskRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: "baixa" | "media" | "alta" | "urgente";
  assigned_to: string | null;
  created_by: string;
  client_id: string | null;
  scheduled_for: string | null;
  scheduled_end: string | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  authorized_at: string | null;
  cancelled_at: string | null;
  marked_absent_at: string | null;
  absence_grace_minutes: number;
  created_at: string;
  updated_at: string;
}

/**
 * Indicador puramente visual — "atrasado" NÃO é persistido.
 * Calculado apenas para renderização.
 */
export function isVisuallyLate(task: Pick<TaskRow, "status" | "scheduled_for">): boolean {
  if (!task.scheduled_for) return false;
  if (task.status === "concluido" || task.status === "cancelado" || task.status === "ausente") return false;
  return new Date(task.scheduled_for).getTime() < Date.now();
}

/**
 * Ações permitidas para um usuário sobre uma tarefa.
 * Mantém UI espelhada às regras do banco (a regra final está em task_transition).
 */
export function availableActions(
  task: Pick<TaskRow, "status" | "assigned_to">,
  ctx: { userId: string; isManager: boolean },
): TaskAction[] {
  const isAssignee = task.assigned_to === ctx.userId;
  const out: TaskAction[] = [];
  if (TERMINAL_STATUSES.includes(task.status)) return out;

  if (task.status === "pendente" && ctx.isManager) out.push("autorizar");
  if ((task.status === "pendente" || task.status === "autorizado") && (isAssignee || ctx.isManager))
    out.push("iniciar");
  if (task.status === "em_andamento" && (isAssignee || ctx.isManager)) out.push("concluir");
  if (ctx.isManager && (task.status === "pendente" || task.status === "autorizado"))
    out.push("marcar_ausente");
  if (ctx.isManager) out.push("cancelar");

  return out;
}

export const ACTION_LABELS: Record<TaskAction, string> = {
  autorizar: "Autorizar",
  iniciar: "Iniciar",
  concluir: "Concluir",
  cancelar: "Cancelar",
  marcar_ausente: "Marcar ausente",
};

/**
 * Executa uma transição via RPC central. Toda regra de negócio
 * (validação, carimbo de tempo, permissões) vive no banco.
 */
export async function transitionTask(taskId: string, action: TaskAction): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_transition", {
    _task_id: taskId,
    _action: action,
  });
  if (error) throw error;
  return data as TaskRow;
}

/**
 * Processa ausências por evento (chamado no carregamento da tela
 * ou após ações pontuais). NUNCA em loop.
 */
export async function sweepAbsent(companyId: string | null): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("tasks_sweep_absent", {
    _company_id: companyId,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// =========================================================
// Folha de ponto — extensão operacional da tarefa
// =========================================================
export interface TimeEntryRow {
  id: string;
  company_id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  paused_at: string | null;
  resumed_at: string | null;
  ended_at: string | null;
  effective_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PunchState = "aberto" | "pausado" | "encerrado";

export function punchState(entry: Pick<TimeEntryRow, "paused_at" | "resumed_at" | "ended_at">): PunchState {
  if (entry.ended_at) return "encerrado";
  if (entry.paused_at && !entry.resumed_at) return "pausado";
  return "aberto";
}

export async function punchPause(note?: string): Promise<TimeEntryRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_pause", { _note: note ?? null });
  if (error) throw error;
  return data as TimeEntryRow;
}

export async function punchResume(): Promise<TimeEntryRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_resume");
  if (error) throw error;
  return data as TimeEntryRow;
}

/** Solicita nova autorização para uma tarefa ausente/rejeitada. Volta a 'pendente'. */
export async function requestTaskAuthorization(taskId: string, note?: string): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_request_authorization", {
    _task_id: taskId,
    _note: note ?? null,
  });
  if (error) throw error;
  return data as TaskRow;
}

/** Duração efetiva (minutos) considerando pausa em curso para exibição. */
export function effectiveMinutesNow(e: TimeEntryRow): number {
  const start = new Date(e.started_at).getTime();
  const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now();
  let pauseMs = 0;
  if (e.paused_at) {
    const p = new Date(e.paused_at).getTime();
    const r = e.resumed_at ? new Date(e.resumed_at).getTime() : (e.ended_at ? new Date(e.ended_at).getTime() : Date.now());
    pauseMs = Math.max(0, r - p);
  }
  return Math.max(0, Math.floor((end - start - pauseMs) / 60000));
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}