/**
 * OmniBiz — usePunchFlow (Passo 7).
 *
 * Orquestra: captura GPS única → chama RPC v2 → se
 * `NEEDS_JUSTIFICATION` abre modal → reenvia com `reason_text`.
 *
 * Uma única captura por operação. Feedback padronizado por fase.
 * Nunca bloqueia PAUSE/RESUME por falha de GPS (v2 aceita `no_location`).
 */
import { useCallback, useRef, useState } from "react";
import { usePunchGeolocation } from "@/hooks/use-punch-geolocation";
import {
  callPunchV2,
  deviceFingerprint,
  gpsStatusFromError,
  payloadFromReading,
  type PunchV2Op,
  type PunchV2Payload,
  type PunchV2Response,
} from "@/lib/punch/v2";
import { isLocalEntryId, type OfflineOp, type OfflinePunchEvent } from "@/lib/punch/offline-queue";
import type { NewOfflineEvent } from "@/hooks/use-offline-punch";

export type PunchFlowPhase =
  | "idle"
  | "capturing_gps"
  | "sending"
  | "awaiting_reason"
  | "resending"
  | "done"
  | "failed";

export interface PunchFlowState {
  phase: PunchFlowPhase;
  op: PunchV2Op | null;
  lastCode: string | null;
  lastMessage: string | null;
  needsReasonMessage: string | null;
}

interface RunInput {
  op: PunchV2Op;
  /** `time_entry_id` para pause/resume/stop/arrival/departure. */
  entryId?: string;
  /** `task_id` para start (e opcional em arrival). */
  taskId?: string;
  /** true = ignora falha de GPS silenciosamente (pause/resume/arrival/departure). */
  neverBlockOnGps?: boolean;
  /** Só para o ponto offline (stop): concluir a tarefa e a observação da conclusão. */
  offlineExtra?: { complete_task?: boolean; completion_note?: string | null };
}

/** Ponto offline (empresa com o interruptor ligado). Sem isto, o fluxo é o de sempre. */
export interface PunchFlowOffline {
  enabled: boolean;
  enqueue: (ev: NewOfflineEvent) => Promise<OfflinePunchEvent | null>;
}

const OFFLINE_OPS: PunchV2Op[] = ["start", "pause", "resume", "stop"];

export interface UsePunchFlowApi {
  state: PunchFlowState;
  run: (input: RunInput) => Promise<PunchV2Response>;
  /** Chamado pelo modal de justificativa. */
  submitJustification: (reason: string) => void;
  cancelJustification: () => void;
}

const INITIAL: PunchFlowState = {
  phase: "idle",
  op: null,
  lastCode: null,
  lastMessage: null,
  needsReasonMessage: null,
};

