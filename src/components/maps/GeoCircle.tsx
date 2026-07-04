import { useEffect } from "react";
import { useGeoMap } from "./GeoMap";
import type { CircleOptions } from "@/lib/maps/types";

export function GeoCircle(props: CircleOptions) {
  const handle = useGeoMap();
  useEffect(() => {
    if (!handle) return;
    return handle.drawCircle(props);
  }, [
    handle,
    props.id,
    props.center.lat,
    props.center.lng,
    props.radiusMeters,
    props.strokeColor,
    props.fillColor,
    props.fillOpacity,
  ]);
  return null;
}