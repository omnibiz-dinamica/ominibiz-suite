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
}

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

export function usePunchFlow(): UsePunchFlowApi {
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
    async ({ op, entryId, taskId, neverBlockOnGps }) => {
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

      // ---- 2. Envio ----
      const first = await send(op, basePayload);

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
    [geo, send, finalize],
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