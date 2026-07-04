/**
 * OmniBiz — usePunchGeolocation (v1.0)
 *
 * Único ponto de captura de geolocalização do cliente. Nenhum componente
 * deve chamar `navigator.geolocation` diretamente.
 *
 * Ver docs/ARCHITECTURE_GEOFENCING.md secções 6, 7, 11.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { classifyAccuracy, type AccuracyClassification } from "@/lib/geo/accuracy";

// ---------- Estados ----------

export type PunchGeoState =
  | "idle"
  | "requesting_permission"
  | "capturing"
  | "success"
  | "permission_denied"
  | "timeout"
  | "unavailable"
  | "error";

// ---------- Códigos de erro padronizados ----------

export type PunchGeoErrorCode =
  | "GPS_PERMISSION_DENIED"
  | "GPS_TIMEOUT"
  | "GPS_UNAVAILABLE"
  | "GPS_UNKNOWN_ERROR"
  | "GPS_NOT_SUPPORTED";

export interface PunchGeoError {
  code: PunchGeoErrorCode;
  /** Mensagem exibível — os consumidores podem sobrescrever. */
  message: string;
}

// ---------- Resultado padronizado ----------

export interface PunchGeoReading {
  lat: number;
  lng: number;
  accuracyM: number;
  altitudeM: number | null;
  headingDeg: number | null;
  speedMs: number | null;
  /** Timestamp reportado pelo navegador (ms since epoch). */
  capturedAt: number;
  /** Tempo total de captura em ms — instrumentação, não persistir. */
  captureDurationMs: number;
  classification: AccuracyClassification;
}

// ---------- API pública ----------

export interface UsePunchGeolocationOptions {
  /** Ativa modo de diagnóstico (Super Admin). Consumido por `<PunchGeoDiagnostics/>`. */
  diagnostics?: boolean;
}

export interface UsePunchGeolocationApi {
  state: PunchGeoState;
  isCapturing: boolean;
  reading: PunchGeoReading | null;
  error: PunchGeoError | null;
  /** Solicita uma nova captura. Rejeita se já houver captura em andamento. */
  capture: () => Promise<PunchGeoReading>;
  reset: () => void;
}

// ---------- Implementação ----------

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
};

function mapPositionError(err: GeolocationPositionError): PunchGeoError {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return { code: "GPS_PERMISSION_DENIED", message: "Permissão de localização negada." };
    case err.POSITION_UNAVAILABLE:
      return { code: "GPS_UNAVAILABLE", message: "Localização indisponível no momento." };
    case err.TIMEOUT:
      return { code: "GPS_TIMEOUT", message: "Tempo esgotado ao obter localização." };
    default:
      return { code: "GPS_UNKNOWN_ERROR", message: "Erro desconhecido ao obter localização." };
  }
}

function stateFromErrorCode(code: PunchGeoErrorCode): PunchGeoState {
  switch (code) {
    case "GPS_PERMISSION_DENIED":
      return "permission_denied";
    case "GPS_TIMEOUT":
      return "timeout";
    case "GPS_UNAVAILABLE":
    case "GPS_NOT_SUPPORTED":
      return "unavailable";
    default:
      return "error";
  }
}

function isSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/**
 * Consulta a Permissions API quando disponível para distinguir
 * `idle` de `requesting_permission`. Falha silenciosa (Safari antigo).
 */
async function readPermissionState(): Promise<PermissionState | null> {
  try {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return null;
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

export function usePunchGeolocation(
  options: UsePunchGeolocationOptions = {},
): UsePunchGeolocationApi {
  const [state, setState] = useState<PunchGeoState>("idle");
  const [reading, setReading] = useState<PunchGeoReading | null>(null);
  const [error, setError] = useState<PunchGeoError | null>(null);

  // Guardas de concorrência — nunca duas capturas simultâneas.
  const inFlightRef = useRef<Promise<PunchGeoReading> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    if (inFlightRef.current) return; // não permite reset durante captura
    setState("idle");
    setReading(null);
    setError(null);
  }, []);

  const capture = useCallback((): Promise<PunchGeoReading> => {
    if (inFlightRef.current) return inFlightRef.current;

    if (!isSupported()) {
      const err: PunchGeoError = {
        code: "GPS_NOT_SUPPORTED",
        message: "Este dispositivo não suporta geolocalização.",
      };
      setError(err);
      setState("unavailable");
      return Promise.reject(err);
    }

    const started = performance.now();

    const promise = (async () => {
      setError(null);
      setReading(null);

      const perm = await readPermissionState();
      if (mountedRef.current) {
        setState(perm === "granted" ? "capturing" : "requesting_permission");
      }

      return await new Promise<PunchGeoReading>((resolve, reject) => {
        // Alguns navegadores (Safari antigo) ignoram `timeout`. Reforçamos.
        let settled = false;
        const hardTimeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          const err: PunchGeoError = {
            code: "GPS_TIMEOUT",
            message: "Tempo esgotado ao obter localização.",
          };
          if (mountedRef.current) {
            setError(err);
            setState("timeout");
          }
          reject(err);
        }, DEFAULT_OPTIONS.timeout! + 500);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(hardTimeout);

            const coords = pos.coords;
            const result: PunchGeoReading = {
              lat: coords.latitude,
              lng: coords.longitude,
              accuracyM: coords.accuracy,
              altitudeM: coords.altitude ?? null,
              headingDeg:
                typeof coords.heading === "number" && Number.isFinite(coords.heading)
                  ? coords.heading
                  : null,
              speedMs:
                typeof coords.speed === "number" && Number.isFinite(coords.speed)
                  ? coords.speed
                  : null,
              capturedAt: pos.timestamp,
              captureDurationMs: Math.round(performance.now() - started),
              classification: classifyAccuracy(coords.accuracy),
            };

            if (mountedRef.current) {
              setReading(result);
              setState("success");
            }
            resolve(result);
          },
          (posErr) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(hardTimeout);

            const err = mapPositionError(posErr);
            if (mountedRef.current) {
              setError(err);
              setState(stateFromErrorCode(err.code));
            }
            reject(err);
          },
          DEFAULT_OPTIONS,
        );
      });
    })();

    inFlightRef.current = promise;
    promise.finally(() => {
      inFlightRef.current = null;
    });

    return promise;
  }, []);

  // Reservado para evoluções futuras (watchPosition contínuo, background,
  // geofencing em tempo real, replay). API pública NÃO muda.
  void options.diagnostics;

  return {
    state,
    isCapturing: state === "requesting_permission" || state === "capturing",
    reading,
    error,
    capture,
    reset,
  };
}