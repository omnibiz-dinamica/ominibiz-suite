/**
 * OmniBiz · Domain Events — contratos de tipos (SCAFFOLD)
 *
 * Fase 4: apenas reserva de espaço. Não usar em produção.
 * Ver `src/lib/events/README.md` e `docs/ARCHITECTURE_PRINCIPLES.md §5`.
 */

export type DomainAggregate =
  | "task"
  | "vacation"
  | "expense"
  | "payslip"
  | "contract"
  | "vehicle"
  | "fuel_record"
  | "client"
  | "time_entry";

/** Nomenclatura obrigatória: `<aggregate>.<past_participle>`. */
export type DomainEventType = `${DomainAggregate}.${string}`;

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  occurred_at: string; // ISO 8601 (UTC, servidor)
  company_id: string;
  actor_id: string | null;
  aggregate_type: DomainAggregate;
  aggregate_id: string;
  event_type: DomainEventType;
  payload: TPayload;
  version: number;
  ai_metadata: Record<string, unknown> | null;
}

/**
 * Placeholder — implementação real virá server-side em fase futura.
 * Nunca importar/usar em componentes ou server functions ativos.
 */
export type EmitEvent = <T extends Record<string, unknown>>(
  event: Omit<DomainEvent<T>, "id" | "occurred_at" | "version">,
) => Promise<void>;