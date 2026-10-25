/**
 * Rascunho automático de formulários (localStorage, por utilizador + empresa).
 *
 * Regras:
 * - Chave: omnibiz:draft:v1:{userId}:{companyId}:{formId}:{recordId ou "new"}
 * - Valor: { v: 1, savedAt, baseUpdatedAt, open, values }
 * - Validade: 24 h (expirado = apagado na leitura)
 * - Gravação com debounce de 400 ms no hook
 * - Todo o acesso ao storage em try/catch: JSON corrompido ou storage
 *   indisponível = sem rascunho, nunca quebra o formulário
 * - Só valores serializáveis: nunca guardar File/Blob/anexos nem senhas
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const DRAFT_PREFIX = "omnibiz:draft:v1:";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAFT_DEBOUNCE_MS = 400;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface DraftRecord<T = unknown> {
  v: 1;
  savedAt: number;
  baseUpdatedAt: string | null;
  open: boolean;
  values: T;
}

export function draftKey(userId: string, companyId: string, formId: string, recordId?: string | null): string {
  return `${DRAFT_PREFIX}${userId}:${companyId}:${formId}:${recordId ?? "new"}`;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isBinaryLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  // Duck-type para ambientes sem a global Blob (ex.: File de outra realm)
  const v = value as { size?: unknown; type?: unknown; arrayBuffer?: unknown; stream?: unknown };
  return (
    typeof v.size === "number" &&
    typeof v.type === "string" &&
    typeof v.arrayBuffer === "function" &&
    typeof v.stream === "function"
  );
}

const SENSITIVE_KEY = /pass(word)?|senha|secret|token/i;

/** Remove valores não serializáveis/seguros (File, Blob, anexos binários, senhas). */
export function sanitizeDraftValues<T>(input: T): T {
  const walk = (value: unknown, keyHint: string): unknown => {
    if (value === null || value === undefined) return value;
    if (isBinaryLike(value)) return undefined;
    if (SENSITIVE_KEY.test(keyHint)) return undefined;
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, "")).filter((item) => item !== undefined);
    }
    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEY.test(k)) continue;
        const cleaned = walk(v, k);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }
    if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return undefined;
    return value;
  };
  return walk(input, "") as T;
}

export function readDraft<T>(storage: StorageLike | null, key: string, now: number = Date.now()): DraftRecord<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftRecord<T> | null;
    if (!parsed || parsed.v !== 1 || typeof parsed.savedAt !== "number" || parsed.values == null) {
      storage.removeItem(key);
      return null;
    }
    if (now - parsed.savedAt > DRAFT_TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* storage indisponível: ignora */
    }
    return null;
  }
}

export function writeDraft<T>(
  storage: StorageLike | null,
  key: string,
  values: T,
  opts: { baseUpdatedAt?: string | null; open: boolean; savedAt?: number },
): boolean {
  if (!storage) return false;
  try {
    const record: DraftRecord<T> = {
      v: 1,
      savedAt: opts.savedAt ?? Date.now(),
      baseUpdatedAt: opts.baseUpdatedAt ?? null,
      open: opts.open,
      values: sanitizeDraftValues(values),
    };
    storage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(storage: StorageLike | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignora */
  }
}

/** Apaga todos os rascunhos da aplicação (usado no logout). Devolve quantos removeu. */
export function clearAllDrafts(storage?: StorageLike | null): number {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      try {
        store.removeItem(k);
      } catch {
        /* ignora */
      }
    }
    return keys.length;
  } catch {
    return 0;
  }
}

/** true quando o registo foi alterado depois do rascunho (edição de registo existente). */
export function isDraftConflict<T>(record: DraftRecord<T> | null, currentUpdatedAt: string | null | undefined): boolean {
  if (!record || !record.baseUpdatedAt || !currentUpdatedAt) return false;
  return record.baseUpdatedAt !== currentUpdatedAt;
}

export interface UseFormDraftOptions {
  formId: string;
  recordId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  enabled?: boolean;
  /** updated_at atual do registo em edição (para detetar conflito). */
  baseUpdatedAt?: string | null;
  /** Quando true, mostra aviso beforeunload (alterações por gravar). */
  dirty?: boolean;
}

export interface UseFormDraftResult<T> {
  /** Valores restaurados do rascunho (null se não houver ou estiver expirado/corrompido). */
  restored: T | null;
  /** Epoch ms da última gravação do rascunho (null se não houver). */
  savedAt: number | null;
  /** true se o rascunho foi gravado com o formulário aberto (para reabrir diálogos). */
  restoredOpen: boolean;
  /** true quando o updated_at atual do registo difere do baseUpdatedAt do rascunho. */
  conflict: boolean;
  /** Grava o rascunho com debounce de 400 ms. */
  save: (values: T, opts: { open: boolean }) => void;
  /** Apaga o rascunho e limpa o estado restaurado (sucesso ao gravar / cancelar / descartar). */
  clear: () => void;
}

export function useFormDraft<T extends Record<string, unknown>>(opts: UseFormDraftOptions): UseFormDraftResult<T> {
  const { formId, recordId = null, companyId = null, userId = null, enabled = true, baseUpdatedAt = null, dirty = false } = opts;
  const key = enabled && userId && companyId ? draftKey(userId, companyId, formId, recordId) : null;
  const [record, setRecord] = useState<DraftRecord<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ values: T; open: boolean } | null>(null);
  const keyRef = useRef<string | null>(key);
  const baseRef = useRef<string | null>(baseUpdatedAt);
  keyRef.current = key;
  baseRef.current = baseUpdatedAt;

  // Leitura inicial do rascunho (uma vez por chave).
  useEffect(() => {
    setRecord(key ? readDraft<T>(getDefaultStorage(), key) : null);
  }, [key]);

  const flush = useCallback(() => {
    const k = keyRef.current;
    const pending = pendingRef.current;
    if (!k || !pending) return;
    pendingRef.current = null;
    writeDraft(getDefaultStorage(), k, pending.values, {
      baseUpdatedAt: baseRef.current,
      open: pending.open,
    });
  }, []);

  const save = useCallback(
    (values: T, { open }: { open: boolean }) => {
      if (!keyRef.current) return;
      pendingRef.current = { values, open };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DRAFT_DEBOUNCE_MS);
    },
    [flush],
  );

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    if (keyRef.current) removeDraft(getDefaultStorage(), keyRef.current);
    setRecord(null);
  }, []);

  // Garante a gravação pendente ao desmontar / sair da página.
  useEffect(() => {
    const onPageHide = () => flush();
    if (typeof window !== "undefined") window.addEventListener("pagehide", onPageHide);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide);
      if (timerRef.current) clearTimeout(timerRef.current);
      flush();
    };
  }, [flush]);

  // Aviso beforeunload apenas enquanto houver alterações por gravar.
  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const conflict = Boolean(recordId && isDraftConflict(record, baseUpdatedAt));

  return {
    restored: record ? record.values : null,
    savedAt: record ? record.savedAt : null,
    restoredOpen: record ? record.open : false,
    conflict,
    save,
    clear,
  };
}
