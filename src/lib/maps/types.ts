/**
 * OmniBiz — Map Provider Contract (v1.0)
 *
 * Single interface that every feature must use to interact with maps.
 * No feature module may import a provider SDK directly.
 *
 * See docs/ARCHITECTURE_MAP_PROVIDER.md for the full architecture.
 */

export type MapProviderId = "google" | "osm" | "mapbox";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeocodeResult {
  formattedAddress: string;
  location: LatLng;
  placeId?: string;
  source: MapProviderId;
}

export interface MarkerOptions {
  id: string;
  position: LatLng;
  label?: string;
  color?: string;
  /** Marker kind — used by providers to pick an icon/variant. */
  kind?: "client" | "start" | "pause" | "resume" | "stop" | "arrival" | "departure" | "default";
  title?: string;
  zIndex?: number;
}

export interface CircleOptions {
  id: string;
  center: LatLng;
  radiusMeters: number;
  strokeColor?: string;
  fillColor?: string;
  fillOpacity?: number;
}

export interface PolylineOptions {
  id: string;
  path: LatLng[];
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  dashed?: boolean;
}

/**
 * Imperative handle returned by the provider once the map is mounted.
 * All feature code manipulates the live map through this handle — the
 * map instance is never re-created between renders.
 */
export interface MapHandle {
  readonly providerId: MapProviderId;
  getCenter(): LatLng | null;
  setCenter(pos: LatLng): void;
  setZoom(zoom: number): void;
  fitBounds(bounds: MapBounds, paddingPx?: number): void;
  /** Idempotent add/update. Returns disposer. */
  addMarker(opts: MarkerOptions): () => void;
  drawCircle(opts: CircleOptions): () => void;
  drawPolyline(opts: PolylineOptions): () => void;
  clear(): void;
  destroy(): void;
}

export interface MapMountOptions {
  container: HTMLElement;
  center: LatLng;
  zoom?: number;
  interactive?: boolean;
}

export interface MapProvider {
  readonly id: MapProviderId;
  readonly displayName: string;
  /** True when the provider has runtime credentials/config available. */
  isAvailable(): boolean;
  /** Lazy-loads SDK assets and mounts a map. Reused across renders. */
  mount(opts: MapMountOptions): Promise<MapHandle>;
  geocode(query: string): Promise<GeocodeResult[]>;
  reverseGeocode(pos: LatLng): Promise<string | null>;
}

/**
 * Diagnostics event — captured by the diagnostic bus and surfaced only
 * to Super Admin. No PII, no business data.
 */
export interface MapDiagnosticEvent {
  at: number;
  providerId: MapProviderId;
  kind: "mount" | "mount_error" | "geocode" | "geocode_error" | "reverse" | "reverse_error";
  durationMs?: number;
  message?: string;
}