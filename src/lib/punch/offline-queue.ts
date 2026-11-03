/**
 * Ponto offline — fila de marcações guardadas no telemóvel.
 *
 * Quando a empresa tem o ponto offline ligado (company_hr_settings.offline_punch_enabled)
 * e não há rede, as marcações (iniciar / pausar / retomar / parar) ficam aqui,
 * com a hora e a localização do telemóvel, até serem enviadas para
 * `punch_offline_sync_v1`. Nada é apagado enquanto não for aceite pelo servidor.
 */
import type { TimeEntryRow } from "@/lib/tasks";

export type OfflineOp = "start" | "pause" | "resume" | "stop";

export interface OfflinePunchEvent {
  client_event_id: string;
  user_id: string;
  company_id: string;
  op: OfflineOp;
  captured_at: string;
  task_id?: string | null;
  time_entry_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy_m?: number | null;
  gps_status?: string | null;
  device_fingerprint?: Record<string, unknown>;
  reason_text?: string | null;
  complete_task?: boolean;
  completion_note?: string | null;
  /** pending = por enviar; failed = recusada pelo servidor (fica para o funcionário ver). */
  status: "pending" | "failed";
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface OfflineQueueStorage {
  list(): Promise<OfflinePunchEvent[]>;
  put(ev: OfflinePunchEvent): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Prefixo do id do ponto criado localmente (ainda sem id do servidor). */
export const LOCAL_ENTRY_PREFIX = "offline:";

export function isLocalEntryId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(LOCAL_ENTRY_PREFIX);
}

/** Falha de rede (não chegou ao servidor) — distinta de um erro devolvido pelo servidor. */
export function isNetworkFailureMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|the internet connection appears to be offline/i.test(
    message,
  );
}

export function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  // Fallback RFC4122 v4 (navegadores antigos).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Marcações do utilizador/empresa, pela ordem em que foram feitas. */
export function eventsFor(events: OfflinePunchEvent[], userId: string, companyId?: string | null) {
  return events
    .filter((e) => e.user_id === userId && (!companyId || e.company_id === companyId))
    .sort(
      (a, b) =>
        a.captured_at.localeCompare(b.captured_at) || a.created_at.localeCompare(b.created_at),
    );
}

/**
 * Atualiza, só no ecrã, o ponto aberto depois de uma marcação offline.
 * Segue as mesmas regras do gatilho das várias pausas: ao pausar de novo,
 * a pausa anterior passa para `prior_pause_seconds`.
 */
export function applyLocalEvent(
  entry: TimeEntryRow | null,
  ev: Pick<
    OfflinePunchEvent,
    "client_event_id" | "op" | "captured_at" | "task_id" | "user_id" | "company_id"
  >,
): TimeEntryRow | null {
  const at = ev.captured_at;
  if (ev.op === "start") {
    return {
      id: `${LOCAL_ENTRY_PREFIX}${ev.client_event_id}`,
      company_id: ev.company_id,
      task_id: ev.task_id ?? null,
      user_id: ev.user_id,
      started_at: at,
      paused_at: null,
      resumed_at: null,
      ended_at: null,
      effective_minutes: null,
      notes: null,
      created_at: at,
      updated_at: at,
      prior_pause_seconds: 0,
    };
  }
  if (!entry) return null;
  if (ev.op === "pause") {
    let prior = Number(entry.prior_pause_seconds ?? 0) || 0;
    if (entry.paused_at && entry.resumed_at) {
      const done =
        (new Date(entry.resumed_at).getTime() - new Date(entry.paused_at).getTime()) / 1000;
      prior += Math.max(0, Math.round(done));
    }
    return {
      ...entry,
      paused_at: at,
      resumed_at: null,
      prior_pause_seconds: prior,
      updated_at: at,
    };
  }
  if (ev.op === "resume") return { ...entry, resumed_at: at, updated_at: at };
  return null; // stop: deixa de haver ponto aberto
}

/** Divide a resposta do servidor: o que sai da fila, o que fica recusado, o que fica por enviar. */
export function classifySyncResults(
  results: Array<{
    client_event_id?: string | null;
    success?: boolean;
    code?: string;
    message?: string;
  }>,
) {
  const done: string[] = [];
  const failed: Array<{ id: string; code: string; message: string }> = [];
  for (const r of results) {
    if (!r.client_event_id) continue;
    if (r.success) done.push(r.client_event_id);
    else if (r.code !== "NOT_PROCESSED" && r.code !== "UNAUTHENTICATED")
      failed.push({
        id: r.client_event_id,
        code: r.code ?? "ERRO",
        message: r.message ?? "Marcação recusada.",
      });
  }
  return { done, failed };
}

/* ------------------------------ Armazenamento ------------------------------ */

const DB_NAME = "omnibiz-offline";
const STORE = "punch-events";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "client_event_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? req.error);
        };
      }),
  );
}

/** IndexedDB (sobrevive a fechar o browser). */
export const indexedDbQueue: OfflineQueueStorage = {
  list: () =>
    run<OfflinePunchEvent[]>("readonly", (s) => s.getAll() as IDBRequest<OfflinePunchEvent[]>),
  put: (ev) => run("readwrite", (s) => s.put(ev)).then(() => undefined),
  remove: (id) => run("readwrite", (s) => s.delete(id)).then(() => undefined),
};

/** Memória (testes / navegador sem IndexedDB). */
export function memoryQueue(initial: OfflinePunchEvent[] = []): OfflineQueueStorage {
  const map = new Map(initial.map((e) => [e.client_event_id, e]));
  return {
    list: async () => Array.from(map.values()),
    put: async (ev) => {
      map.set(ev.client_event_id, ev);
    },
    remove: async (id) => {
      map.delete(id);
    },
  };
}

export function defaultQueue(): OfflineQueueStorage {
  return typeof indexedDB !== "undefined" ? indexedDbQueue : memoryQueue();
}
