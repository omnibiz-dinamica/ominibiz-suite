/**
 * SUP-2026-000331 (17/11/2026) — estado único da despesa.
 *
 * Pendente → (aprovar) Aprovada → Aguarda pagamento → Paga, ou Rejeitada.
 * No banco: status = pendente/aprovada/rejeitada e, nas aprovadas,
 * payment_status = NULL (Aprovada) / 'aguardando_pagamento' / 'paga'.
 * O cartão mostra só UM estado; a mudança faz-se no lápis (editar).
 */
export type ExpenseStage = "pendente" | "rejeitada" | "aprovada" | "aguardando_pagamento" | "paga";
/** Estados que o gestor pode escolher numa despesa aprovada (+ voltar a pendente). */
export type ApprovedStage = "aprovada" | "aguardando_pagamento" | "paga";

export function expenseStage(r: { status: string; payment_status: string | null }): ExpenseStage {
  if (r.status === "pendente") return "pendente";
  if (r.status === "rejeitada") return "rejeitada";
  if (r.payment_status === "paga") return "paga";
  if (r.payment_status === "aguardando_pagamento") return "aguardando_pagamento";
  return "aprovada";
}

export const STAGE_LABEL: Record<ExpenseStage, string> = {
  pendente: "Pendente",
  rejeitada: "Rejeitada",
  aprovada: "Aprovada",
  aguardando_pagamento: "Aguarda pagamento",
  paga: "Paga",
};

export const STAGE_TONE: Record<ExpenseStage, string> = {
  pendente: "bg-warning/15 text-warning-foreground",
  rejeitada: "bg-destructive/15 text-destructive",
  aprovada: "bg-primary/10 text-primary",
  aguardando_pagamento: "bg-warning/15 text-warning-foreground",
  paga: "bg-success/15 text-success",
};

/** Ordem do seletor no lápis (despesa aprovada). */
export const APPROVED_STAGES: ApprovedStage[] = ["aprovada", "aguardando_pagamento", "paga"];

/**
 * O que fazer ao guardar a edição: nada, voltar a pendente (reverter a
 * aprovação; só se não estiver paga) ou mudar o estado de pagamento.
 */
export function stageChange(
  current: ExpenseStage,
  target: ExpenseStage,
): { kind: "none" } | { kind: "revert" } | { kind: "payment"; value: ApprovedStage } {
  if (current === target) return { kind: "none" };
  if (current === "pendente" || current === "rejeitada") return { kind: "none" };
  if (target === "pendente") return current === "paga" ? { kind: "none" } : { kind: "revert" };
  if (target === "aprovada" || target === "aguardando_pagamento" || target === "paga") {
    return { kind: "payment", value: target };
  }
  return { kind: "none" };
}
