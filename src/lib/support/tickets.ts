/**
 * OmniBiz · Módulo Central de Suporte — cliente browser.
 *
 * Toda a lógica de negócio vive em RPCs SECURITY DEFINER no Supabase
 * (ver migration create_support_ticket, post_support_ticket_message, etc.).
 * Esta camada apenas:
 *  - chama as RPCs;
 *  - faz upload direto ao bucket privado com signed URLs;
 *  - lê dados via Data API (RLS aplica).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENT_SIZE_BYTES,
  SUPPORT_BUCKET,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SupportTicketType,
} from "./constants";

export interface CreateTicketInput {
  companyId: string;
  type: SupportTicketType;
  priority: SupportTicketPriority;
  title: string;
  description: string;
  module?: string | null;
  route?: string | null;
  pageUrl?: string | null;
  technicalContext?: Record<string, unknown>;
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

async function sha256Hex(file: File): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export async function createTicket(input: CreateTicketInput): Promise<{ id: string; ticket_number: string }> {
  const { data, error } = await (supabase as any).rpc("create_support_ticket", {
    _company_id: input.companyId,
    _type: input.type,
    _priority: input.priority,
    _title: input.title.trim(),
    _description: input.description.trim(),
    _module: input.module ?? null,
    _route: input.route ?? null,
    _page_url: input.pageUrl ?? null,
    _technical_context: input.technicalContext ?? {},
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Falha ao criar ticket");
  return { id: row.id as string, ticket_number: row.ticket_number as string };
}

export async function postMessage(ticketId: string, message: string, isInternal = false): Promise<string> {
  const { data, error } = await (supabase as any).rpc("post_support_ticket_message", {
    _ticket_id: ticketId,
    _message: message.trim(),
    _is_internal: isInternal,
  });
  if (error) throw error;
  return data as string;
}

export async function updateStatus(
  ticketId: string,
  newStatus: SupportTicketStatus,
  reason: string | null = null,
): Promise<void> {
  const { error } = await (supabase as any).rpc("update_support_ticket_status", {
    _ticket_id: ticketId,
    _new_status: newStatus,
    _reason: reason,
  });
  if (error) throw error;
}

export async function updatePriority(ticketId: string, newPriority: SupportTicketPriority): Promise<void> {
  const { error } = await (supabase as any).rpc("update_support_ticket_priority", {
    _ticket_id: ticketId,
    _new_priority: newPriority,
  });
  if (error) throw error;
}

export async function assignTicket(ticketId: string, assigneeUserId: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc("assign_support_ticket", {
    _ticket_id: ticketId,
    _assignee_user_id: assigneeUserId,
  });
  if (error) throw error;
}

export async function reopenTicket(ticketId: string, reason: string): Promise<void> {
  const { error } = await (supabase as any).rpc("reopen_support_ticket", {
    _ticket_id: ticketId,
    _reason: reason,
  });
  if (error) throw error;
}

/**
 * Reabertura atómica com mensagem + encaminhamento (ADR-029).
 * Toda a lógica (validação, status, evento append-only e notificação)
 * vive na RPC public.reopen_support_ticket_with_message.
 */
export async function reopenTicketWithMessage(input: {
  ticketId: string;
  message: string;
  destinationType: "employee" | "technical";
  assignedUserId?: string | null;
  technicalContext?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await (supabase as any).rpc("reopen_support_ticket_with_message", {
    _ticket_id: input.ticketId,
    _message: input.message.trim(),
    _destination_type: input.destinationType,
    _assigned_user_id: input.assignedUserId ?? null,
    _technical_context: input.technicalContext ?? null,
  });
  if (error) throw error;
}

export async function closeTicket(ticketId: string, reason: string | null = null): Promise<void> {
  const { error } = await (supabase as any).rpc("close_support_ticket", {
    _ticket_id: ticketId,
    _reason: reason,
  });
  if (error) throw error;
}

export interface UploadAttachmentResult {
  attachmentId: string;
  storagePath: string;
  fileName: string;
}

export async function uploadAttachment(
  ticketId: string,
  companyId: string,
  file: File,
): Promise<UploadAttachmentResult> {
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error("Arquivo excede o limite permitido (20 MB).");
  }
  if (!ALLOWED_ATTACHMENT_MIME.has(file.type)) {
    throw new Error(`Tipo de arquivo não permitido: ${file.type || "desconhecido"}.`);
  }

  const safeName = sanitizeFileName(file.name || "arquivo");
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${companyId}/${ticketId}/${uuid}-${safeName}`;

  const hash = await sha256Hex(file);

  const { error: upErr } = await supabase.storage.from(SUPPORT_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data, error } = await (supabase as any).rpc("register_support_attachment", {
    _ticket_id: ticketId,
    _storage_path: path,
    _file_name: file.name,
    _mime_type: file.type,
    _size_bytes: file.size,
    _sha256_hex: hash,
  });
  if (error) {
    // Best-effort cleanup
    await supabase.storage
      .from(SUPPORT_BUCKET)
      .remove([path])
      .catch(() => {});
    throw error;
  }

  return { attachmentId: data as string, storagePath: path, fileName: file.name };
}

export async function signedAttachmentUrl(storagePath: string, expiresInSec = 600): Promise<string> {
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(storagePath, expiresInSec);
  if (error || !data?.signedUrl) throw error ?? new Error("Falha ao gerar URL");
  return data.signedUrl;
}

export function collectTechnicalContext(extra?: Record<string, unknown>): Record<string, unknown> {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const win = typeof window !== "undefined" ? window : null;
  return {
    user_agent: nav?.userAgent ?? null,
    language: nav?.language ?? null,
    platform: (nav as any)?.platform ?? null,
    screen: win ? `${win.screen?.width}x${win.screen?.height}` : null,
    viewport: win ? `${win.innerWidth}x${win.innerHeight}` : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    build: (import.meta.env.VITE_BUILD_TIME as string | undefined) ?? "dev",
    commit: (import.meta.env.VITE_COMMIT_SHA as string | undefined) ?? "dev",
    pathname: win?.location?.pathname ?? null,
    href: win?.location?.href ?? null,
    ...(extra ?? {}),
  };
}
