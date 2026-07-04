import { useEffect, useMemo } from "react";
import { useGeoMap } from "./GeoMap";
import type { PolylineOptions } from "@/lib/maps/types";

export function GeoRoute(props: PolylineOptions) {
  const handle = useGeoMap();
  const key = useMemo(
    () => props.path.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|"),
    [props.path],
  );
  useEffect(() => {
    if (!handle) return;
    return handle.drawPolyline(props);
  }, [handle, props.id, key, props.strokeColor, props.strokeWeight, props.strokeOpacity]);
  return null;
}