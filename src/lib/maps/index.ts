import { googleMapsProvider } from "./providers/google";
import { openStreetMapProvider } from "./providers/osm";
import { mapboxProvider } from "./providers/mapbox";
import type { MapProvider, MapProviderId } from "./types";

const REGISTRY: Record<MapProviderId, MapProvider> = {
  google: googleMapsProvider,
  osm: openStreetMapProvider,
  mapbox: mapboxProvider,
};

function resolveActiveId(): MapProviderId {
  const raw = (import.meta.env.VITE_MAP_PROVIDER as string | undefined)?.toLowerCase();
  if (raw === "osm" || raw === "mapbox" || raw === "google") return raw;
  return "google";
}

/**
 * Returns the active provider selected by `VITE_MAP_PROVIDER`.
 * Feature code MUST use this — never import providers directly.
 */
export function getMapProvider(): MapProvider {
  return REGISTRY[resolveActiveId()];
}

export function listMapProviders(): ReadonlyArray<MapProvider> {
  return [REGISTRY.google, REGISTRY.osm, REGISTRY.mapbox];
}

export * from "./types";
export { subscribeMapDiagnostics, getMapDiagnostics } from "./diagnostics";