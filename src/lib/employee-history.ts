/**
 * Histórico do funcionário (auditoria) e pedidos de alteração de NIB/IBAN.
 *
 * O histórico é gravado pelo banco (gatilhos em profiles, user_roles e
 * employee_attachments) na timeline `activity_events` com
 * entity_type = 'employee' e entity_id = id do funcionário. O frontend só lê.
 */

export type EmployeeHistoryEvent = {
  id: string;
  action: string;
  actor_name: string | null;
  actor_role: string | null;
  summary: string;
  source: string;
  created_at: string;
  changes: Record<string, unknown> | null;
};

export type BankChangeStatus = "pendente" | "aprovado" | "rejeitado" | "cancelado";

export type BankChangeRequest = {
  id: string;
  company_id: string;
  user_id: string;
  iban: string;
  swift: string | null;
  note: string | null;
  status: BankChangeStatus;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
};

/** Chaves de `changes` que não são campos alterados (contexto do evento). */
const CONTEXT_KEYS = new Set(["Funcionário"]);

/** Campos que aparecem num evento (para o filtro "por campo"). */
export function eventFields(event: Pick<EmployeeHistoryEvent, "changes">): string[] {
  if (!event.changes || typeof event.changes !== "object") return [];
  return Object.keys(event.changes).filter((key) => !CONTEXT_KEYS.has(key));
}

/** Lista ordenada (A–Z) de todos os campos presentes no histórico. */
export function historyFieldOptions(events: Pick<EmployeeHistoryEvent, "changes">[]): string[] {
  const set = new Set<string>();
  for (const event of events) for (const field of eventFields(event)) set.add(field);
  return [...set].sort((a, b) => a.localeCompare(b, "pt"));
}

/** Eventos que tocam um campo; sem campo escolhido devolve todos. */
export function filterHistoryByField<T extends Pick<EmployeeHistoryEvent, "changes">>(
  events: T[],
  field: string | null,
): T[] {
  if (!field) return events;
  return events.filter((event) => eventFields(event).includes(field));
}

/** IBAN sem espaços, em maiúsculas. */
export function normalizeIban(value: string): string {
  return value.replace(/[\s.-]/g, "").toUpperCase();
}

/** Mesma validação do banco: formato + dígitos de controlo (mod 97). */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    if (/[0-9]/.test(ch)) remainder = (remainder * 10 + Number(ch)) % 97;
    else remainder = (remainder * 100 + (ch.charCodeAt(0) - 55)) % 97;
  }
  return remainder === 1;
}

/** SWIFT/BIC opcional: vazio é válido. */
export function isValidSwift(value: string): boolean {
  const swift = value.replace(/\s/g, "").toUpperCase();
  return swift === "" || /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift);
}

/** Mostra só os últimos 4 caracteres (igual ao banco). */
export function maskIban(value: string | null | undefined): string {
  const clean = (value ?? "").replace(/\s/g, "");
  if (!clean) return "—";
  return clean.length <= 4 ? "••••" : `•••• ${clean.slice(-4)}`;
}

/** IBAN completo em grupos de 4, para o gestor conferir antes de aprovar. */
export function formatIban(value: string | null | undefined): string {
  return normalizeIban(value ?? "")
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export const BANK_STATUS_LABEL: Record<BankChangeStatus, string> = {
  pendente: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
};
