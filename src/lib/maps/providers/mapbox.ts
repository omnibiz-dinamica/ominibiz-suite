import type { MapProvider } from "../types";

/**
 * Mapbox provider — v1.0 stub.
 * Contract complete; enable in a future release by setting
 * `VITE_MAP_PROVIDER=mapbox` and providing `VITE_MAPBOX_TOKEN`.
 */
export const mapboxProvider: MapProvider = {
  id: "mapbox",
  displayName: "Mapbox",
  isAvailable() {
    return false;
  },
  async mount() {
    throw new Error("mapboxProvider: not implemented in v1.0");
  },
  async geocode() {
    throw new Error("mapboxProvider: not implemented in v1.0");
  },
  async reverseGeocode() {
    return null;
  },
};