import { createServerFn } from "@tanstack/react-start";

/**
 * Fase 3 · Item 16 — Geocoding via Server Function (KI-001 · REQUEST_DENIED).
 *
 * A browser key gerida pela Lovable é restrita por HTTP Referrer e autoriza
 * apenas Maps JavaScript API + Places API (New). O Geocoding API precisa
 * ser chamado server-side através do Lovable Connector Gateway
 * (google_maps), que injeta as credenciais reais e aplica a rota correta.
 *
 * Nenhum segredo é exposto ao navegador — o cliente chama estas server
 * functions e recebe apenas o resultado normalizado.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export interface GeocodeApiResult {
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string | null;
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    place_id?: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

async function callGateway(pathAndQuery: string): Promise<GoogleGeocodeResponse> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmapsKey) {
    throw new Error(
      "Geocoding indisponível: conector Google Maps Platform não está vinculado a este projeto.",
    );
  }
  const resp = await fetch(`${GATEWAY_URL}${pathAndQuery}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmapsKey,
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(`geocoding gateway ${resp.status}: ${body}`);
    throw new Error(`Geocoding indisponível (HTTP ${resp.status}).`);
  }
  const json = (await resp.json()) as GoogleGeocodeResponse;
  return json;
}

function normalize(json: GoogleGeocodeResponse): GeocodeApiResult[] {
  if (json.status === "ZERO_RESULTS") return [];
  if (json.status !== "OK") {
    // Log-only server-side; usuário recebe mensagem genérica
    console.error(`geocoding status ${json.status}: ${json.error_message ?? ""}`);
    throw new Error(`Não foi possível localizar o endereço (${json.status}).`);
  }
  return json.results.map((r) => ({
    formattedAddress: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    placeId: r.place_id ?? null,
  }));
}

export const geocodeAddressFn = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string }) => {
    const q = String(data?.query ?? "").trim();
    if (q.length < 3) throw new Error("Informe um endereço com pelo menos 3 caracteres.");
    if (q.length > 250) throw new Error("Endereço muito longo.");
    return { query: q };
  })
  .handler(async ({ data }) => {
    const url = `/maps/api/geocode/json?address=${encodeURIComponent(data.query)}`;
    const json = await callGateway(url);
    return { results: normalize(json) };
  });

export const reverseGeocodeFn = createServerFn({ method: "POST" })
  .inputValidator((data: { lat: number; lng: number }) => {
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Latitude inválida.");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Longitude inválida.");
    return { lat, lng };
  })
  .handler(async ({ data }) => {
    const url = `/maps/api/geocode/json?latlng=${data.lat},${data.lng}`;
    const json = await callGateway(url);
    const first = json.status === "OK" ? json.results[0] : null;
    return { formattedAddress: first?.formatted_address ?? null };
  });