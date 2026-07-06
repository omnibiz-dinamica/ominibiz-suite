/// <reference types="google.maps" />
import type {
  CircleOptions,
  GeocodeResult,
  LatLng,
  MapHandle,
  MapMountOptions,
  MapProvider,
  MarkerOptions,
  PolylineOptions,
} from "../types";
import { timed } from "../diagnostics";
import { geocodeAddressFn, reverseGeocodeFn } from "../geocoding.functions";

const BROWSER_KEY = (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY ?? "") as string;
const TRACKING_ID = (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID ?? "") as string;

// Global loader — the Maps JS API is loaded exactly once per browser session.
let loaderPromise: Promise<typeof google> | null = null;

function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("google-maps: window is not available"));
  }
  if ((window as any).google?.maps?.Map) {
    return Promise.resolve((window as any).google);
  }
  if (loaderPromise) return loaderPromise;
  if (!BROWSER_KEY) {
    return Promise.reject(new Error("google-maps: missing VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"));
  }

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = `__omnibiz_gmaps_cb_${Date.now()}`;
    (window as any)[cbName] = () => {
      resolve((window as any).google);
      delete (window as any)[cbName];
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      loading: "async",
      callback: cbName,
    });
    if (TRACKING_ID) params.set("channel", TRACKING_ID);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("google-maps: script load failed"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

function makeHandle(map: google.maps.Map): MapHandle {
  const markers = new Map<string, google.maps.Marker>();
  const circles = new Map<string, google.maps.Circle>();
  const polylines = new Map<string, google.maps.Polyline>();
  const clickListeners = new Set<(pos: LatLng) => void>();
  map.addListener("click", (ev: google.maps.MapMouseEvent) => {
    if (!ev.latLng) return;
    const pos = { lat: ev.latLng.lat(), lng: ev.latLng.lng() };
    clickListeners.forEach((fn) => fn(pos));
  });

  const handle: MapHandle = {
    providerId: "google",
    getCenter() {
      const c = map.getCenter();
      return c ? { lat: c.lat(), lng: c.lng() } : null;
    },
    setCenter(pos) {
      map.panTo(pos);
    },
    setZoom(zoom) {
      map.setZoom(zoom);
    },
    fitBounds(bounds, paddingPx = 48) {
      const b = new google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east },
      );
      map.fitBounds(b, paddingPx);
    },
    addMarker(opts: MarkerOptions) {
      const existing = markers.get(opts.id);
      if (existing) {
        existing.setPosition(opts.position);
        existing.setTitle(opts.title ?? opts.label ?? "");
      } else {
        const marker = new google.maps.Marker({
          map,
          position: opts.position,
          label: opts.label,
          title: opts.title ?? opts.label,
          zIndex: opts.zIndex,
        });
        markers.set(opts.id, marker);
      }
      return () => {
        const m = markers.get(opts.id);
        if (m) {
          m.setMap(null);
          markers.delete(opts.id);
        }
      };
    },
    drawCircle(opts: CircleOptions) {
      const existing = circles.get(opts.id);
      if (existing) {
        existing.setCenter(opts.center);
        existing.setRadius(opts.radiusMeters);
      } else {
        const circle = new google.maps.Circle({
          map,
          center: opts.center,
          radius: opts.radiusMeters,
          strokeColor: opts.strokeColor,
          fillColor: opts.fillColor,
          fillOpacity: opts.fillOpacity ?? 0.15,
          strokeWeight: 1.5,
        });
        circles.set(opts.id, circle);
      }
      return () => {
        const c = circles.get(opts.id);
        if (c) {
          c.setMap(null);
          circles.delete(opts.id);
        }
      };
    },
    drawPolyline(opts: PolylineOptions) {
      const existing = polylines.get(opts.id);
      const path = opts.path.map((p) => new google.maps.LatLng(p.lat, p.lng));
      if (existing) {
        existing.setPath(path);
      } else {
        const line = new google.maps.Polyline({
          map,
          path,
          strokeColor: opts.strokeColor,
          strokeOpacity: opts.strokeOpacity ?? 0.9,
          strokeWeight: opts.strokeWeight ?? 3,
        });
        polylines.set(opts.id, line);
      }
      return () => {
        const l = polylines.get(opts.id);
        if (l) {
          l.setMap(null);
          polylines.delete(opts.id);
        }
      };
    },
    onClick(handler) {
      clickListeners.add(handler);
      return () => {
        clickListeners.delete(handler);
      };
    },
    clear() {
      markers.forEach((m) => m.setMap(null));
      circles.forEach((c) => c.setMap(null));
      polylines.forEach((l) => l.setMap(null));
      markers.clear();
      circles.clear();
      polylines.clear();
    },
    destroy() {
      handle.clear();
    },
  };
  return handle;
}

// Fase 3 · Item 16 (KI-001): Geocoding roda em server function para evitar
// REQUEST_DENIED da browser key restrita por HTTP Referrer. Ver
// src/lib/maps/geocoding.functions.ts e docs/KNOWN_ISSUES.md#KI-001.
async function gatewayGeocode(query: string): Promise<GeocodeResult[]> {
  const { results } = await geocodeAddressFn({ data: { query } });
  return results.map((r) => ({
    formattedAddress: r.formattedAddress,
    location: { lat: r.lat, lng: r.lng },
    placeId: r.placeId ?? undefined,
    source: "google" as const,
  }));
}

async function gatewayReverse(pos: LatLng): Promise<string | null> {
  const { formattedAddress } = await reverseGeocodeFn({ data: pos });
  return formattedAddress;
}

export const googleMapsProvider: MapProvider = {
  id: "google",
  displayName: "Google Maps",
  isAvailable() {
    return typeof window !== "undefined" && !!BROWSER_KEY;
  },
  async mount(opts: MapMountOptions) {
    return timed("google", "mount", async () => {
      const gmaps = await loadGoogleMaps();
      const map = new gmaps.maps.Map(opts.container, {
        center: opts.center,
        zoom: opts.zoom ?? 16,
        disableDefaultUI: opts.interactive === false,
        gestureHandling: opts.interactive === false ? "none" : "greedy",
        clickableIcons: false,
      });
      return makeHandle(map);
    });
  },
  async geocode(query) {
    return timed("google", "geocode", () => gatewayGeocode(query));
  },
  async reverseGeocode(pos) {
    return timed("google", "reverse", () => gatewayReverse(pos));
  },
};