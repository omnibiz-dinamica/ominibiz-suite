import { describe, expect, it } from "bun:test";
import {
  DRAFT_PREFIX,
  DRAFT_TTL_MS,
  clearAllDrafts,
  draftKey,
  isDraftConflict,
  readDraft,
  removeDraft,
  sanitizeDraftValues,
  writeDraft,
  type DraftRecord,
  type StorageLike,
} from "../src/lib/form-draft";

class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
}

class ThrowingStorage implements StorageLike {
  get length() {
    return 0;
  }
  getItem(): string | null {
    throw new Error("storage unavailable");
  }
  setItem(): void {
    throw new Error("storage unavailable");
  }
  removeItem(): void {
    throw new Error("storage unavailable");
  }
  key(): string | null {
    throw new Error("storage unavailable");
  }
}

const NOW = 1_700_000_000_000;

describe("draftKey: isolamento por utilizador/empresa/formulário/registo", () => {
  it("inclui utilizador, empresa, formulário e registo na chave", () => {
    const key = draftKey("u1", "c1", "task", "t9");
    expect(key).toBe(`${DRAFT_PREFIX}u1:c1:task:t9`);
    const storage = new FakeStorage();
    writeDraft(storage, key, { title: "A" }, { open: true, savedAt: NOW });

    // Empresa diferente não vê o rascunho (sem vazamento multiempresa)
    expect(readDraft(storage, draftKey("u1", "c2", "task", "t9"), NOW)).toBeNull();
    // Utilizador diferente não vê o rascunho
    expect(readDraft(storage, draftKey("u2", "c1", "task", "t9"), NOW)).toBeNull();
    // Formulário diferente não vê o rascunho
    expect(readDraft(storage, draftKey("u1", "c1", "client", "t9"), NOW)).toBeNull();
    // Registo diferente não vê o rascunho
    expect(readDraft(storage, draftKey("u1", "c1", "task", "t8"), NOW)).toBeNull();
    // A chave correta lê o rascunho
    expect(readDraft(storage, draftKey("u1", "c1", "task", "t9"), NOW)?.values).toEqual({ title: "A" });
  });

  it("usa 'new' quando não há recordId (criação)", () => {
    expect(draftKey("u1", "c1", "task")).toBe(`${DRAFT_PREFIX}u1:c1:task:new`);
    expect(draftKey("u1", "c1", "task", null)).toBe(`${DRAFT_PREFIX}u1:c1:task:new`);
  });
});

describe("validade de 24 horas", () => {
  it("lê dentro do prazo e apaga rascunho expirado na leitura", () => {
    const storage = new FakeStorage();
    const key = draftKey("u1", "c1", "task");
    writeDraft(storage, key, { title: "A" }, { open: true, savedAt: NOW });

    expect(readDraft(storage, key, NOW + DRAFT_TTL_MS - 1)?.values).toEqual({ title: "A" });
    expect(readDraft(storage, key, NOW + DRAFT_TTL_MS + 1)).toBeNull();
    // Expirado = apagado do storage
    expect(storage.getItem(key)).toBeNull();
  });
});

describe("clear / clearAllDrafts", () => {
  it("removeDraft apaga apenas a chave indicada", () => {
    const storage = new FakeStorage();
    const k1 = draftKey("u1", "c1", "task");
    const k2 = draftKey("u1", "c1", "client");
    writeDraft(storage, k1, { a: 1 }, { open: true, savedAt: NOW });
    writeDraft(storage, k2, { b: 2 }, { open: true, savedAt: NOW });
    removeDraft(storage, k1);
    expect(readDraft(storage, k1, NOW)).toBeNull();
    expect(readDraft(storage, k2, NOW)).not.toBeNull();
  });

  it("clearAllDrafts apaga só chaves do prefixo e devolve a contagem", () => {
    const storage = new FakeStorage();
    writeDraft(storage, draftKey("u1", "c1", "task"), { a: 1 }, { open: true, savedAt: NOW });
    writeDraft(storage, draftKey("u2", "c2", "client"), { b: 2 }, { open: false, savedAt: NOW });
    storage.setItem("outra-chave", "manter");
    storage.setItem("omnibiz:expense-draft:c1:u1", "manter");

    expect(clearAllDrafts(storage)).toBe(2);
    expect(storage.length).toBe(2);
    expect(storage.getItem("outra-chave")).toBe("manter");
    expect(storage.getItem("omnibiz:expense-draft:c1:u1")).toBe("manter");
  });
});

