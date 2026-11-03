/**
 * Ponto offline — envio da fila para o servidor (`punch_offline_sync_v1`).
 * Envia por ordem, no máximo 50 por vez. Só tira da fila o que o servidor
 * aceitou; recusadas ficam marcadas para o funcionário ver o motivo.
 */
import { supabase } from "@/integrations/supabase/client";
import { addTaskCompletionNote } from "@/lib/tasks";
import {
  classifySyncResults,
  eventsFor,
  isNetworkFailureMessage,
  type OfflinePunchEvent,
  type OfflineQueueStorage,
} from "./offline-queue";

export interface OfflineSettings {
  enabled: boolean;
  maxHours: number;
}

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

const rpc = (name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(name, args) as Promise<RpcResult>;

const SETTINGS_KEY = (companyId: string) => `omnibiz:offline-punch:${companyId}`;

/** Interruptor da empresa; guarda o último valor para usar sem rede. */
export async function fetchOfflineSettings(companyId: string): Promise<OfflineSettings> {
  try {
    const { data, error } = await rpc("punch_offline_settings", { _company_id: companyId });
    if (error) throw error;
    const d = (data ?? {}) as { enabled?: boolean; max_hours?: number };
    const value = { enabled: !!d.enabled, maxHours: Number(d.max_hours ?? 0) };
    try {
      localStorage.setItem(SETTINGS_KEY(companyId), JSON.stringify(value));
    } catch {
      /* armazenamento indisponível */
    }
    return value;
  } catch (error) {
    try {
      const cached = localStorage.getItem(SETTINGS_KEY(companyId));
      if (cached) return JSON.parse(cached) as OfflineSettings;
    } catch {
      /* sem cópia guardada */
    }
    if (isNetworkFailureMessage((error as Error)?.message)) return { enabled: false, maxHours: 0 };
    throw error;
  }
}

/** Garante sessão válida antes de enviar (renova o token se expirou sem rede). */
async function ensureSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return false;
  const expiresMs = (session.expires_at ?? 0) * 1000;
  if (expiresMs && expiresMs - Date.now() < 60_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    return !error && !!refreshed.session;
  }
  return true;
}

function toPayload(e: OfflinePunchEvent) {
  return {
    client_event_id: e.client_event_id,
    op: e.op,
    captured_at: e.captured_at,
    task_id: e.task_id ?? null,
    time_entry_id: e.time_entry_id ?? null,
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    accuracy_m: e.accuracy_m ?? null,
    gps_status: e.gps_status ?? null,
    device_fingerprint: e.device_fingerprint ?? {},
    reason_text: e.reason_text ?? null,
    complete_task: !!e.complete_task,
  };
}

export interface SyncOutcome {
  sent: number;
  accepted: number;
  rejected: number;
  skipped: "offline" | "no_session" | "empty" | null;
}

export async function syncOfflineQueue(
  storage: OfflineQueueStorage,
  userId: string,
  send: (events: ReturnType<typeof toPayload>[]) => Promise<RpcResult> = (events) =>
    rpc("punch_offline_sync_v1", { p_input: { events } }),
): Promise<SyncOutcome> {
  const pending = eventsFor(await storage.list(), userId)
    .filter((e) => e.status === "pending")
    .slice(0, 50);
  if (pending.length === 0) return { sent: 0, accepted: 0, rejected: 0, skipped: "empty" };
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return { sent: 0, accepted: 0, rejected: 0, skipped: "offline" };
  if (!(await ensureSession())) return { sent: 0, accepted: 0, rejected: 0, skipped: "no_session" };

  const { data, error } = await send(pending.map(toPayload));
  if (error) {
    if (isNetworkFailureMessage(error.message))
      return { sent: 0, accepted: 0, rejected: 0, skipped: "offline" };
    throw new Error(error.message ?? "Falha ao enviar as marcações offline.");
  }
  const results = ((data ?? {}) as { results?: unknown[] }).results ?? [];
  const { done, failed } = classifySyncResults(
    results as Parameters<typeof classifySyncResults>[0],
  );

  const byId = new Map(pending.map((e) => [e.client_event_id, e]));
  for (const id of done) {
    const ev = byId.get(id);
    await storage.remove(id);
    // Observação da conclusão: só depois de o ponto e a tarefa estarem gravados.
    if (ev?.op === "stop" && ev.completion_note?.trim() && ev.task_id) {
      try {
        await addTaskCompletionNote(ev.task_id, ev.completion_note);
      } catch (err) {
        console.error("[offline-punch] completion note not saved", { taskId: ev.task_id, err });
      }
    }
  }
  for (const f of failed) {
    const ev = byId.get(f.id);
    if (ev)
      await storage.put({ ...ev, status: "failed", error_code: f.code, error_message: f.message });
  }
  return { sent: pending.length, accepted: done.length, rejected: failed.length, skipped: null };
}
