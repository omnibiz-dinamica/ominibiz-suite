/**
 * OmniBiz — Geo View Helpers
 *
 * Labels e classificações usadas na visualização operacional da
 * geolocalização (Gestão da Folha de Ponto). Baseia-se exclusivamente
 * nos dados já persistidos em `time_entry_geopoints`.
 */

export type PunchEventKind =
  | "arrival"
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "departure";

export type GeoStatus = "within" | "out_of_range" | "no_location";

export type GeoReasonCode =
  | "WITHIN_RADIUS"
  | "OUT_OF_RADIUS"
  | "NO_GPS"
  | "GPS_TIMEOUT"
  | "GPS_DENIED"
  | "CLIENT_WITHOUT_LOCATION"
  | "LOW_ACCURACY"
  | "MANUAL_OVERRIDE"
  | "ADMIN_OVERRIDE";

export type LocationSource = "gps" | "wifi" | "beacon" | "qr_code" | "nfc" | "manual";

export interface GeoPointRow {
  id: string;
  time_entry_id: string;
  company_id: string;
  user_id: string;
  event_kind: PunchEventKind;
  captured_at: string;
  server_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  client_lat: number | null;
  client_lng: number | null;
  client_radius_m: number | null;
  distance_m: number | null;
  geo_status: GeoStatus | null;
  reason_code: GeoReasonCode | null;
  reason_text: string | null;
  location_source: LocationSource | null;
  geo_policy_version: number | null;
  device_fingerprint: Record<string, unknown> | null;
  mock_location_suspected: boolean | null;
}

export const EVENT_ORDER: Record<PunchEventKind, number> = {
  arrival: 0,
  start: 1,
  pause: 2,
  resume: 3,
  stop: 4,
  departure: 5,
};

export const EVENT_LABEL: Record<PunchEventKind, string> = {
  arrival: "Chegada",
  start: "Início",
  pause: "Pausa",
  resume: "Retomada",
  stop: "Encerramento",
  departure: "Partida",
};

/** Categoria visual do evento no histórico. */
export type StatusCategory =
  | "within"
  | "justified"
  | "out_of_range"
  | "no_location"
  | "client_without_geo";

export interface StatusBadge {
  category: StatusCategory;
  icon: "🟢" | "🟡" | "🔴" | "⚫" | "🟣";
  label: string;
  /** Semantic token — mapeia para classes Tailwind via consumidor. */
  tone: "success" | "warning" | "destructive" | "muted" | "info";
}

/**
 * Classifica um evento a partir dos dados persistidos.
 * Nunca expõe códigos internos ao usuário — apenas rótulos.
 */
export function classifyEventStatus(p: GeoPointRow): StatusBadge {
  if (p.reason_code === "CLIENT_WITHOUT_LOCATION") {
    return { category: "client_without_geo", icon: "🟣", label: "Cliente sem coordenadas", tone: "info" };
  }
  if (p.geo_status === "no_location") {
    return { category: "no_location", icon: "⚫", label: "Sem localização", tone: "muted" };
  }
  if (p.reason_text && p.reason_text.trim().length > 0) {
    return { category: "justified", icon: "🟡", label: "Justificado", tone: "warning" };
  }
  if (p.geo_status === "out_of_range") {
    return { category: "out_of_range", icon: "🔴", label: "Fora do raio", tone: "destructive" };
  }
  return { category: "within", icon: "🟢", label: "Dentro do raio", tone: "success" };
}

export const STATUS_TONE_CLASS: Record<StatusBadge["tone"], string> = {
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  destructive: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
};

export const LOCATION_SOURCE_LABEL: Record<LocationSource, string> = {
  gps: "GPS",
  wifi: "Wi-Fi",
  beacon: "Beacon",
  qr_code: "QR Code",
  nfc: "NFC",
  manual: "Manual",
};

export function formatDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export function formatDeviceSummary(fp: Record<string, unknown> | null | undefined): string {
  if (!fp) return "—";
  const platform = (fp.platform ?? fp.os ?? fp.userAgent ?? "") as string;
  const browser = (fp.browser ?? "") as string;
  const parts = [platform, browser].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Dispositivo desconhecido";
}

export interface GeoSummary {
  total: number;
  within: number;
  out_of_range: number;
  justified: number;
  no_location: number;
  client_without_geo: number;
}

export function summarizeGeoPoints(points: GeoPointRow[]): GeoSummary {
  const s: GeoSummary = { total: 0, within: 0, out_of_range: 0, justified: 0, no_location: 0, client_without_geo: 0 };
  for (const p of points) {
    s.total++;
    s[classifyEventStatus(p).category]++;
  }
  return s;
}

export function sortGeoPoints(points: GeoPointRow[]): GeoPointRow[] {
  return [...points].sort((a, b) => {
    const t = new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime();
    if (t !== 0) return t;
    return EVENT_ORDER[a.event_kind] - EVENT_ORDER[b.event_kind];
  });
}

/** Estrutura pronta para futura exportação (PDF / Excel). */
export interface GeoExportRow {
  hora: string;
  evento: string;
  status: string;
  distancia: string;
  precisao: string;
  latitude: string;
  longitude: string;
  fonte: string;
  justificativa: string;
}

export function toExportRows(points: GeoPointRow[]): GeoExportRow[] {
  return sortGeoPoints(points).map((p) => {
    const badge = classifyEventStatus(p);
    return {
      hora: new Date(p.captured_at).toLocaleString("pt-PT"),
      evento: EVENT_LABEL[p.event_kind],
      status: badge.label,
      distancia: formatDistance(p.distance_m),
      precisao: p.accuracy_m != null ? `${Math.round(p.accuracy_m)} m` : "—",
      latitude: p.lat != null ? p.lat.toFixed(6) : "—",
      longitude: p.lng != null ? p.lng.toFixed(6) : "—",
      fonte: p.location_source ? LOCATION_SOURCE_LABEL[p.location_source] : "—",
      justificativa: p.reason_text ?? "",
    };
  });
}