describe("robustez do storage", () => {
  it("JSON corrompido = sem rascunho e chave removida", () => {
    const storage = new FakeStorage();
    const key = draftKey("u1", "c1", "task");
    storage.setItem(key, "{isto nao e json");
    expect(readDraft(storage, key, NOW)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("payload com formato inválido = sem rascunho", () => {
    const storage = new FakeStorage();
    const key = draftKey("u1", "c1", "task");
    storage.setItem(key, JSON.stringify({ v: 99, values: {} }));
    expect(readDraft(storage, key, NOW)).toBeNull();
    storage.setItem(key, JSON.stringify(null));
    expect(readDraft(storage, key, NOW)).toBeNull();
  });

  it("storage que lança erro nunca quebra: leitura, gravação, remoção e limpeza", () => {
    const storage = new ThrowingStorage();
    const key = draftKey("u1", "c1", "task");
    expect(readDraft(storage, key, NOW)).toBeNull();
    expect(writeDraft(storage, key, { a: 1 }, { open: true, savedAt: NOW })).toBe(false);
    expect(() => removeDraft(storage, key)).not.toThrow();
    expect(clearAllDrafts(storage)).toBe(0);
  });
});

describe("deteção de conflito", () => {
  const record = (base: string | null): DraftRecord<{ a: number }> => ({
    v: 1,
    savedAt: NOW,
    baseUpdatedAt: base,
    open: true,
    values: { a: 1 },
  });

  it("true quando o updated_at atual difere do guardado", () => {
    expect(isDraftConflict(record("2026-01-01T10:00:00Z"), "2026-01-01T11:00:00Z")).toBe(true);
  });

  it("false quando o updated_at é igual, ou falta algum dos lados", () => {
    expect(isDraftConflict(record("2026-01-01T10:00:00Z"), "2026-01-01T10:00:00Z")).toBe(false);
    expect(isDraftConflict(record(null), "2026-01-01T10:00:00Z")).toBe(false);
    expect(isDraftConflict(record("2026-01-01T10:00:00Z"), null)).toBe(false);
    expect(isDraftConflict(record("2026-01-01T10:00:00Z"), undefined)).toBe(false);
    expect(isDraftConflict(null, "2026-01-01T10:00:00Z")).toBe(false);
  });
});

describe("sanitizeDraftValues: nunca guardar binários nem senhas", () => {
  it("remove chaves de senha/segredo e valores File/Blob", () => {
    const blob = new Blob(["x"]);
    const out = sanitizeDraftValues({
      title: "Tarefa",
      password: "segredo",
      senhaAtual: "segredo",
      attachment: blob,
      nested: { token: "abc", nota: "ok", ficheiro: blob },
      lista: [blob, "texto"],
    }) as Record<string, unknown>;

    expect(out.title).toBe("Tarefa");
    expect("password" in out).toBe(false);
    expect("senhaAtual" in out).toBe(false);
    expect("attachment" in out).toBe(false);
    const nested = out.nested as Record<string, unknown>;
    expect(nested.nota).toBe("ok");
    expect("token" in nested).toBe(false);
    expect("ficheiro" in nested).toBe(false);
    expect(out.lista).toEqual(["texto"]);
  });

  it("o rascunho gravado é serializável e não contém senhas", () => {
    const storage = new FakeStorage();
    const key = draftKey("u1", "c1", "task");
    writeDraft(storage, key, { title: "A", password: "x", foto: new Blob(["y"]) }, { open: true, savedAt: NOW });
    const raw = storage.getItem(key)!;
    expect(raw).not.toContain("password");
    expect(raw).not.toContain("foto");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(readDraft<{ title: string }>(storage, key, NOW)?.values.title).toBe("A");
  });
});
