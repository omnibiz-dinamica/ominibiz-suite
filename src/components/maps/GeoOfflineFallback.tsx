import { MapPinOff } from "lucide-react";

export interface GeoOfflineFallbackProps {
  lat?: number;
  lng?: number;
  accuracyM?: number;
  distanceM?: number;
  address?: string | null;
  reason?: string | null;
}

/**
 * Offline / no-map fallback. Shown whenever the map provider is unavailable
 * so operational data (coordinates, distance, accuracy, address) remains
 * visible — no feature may depend exclusively on map rendering.
 */
export function GeoOfflineFallback({ lat, lng, accuracyM, distanceM, address, reason }: GeoOfflineFallbackProps) {
  return (
    <div className="flex min-h-[240px] w-full flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <MapPinOff className="h-4 w-4" />
        <span>Mapa indisponível{reason ? ` — ${reason}` : ""}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {lat != null && lng != null && (
          <>
            <dt className="text-muted-foreground">Latitude</dt>
            <dd className="font-mono">{lat.toFixed(6)}</dd>
            <dt className="text-muted-foreground">Longitude</dt>
            <dd className="font-mono">{lng.toFixed(6)}</dd>
          </>
        )}
        {accuracyM != null && (
          <>
            <dt className="text-muted-foreground">Accuracy</dt>
            <dd className="font-mono">{Math.round(accuracyM)} m</dd>
          </>
        )}
        {distanceM != null && (
          <>
            <dt className="text-muted-foreground">Distância</dt>
            <dd className="font-mono">{Math.round(distanceM)} m</dd>
          </>
        )}
        {address && (
          <>
            <dt className="text-muted-foreground">Endereço</dt>
            <dd className="col-span-1">{address}</dd>
          </>
        )}
      </dl>
    </div>
  );
}