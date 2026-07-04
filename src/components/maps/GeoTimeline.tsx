import { useEffect, useMemo } from "react";
import { useGeoMap } from "./GeoMap";
import { GeoMarker } from "./GeoMarker";
import { GeoRoute } from "./GeoRoute";
import type { LatLng, MarkerOptions } from "@/lib/maps/types";

export interface GeoTimelinePoint {
  id: string;
  position: LatLng;
  label?: string;
  kind?: MarkerOptions["kind"];
  at?: string | Date;
}

export interface GeoTimelineProps {
  points: GeoTimelinePoint[];
  routeId?: string;
  strokeColor?: string;
  autoFit?: boolean;
  fitPaddingPx?: number;
}

/**
 * Ordered markers + connecting polyline. Reusable across Ponto and any
 * future flow (replay de rota, múltiplos marcadores, etc).
 */
export function GeoTimeline({
  points,
  routeId = "geo-timeline",
  strokeColor,
  autoFit = true,
  fitPaddingPx = 48,
}: GeoTimelineProps) {
  const handle = useGeoMap();
  const path = useMemo(() => points.map((p) => p.position), [points]);

  useEffect(() => {
    if (!handle || !autoFit || path.length === 0) return;
    const lats = path.map((p) => p.lat);
    const lngs = path.map((p) => p.lng);
    handle.fitBounds(
      {
        north: Math.max(...lats),
        south: Math.min(...lats),
        east: Math.max(...lngs),
        west: Math.min(...lngs),
      },
      fitPaddingPx,
    );
  }, [handle, path, autoFit, fitPaddingPx]);

  return (
    <>
      {points.map((p, i) => (
        <GeoMarker
          key={p.id}
          id={p.id}
          position={p.position}
          label={p.label ?? String(i + 1)}
          kind={p.kind}
          zIndex={10 + i}
        />
      ))}
      {path.length >= 2 && (
        <GeoRoute id={routeId} path={path} strokeColor={strokeColor} strokeWeight={3} />
      )}
    </>
  );
}