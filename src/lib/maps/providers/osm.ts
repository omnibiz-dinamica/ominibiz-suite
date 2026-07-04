import type { MapProvider } from "../types";

/**
 * OpenStreetMap provider — v1.0 stub.
 *
 * Contract is complete but implementation is deferred. Enables switching
 * `VITE_MAP_PROVIDER=osm` in a future release without touching feature code.
 */
export const openStreetMapProvider: MapProvider = {
  id: "osm",
  displayName: "OpenStreetMap",
  isAvailable() {
    return false;
  },
  async mount() {
    throw new Error("openStreetMapProvider: not implemented in v1.0");
  },
  async geocode() {
    throw new Error("openStreetMapProvider: not implemented in v1.0");
  },
  async reverseGeocode() {
    return null;
  },
};