export function usePunchFlow(offline?: PunchFlowOffline): UsePunchFlowApi {
  const geo = usePunchGeolocation();
  const [state, setState] = useState<PunchFlowState>(INITIAL);

  // Pending justification — armazena payload base para reenvio.
  const pendingRef = useRef<{
    op: PunchV2Op;
    basePayload: PunchV2Payload;
    resolve: (r: PunchV2Response) => void;
  } | null>(null);

  const send = useCallback(async (op: PunchV2Op, payload: PunchV2Payload) => {
    setState((s) => ({ ...s, phase: s.phase === "awaiting_reason" ? "resending" : "sending", op }));
    const res = await callPunchV2(op, payload);
    return res;
  }, []);

  const finalize = useCallback((res: PunchV2Response, op: PunchV2Op) => {
    setState({
      phase: res.success ? "done" : "failed",
      op,
      lastCode: res.code,
      lastMessage: res.message ?? null,
      needsReasonMessage: null,
    });
    return res;
  }, []);

  const run = useCallback<UsePunchFlowApi["run"]>(
    async ({ op, entryId, taskId, neverBlockOnGps, offlineExtra }) => {
      const clickedAt = new Date().toISOString();
      setState({ ...INITIAL, phase: "capturing_gps", op });

      // ---- 1. Captura GPS única ----
      let geoPart: ReturnType<typeof payloadFromReading>;
      try {
        const reading = await geo.capture();
        geoPart = payloadFromReading(reading);
      } catch (err) {
        const code = (err as { code?: string }).code as
          | Parameters<typeof gpsStatusFromError>[0]
          | undefined;
        geoPart = {
          gps_status: code ? gpsStatusFromError(code) : "no_location",
          lat: null,
          lng: null,
          accuracy_m: null,
        };
        // Para pause/resume/arrival/departure não bloqueamos — enviamos sem GPS.
        if (!neverBlockOnGps) {
          // Continuamos: a política do servidor decide (`alert`/`justify`/`block`).
        }
      }

      const basePayload: PunchV2Payload = {
        ...geoPart,
        ...(entryId ? { time_entry_id: entryId } : {}),
        ...(taskId ? { task_id: taskId } : {}),
        device_fingerprint: deviceFingerprint(),
      };

      // ---- 2. Envio (ou fila no telemóvel, se não houver rede) ----
      const queueOffline = async (): Promise<PunchV2Response> => {
        if (!OFFLINE_OPS.includes(op)) {
          // Chegada/saída são só auditoria de localização: sem rede, não se guardam.
          return finalize({ success: true, code: "OFFLINE_SKIPPED", message: null, data: null }, op);
        }
        const ev = await offline!.enqueue({
          op: op as OfflineOp,
          captured_at: clickedAt,
          task_id: taskId ?? null,
          time_entry_id: entryId && !isLocalEntryId(entryId) ? entryId : null,
          lat: basePayload.lat ?? null,
          lng: basePayload.lng ?? null,
          accuracy_m: basePayload.accuracy_m ?? null,
          gps_status: basePayload.gps_status,
          device_fingerprint: basePayload.device_fingerprint ?? {},
          complete_task: offlineExtra?.complete_task,
          completion_note: offlineExtra?.completion_note ?? null,
        });
        if (!ev) {
          return finalize(
            { success: false, code: "OFFLINE_QUEUE_ERROR", message: "Não foi possível guardar a marcação no telemóvel.", data: null },
            op,
          );
        }
        const at = new Date(clickedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
        return finalize(
          {
            success: true,
            code: "OFFLINE_QUEUED",
            message: `Sem rede: marcação guardada no telemóvel às ${at}. Será enviada quando a rede voltar.`,
            data: { event: ev },
          },
          op,
        );
      };

      if (offline?.enabled && typeof navigator !== "undefined" && navigator.onLine === false) {
        return queueOffline();
      }
      const first = await send(op, basePayload);
      if (offline?.enabled && first.network) {
        return queueOffline();
      }

      // ---- 3. Justificativa (se solicitada) ----
      if (first.code === "NEEDS_JUSTIFICATION") {
        return new Promise<PunchV2Response>((resolve) => {
          pendingRef.current = { op, basePayload, resolve };
          setState({
            phase: "awaiting_reason",
            op,
            lastCode: first.code,
            lastMessage: first.message ?? null,
            needsReasonMessage:
              first.message ?? "Esta operação precisa de justificativa.",
          });
        });
      }

      return finalize(first, op);
    },
    [geo, send, finalize, offline],
  );

  const submitJustification = useCallback(
    (reason: string) => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      const payload: PunchV2Payload = { ...pending.basePayload, reason_text: reason };
      void send(pending.op, payload).then((res) => {
        finalize(res, pending.op);
        pending.resolve(res);
      });
    },
    [send, finalize],
  );

  const cancelJustification = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const cancelled: PunchV2Response = {
      success: false,
      code: "JUSTIFICATION_CANCELLED",
      message: "Operação cancelada pelo utilizador.",
      data: null,
    };
    finalize(cancelled, pending.op);
    pending.resolve(cancelled);
  }, [finalize]);

  return { state, run, submitJustification, cancelJustification };
}