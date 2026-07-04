import type { MapDiagnosticEvent, MapProviderId } from "./types";

/**
 * In-memory diagnostic bus. Ring buffer capped at 200 events.
 * Exposed to Super Admin only via <MapDiagnosticsPanel />.
 */
const MAX_EVENTS = 200;
const events: MapDiagnosticEvent[] = [];
const listeners = new Set<() => void>();

export function recordMapDiagnostic(ev: MapDiagnosticEvent) {
  events.push(ev);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  listeners.forEach((l) => l());
}

export function subscribeMapDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMapDiagnostics(): ReadonlyArray<MapDiagnosticEvent> {
  return events;
}

export async function timed<T>(
  providerId: MapProviderId,
  kind: "mount" | "geocode" | "reverse",
  fn: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const res = await fn();
    recordMapDiagnostic({
      at: Date.now(),
      providerId,
      kind,
      durationMs: Math.round(performance.now() - started),
    });
    return res;
  } catch (err) {
    recordMapDiagnostic({
      at: Date.now(),
      providerId,
      kind: (kind + "_error") as MapDiagnosticEvent["kind"],
      durationMs: Math.round(performance.now() - started),
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}