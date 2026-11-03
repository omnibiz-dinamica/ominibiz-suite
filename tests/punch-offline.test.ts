import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

// O envio usa o cliente Supabase e a nota da conclusão: substituídos por versões de teste.
const noteCalls: Array<[string, string]> = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
      }),
      refreshSession: async () => ({ data: { session: {} }, error: null }),
    },
    rpc: async () => ({ data: null, error: null }),
  },
}));
mock.module("@/lib/tasks", () => ({
  addTaskCompletionNote: async (taskId: string, note: string) => {
    noteCalls.push([taskId, note]);
  },
}));

const {
  applyLocalEvent,
  classifySyncResults,
  eventsFor,
  isLocalEntryId,
  isNetworkFailureMessage,
  memoryQueue,
} = await import("../src/lib/punch/offline-queue");
const { syncOfflineQueue } = await import("../src/lib/punch/offline-sync");

const U = "00000000-0000-0000-0000-0000000000e1";
const C = "a0000000-0000-0000-0000-000000000000";
const base = {
  user_id: U,
  company_id: C,
  status: "pending" as const,
  created_at: "2026-11-03T10:00:00.000Z",
};
const ev = (id: string, op: "start" | "pause" | "resume" | "stop", at: string, extra = {}) => ({
  ...base,
  client_event_id: id,
  op,
  captured_at: at,
  ...extra,
});

describe("fila do ponto offline", () => {
  test("ecrã sem rede segue as regras das várias pausas", () => {
    let e = applyLocalEvent(null, ev("a", "start", "2026-11-03T08:00:00.000Z", { task_id: "t1" }));
    expect(isLocalEntryId(e!.id)).toBe(true);
    expect(e!.task_id).toBe("t1");
    e = applyLocalEvent(e, ev("b", "pause", "2026-11-03T10:00:00.000Z"));
    e = applyLocalEvent(e, ev("c", "resume", "2026-11-03T10:30:00.000Z"));
    e = applyLocalEvent(e, ev("d", "pause", "2026-11-03T12:00:00.000Z"));
    // a 1.ª pausa (30 min) passa para prior_pause_seconds, como faz o gatilho do banco
    expect(e!.prior_pause_seconds).toBe(1800);
    expect(e!.paused_at).toBe("2026-11-03T12:00:00.000Z");
    expect(e!.resumed_at).toBeNull();
    expect(applyLocalEvent(e, ev("e", "stop", "2026-11-03T16:00:00.000Z"))).toBeNull();
  });

  test("distingue falta de rede de erro do servidor", () => {
    expect(isNetworkFailureMessage("TypeError: Failed to fetch")).toBe(true);
    expect(isNetworkFailureMessage("Load failed")).toBe(true); // Safari
    expect(isNetworkFailureMessage("NetworkError when attempting to fetch resource.")).toBe(true);
    expect(isNetworkFailureMessage('column "x" does not exist')).toBe(false);
    expect(isNetworkFailureMessage(null)).toBe(false);
  });

  test("ordem de envio = ordem das marcações, só do utilizador/empresa", () => {
    const list = [
      ev("2", "stop", "2026-11-03T16:00:00.000Z"),
      ev("1", "start", "2026-11-03T08:00:00.000Z"),
      { ...ev("x", "start", "2026-11-03T07:00:00.000Z"), user_id: "outro" },
    ];
    expect(eventsFor(list, U, C).map((e) => e.client_event_id)).toEqual(["1", "2"]);
  });

  test("resultado: aceites saem, recusadas ficam com motivo, não processadas ficam por enviar", () => {
    const r = classifySyncResults([
      { client_event_id: "1", success: true, code: "OK" },
      { client_event_id: "2", success: true, code: "ALREADY_SYNCED" },
      { client_event_id: "3", success: false, code: "TOO_OLD", message: "mais de 24 h" },
      { client_event_id: "4", success: false, code: "NOT_PROCESSED" },
    ]);
    expect(r.done).toEqual(["1", "2"]);
    expect(r.failed).toEqual([{ id: "3", code: "TOO_OLD", message: "mais de 24 h" }]);
  });

  test("envio: tira da fila o aceite, guarda a recusa e grava a observação da conclusão", async () => {
    const q = memoryQueue([
      ev("1", "start", "2026-11-03T08:00:00.000Z", { task_id: "t1" }),
      ev("2", "stop", "2026-11-03T16:00:00.000Z", {
        task_id: "t1",
        complete_task: true,
        completion_note: "Tudo ok",
      }),
      ev("3", "start", "2026-11-03T17:00:00.000Z", { task_id: "t2" }),
    ]);
    let sent: Array<{ client_event_id: string; complete_task: boolean }> = [];
    const out = await syncOfflineQueue(q, U, async (events) => {
      sent = events as typeof sent;
      return {
        data: {
          results: [
            { client_event_id: "1", success: true, code: "OK" },
            { client_event_id: "2", success: true, code: "OK" },
            { client_event_id: "3", success: false, code: "OVERLAP", message: "sobrepõe" },
          ],
        },
        error: null,
      };
    });
    expect(sent.map((e) => e.client_event_id)).toEqual(["1", "2", "3"]);
    expect(sent[1].complete_task).toBe(true);
    expect(out).toEqual({ sent: 3, accepted: 2, rejected: 1, skipped: null });
    const left = await q.list();
    expect(left.map((e) => [e.client_event_id, e.status, e.error_code])).toEqual([
      ["3", "failed", "OVERLAP"],
    ]);
    expect(noteCalls).toEqual([["t1", "Tudo ok"]]);
  });

  test("sem rede no envio: nada sai da fila", async () => {
    const q = memoryQueue([ev("9", "start", "2026-11-03T08:00:00.000Z", { task_id: "t1" })]);
    const out = await syncOfflineQueue(q, U, async () => ({
      data: null,
      error: { message: "TypeError: Failed to fetch" },
    }));
    expect(out.skipped).toBe("offline");
    expect((await q.list()).length).toBe(1);
  });
});

describe("ligação ao ecrã (só com o interruptor da empresa)", () => {
  const flow = readFileSync(new URL("../src/hooks/use-punch-flow.ts", import.meta.url), "utf8");
  const ponto = readFileSync(new URL("../src/routes/app.ponto.tsx", import.meta.url), "utf8");
  const gestao = readFileSync(
    new URL("../src/routes/app.ponto_.gestao.tsx", import.meta.url),
    "utf8",
  );

  test("a fila só é usada com offline.enabled e sem rede / falha de rede", () => {
    expect(flow).toMatch(
      /offline\?\.enabled && typeof navigator !== "undefined" && navigator\.onLine === false/,
    );
    expect(flow).toMatch(/offline\?\.enabled && first\.network/);
  });

  test("Folha de Ponto usa a fila e mostra o aviso", () => {
    expect(ponto).toMatch(/useOfflinePunch\(user\?\.id, currentCompanyId/);
    expect(ponto).toMatch(/usePunchFlow\(offline\)/);
    expect(ponto).toMatch(/<OfflinePunchBanner offline=\{offline\} \/>/);
    expect(ponto).toMatch(/offlineExtra: \{ complete_task: true, completion_note: note \}/);
  });

  test("Gestão de Ponto mostra o selo Offline", () => {
    expect(gestao).toMatch(/fetchOfflineEntryIds\(pauseEntryIds\)/);
    expect(gestao).toMatch(/· Offline/);
  });
});
