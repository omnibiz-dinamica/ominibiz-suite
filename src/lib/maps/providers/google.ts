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

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

async function gatewayGeocode(query: string): Promise<GeocodeResult[]> {
  // Server-side call — only useful when the app calls this from a server fn.
  // Client geocoding uses the Places API via the JS SDK.
  const gmaps = await loadGoogleMaps();
  return new Promise((resolve, reject) => {
    const svc = new gmaps.maps.Geocoder();
    svc.geocode({ address: query }, (results, status) => {
      if (status !== "OK" || !results) {
        reject(new Error(`geocode: ${status}`));
        return;
      }
      resolve(
        results.map((r) => ({
          formattedAddress: r.formatted_address,
          location: { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() },
          placeId: r.place_id,
          source: "google" as const,
        })),
      );
    });
  });
}

async function gatewayReverse(pos: LatLng): Promise<string | null> {
  const gmaps = await loadGoogleMaps();
  return new Promise((resolve) => {
    const svc = new gmaps.maps.Geocoder();
    svc.geocode({ location: pos }, (results, status) => {
      if (status !== "OK" || !results || results.length === 0) {
        resolve(null);
        return;
      }
      resolve(results[0].formatted_address ?? null);
    });
  });
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

// Silence unused var linter for GATEWAY_URL — reserved for server-side geocoding.
void GATEWAY_URL;