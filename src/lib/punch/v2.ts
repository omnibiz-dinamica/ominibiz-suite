/**
 * OmniBiz — Wrappers das RPCs `punch_*_v2` (Passo 7).
 *
 * Todas as respostas seguem o contrato do doc RPC_PUNCH_V2.md:
 *   { success, code, message, data }
 *
 * Nenhuma mensagem local é criada — o consumidor renderiza sempre
 * `code` / `message` recebidos do servidor.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PunchGeoReading, PunchGeoErrorCode } from "@/hooks/use-punch-geolocation";

export type PunchV2Op = "start" | "stop" | "pause" | "resume" | "arrival" | "departure";

export type GpsStatus = "ok" | "denied" | "timeout" | "no_location";

export interface PunchV2Payload {
  time_entry_id?: string;
  task_id?: string;
  lat?: number | null;
  lng?: number | null;
  accuracy_m?: number | null;
  gps_status: GpsStatus;
  captured_at?: string | null;
  reason_text?: string | null;
  device_fingerprint?: Record<string, unknown> | null;
}

export interface PunchV2Response<T = Record<string, unknown>> {
  success: boolean;
  code: string;
  message?: string | null;
  data?: T | null;
}

const RPC_NAME: Record<PunchV2Op, string> = {
  start: "punch_start_v2",
  stop: "punch_stop_v2",
  pause: "punch_pause_v2",
  resume: "punch_resume_v2",
  arrival: "punch_arrival_v2",
  departure: "punch_departure_v2",
};

const GENERIC_PUNCH_ERROR = "Nao foi possivel registrar o ponto. Tente novamente.";

function makeCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `punch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const PUNCH_V2_ERROR_CODES = new Set([
  "UNAUTHENTICATED",
  "INVALID_INPUT",
  "TASK_NOT_FOUND",
  "ENTRY_NOT_FOUND",
  "INVALID_STATE",
  "OUT_OF_RADIUS",
  "NO_GPS",
  "GPS_DENIED",
  "GPS_TIMEOUT",
  "NEEDS_JUSTIFICATION",
  "CLIENT_WITHOUT_LOCATION",
]);

export function gpsStatusFromError(code: PunchGeoErrorCode): GpsStatus {
  switch (code) {
    case "GPS_PERMISSION_DENIED":
      return "denied";
    case "GPS_TIMEOUT":
      return "timeout";
    default:
      return "no_location";
  }
}

export function payloadFromReading(
  reading: PunchGeoReading | null,
): Pick<PunchV2Payload, "lat" | "lng" | "accuracy_m" | "gps_status" | "captured_at"> {
  if (!reading) return { gps_status: "no_location" };
  return {
    lat: reading.lat,
    lng: reading.lng,
    accuracy_m: reading.accuracyM,
    gps_status: "ok",
    captured_at: new Date(reading.capturedAt).toISOString(),
  };
}

export function deviceFingerprint(): Record<string, unknown> {
  if (typeof navigator === "undefined") return {};
  return {
    ua: navigator.userAgent,
    platform: (navigator as Navigator & { platform?: string }).platform ?? null,
    lang: navigator.language ?? null,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
  };
}

export async function callPunchV2<T = Record<string, unknown>>(
  op: PunchV2Op,
  payload: PunchV2Payload,
): Promise<PunchV2Response<T>> {
  const rpc = RPC_NAME[op];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(rpc, { p_input: payload });
  if (error) {
    const correlationId = makeCorrelationId();
    console.error("[punch-v2] RPC error", {
      correlationId,
      rpc,
      code: (error as { code?: string }).code ?? null,
      message: error.message,
      details: (error as { details?: string }).details ?? null,
      hint: (error as { hint?: string }).hint ?? null,
    });
    return {
      success: false,
      code: (error as { code?: string }).code ?? "RPC_ERROR",
      message: `${GENERIC_PUNCH_ERROR} Codigo: ${correlationId}`,
      data: null,
    };
  }
  const raw = (data ?? {}) as PunchV2Response<T>;
  return {
    success: Boolean(raw.success),
    code: raw.code ?? "UNKNOWN",
    message: raw.message ?? null,
    data: (raw.data ?? null) as T | null,
  };
}
