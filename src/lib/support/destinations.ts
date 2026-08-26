/**
 * OmniBiz · Destino (fila) do ticket — ADR-049.
 *
 * O destino é a FILA de atendimento («para quem vai o ticket») e não se confunde
 * com o RESPONSÁVEL (pessoa concreta, `assigned_user_id`). O catálogo vive na
 * tabela `public.support_destinations`, pelo que acrescentar RH, Financeiro,
 * Jurídico, etc. é apenas inserir uma linha — sem tocar no módulo.
 */
import {
  BarChart3,
  ClipboardList,
  LifeBuoy,
  Wrench,
  Scale,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface SupportDestination {
  code: string;
  label: string;
  description: string;
  icon: string;
  target_role: string | null;
  is_technical: boolean;
  sort_order: number;
  is_active: boolean;
}

/** Ícones conhecidos; qualquer código novo cai no fallback. */
const ICONS: Record<string, LucideIcon> = {
  Wrench,
  BarChart3,
  ClipboardList,
  LifeBuoy,
  Scale,
  Users,
  Wallet,
};

export function destinationIcon(icon: string | null | undefined): LucideIcon {
  return (icon && ICONS[icon]) || LifeBuoy;
}

/** Emojis usados no resumo/listagens (alinhado com o pedido do produto). */
export const DESTINATION_EMOJI: Record<string, string> = {
  tech: "🛠",
  accounting: "📊",
  secretary: "📋",
};

export const DEFAULT_DESTINATION_CODE = "tech";

export const supportDestinationsQueryKey = ["support-destinations"] as const;

export async function fetchSupportDestinations(): Promise<SupportDestination[]> {
  const { data, error } = await (supabase as any)
    .from("support_destinations")
    .select("code, label, description, icon, target_role, is_technical, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SupportDestination[];
}

export function destinationLabel(
  code: string | null | undefined,
  list: SupportDestination[] | undefined,
): string {
  if (!code) return "Sem destino";
  return list?.find((d) => d.code === code)?.label ?? code;
}

/** Reencaminha o ticket para outra fila (gestor ou super admin). Auditado no servidor. */
export async function setTicketDestination(
  ticketId: string,
  destinationCode: string,
  reason?: string | null,
): Promise<void> {
  const { error } = await (supabase as any).rpc("support_set_ticket_destination", {
    _ticket_id: ticketId,
    _destination_code: destinationCode,
    _reason: reason ?? null,
  });
  if (error) throw error;
}
