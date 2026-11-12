// Tarefas · tipos, filtros e caches partilhados pelo ecrã de tarefas (extraído de app.tarefas.tsx).

import { getRouteApi } from "@tanstack/react-router";
import { firstNameOf } from "@/lib/person-name";
import i18n from "@/i18n";
import { type TaskAction, type TaskRow, type TimeEntryRow } from "@/lib/tasks";

import { type TaskRefusalRecord } from "@/lib/task-refusal-view";

export const tt = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { defaultValue: key, ...opts }) as string;

// Filtros aceitos via search-params. `atrasadas` e `canceladas` são filtros
// derivados e compartilham as regras canônicas do dashboard.
export const STATUS_FILTERS = [
  "pendente",
  "autorizado",
  "em_andamento",
  "concluido",
  "cancelado",
  "ausente",
  "atrasadas",
  "canceladas",
  "recusadas",
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type TasksSearch = { status?: StatusFilter; employee?: string; client?: string; task?: string; date?: string };
export type ClientOption = {
  id: string;
  name: string;
  timing_mode?: "start_stop" | "manual" | null;
  contracted_minutes?: number | null;
};
// Decisão do dono: as tarefas não têm título próprio; o nome do CLIENTE é exibido em
// negrito como título. Cache alimentado pela lista de clientes da empresa ativa; sem
// cliente (ou cliente fora da lista), cai no título gravado na tarefa.
export const clientNameCache = new Map<string, string>();
/** "Instruções adicionais" do cliente (clients.instructions), para o calendário. Vazio = sem instruções. */
export const clientInstructionsCache = new Map<string, string>();
/** Endereço do cliente (clients.address / geo) para a lista e o calendário de tarefas. */
export type TaskClientAddressInfo = { address: string | null; lat: number | null; lng: number | null };
export const clientAddressCache = new Map<string, TaskClientAddressInfo>();
export function taskClientInstructions(t: { client_id?: string | null }): string | undefined {
  return t.client_id ? clientInstructionsCache.get(t.client_id) : undefined;
}
export function taskHeading(t: { client_id?: string | null; title?: string | null }): string {
  return (t.client_id ? clientNameCache.get(t.client_id) : undefined) || t.title || "Tarefa";
}
export type CompletionNote = {
  id: string;
  task_id: string;
  actor_user_id: string;
  created_at: string;
  reason: string | null;
};
export type ApprovedVacation = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: "aprovado";
};
export type CalendarMode = "day" | "week" | "month" | "year";

export type TaskMember = {
  id: string;
  full_name: string | null;
  job_title?: string | null;
  sector?: string | null;
  /** Ticket 172: número da equipa (1–10). */
  team_number?: number | null;
};

/**
 * 29092026-001 — nome COMPLETO (primeiro nome + apelido) em qualquer lugar que
 * liste, pesquise ou selecione funcionário. O corte, quando necessário, é
 * apenas visual (CSS truncate + tooltip), nunca na lógica ou no dado exibido.
 */
export function taskMemberName(members: readonly TaskMember[], id: string | null, unassigned = "Sem responsável") {
  if (!id) return unassigned;
  return members.find((member) => member.id === id)?.full_name?.trim() || "Funcionário";
}

/** Apenas para o selo compacto de tarefas em equipe, onde o espaço é mínimo. */
export function taskMemberFirstName(members: readonly TaskMember[], id: string | null) {
  if (!id) return "Sem responsável";
  return firstNameOf(members.find((member) => member.id === id)?.full_name) || "Funcionário";
}

// ---------------------------------------------------------------------------
// Agrupamento por funcionário (visão do gestor)
// ---------------------------------------------------------------------------

export interface RowHandlers {
  userId: string;
  isManager: boolean;
  onEdit: (t: TaskRow) => void;
  onEditSeries: (t: TaskRow) => void;
  onReassign: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
  onTransition: (task: TaskRow, action: TaskAction) => void;
  onArchive: (id: string, archive: boolean) => void;
  onMoveDate: (id: string, dateKey: string) => void;
  transitionPending: boolean;
  archivePending: boolean;
  completionNotes: ReadonlyMap<string, CompletionNote>;
  refusalsByTask: ReadonlyMap<string, TaskRefusalRecord[]>;
  memberNames: ReadonlyMap<string, string>;
  groupMemberNames?: ReadonlyMap<string, string>;
  taskPunches: ReadonlyMap<string, TimeEntryRow>;
  selectedTaskIds?: ReadonlySet<string>;
  onToggleTaskSelection?: (taskId: string) => void;
  onNoStartReason?: (task: TaskRow) => void;
}
/** Search params da rota /app/tarefas, para os componentes fora do ficheiro da rota. */
export const tasksRouteApi = getRouteApi("/app/tarefas");
