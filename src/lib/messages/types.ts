/**
 * Módulo "Mensagens" (adicional whatsapp_ai) — tipos das tabelas msg_*.
 *
 * As tabelas foram criadas por SQL corrido no editor do Lovable Cloud, por isso
 * ainda não estão em src/integrations/supabase/types.ts. Estes tipos espelham
 * exatamente as colunas do script whatsapp_ai_etapa1_aplicar.sql.
 */

export type MsgChannelType = "instagram" | "whatsapp" | "messenger" | "webchat";
export type MsgChannelStatus = "desconectado" | "conectado" | "erro";

export interface MsgChannel {
  id: string;
  company_id: string;
  type: MsgChannelType;
  name: string;
  external_id: string | null;
  status: MsgChannelStatus;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type MsgContactStatus = "ativo" | "inativo";

export interface MsgContact {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  opted_in: boolean;
  last_interaction_at: string | null;
  status: MsgContactStatus;
  created_at: string;
  updated_at: string;
}

export interface MsgTag {
  id: string;
  company_id: string;
  name: string;
  folder: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MsgContactTag {
  company_id: string;
  contact_id: string;
  tag_id: string;
}

export type MsgFieldScope = "contato" | "conta";
export type MsgFieldType = "texto" | "numero" | "data" | "sim_nao";

export interface MsgCustomField {
  id: string;
  company_id: string;
  name: string;
  scope: MsgFieldScope;
  type: MsgFieldType;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MsgAutomationKind = "rapida" | "fluxo";
export type MsgAutomationStatus = "rascunho" | "ativa" | "parada";

export interface MsgAutomation {
  id: string;
  company_id: string;
  name: string;
  kind: MsgAutomationKind;
  status: MsgAutomationStatus;
  folder: string | null;
  deleted_at: string | null;
  runs_count: number;
  clicks_count: number;
  created_at: string;
  updated_at: string;
}

export const AUTOMATION_STATUS_LABEL: Record<MsgAutomationStatus, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  parada: "Parada",
};

export const FIELD_SCOPE_LABEL: Record<MsgFieldScope, string> = {
  contato: "Contato",
  conta: "Conta",
};

export const FIELD_TYPE_LABEL: Record<MsgFieldType, string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  sim_nao: "Sim/Não",
};
