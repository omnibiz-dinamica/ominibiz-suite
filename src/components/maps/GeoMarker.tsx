import { useEffect } from "react";
import { useGeoMap } from "./GeoMap";
import type { MarkerOptions } from "@/lib/maps/types";

export function GeoMarker(props: MarkerOptions) {
  const handle = useGeoMap();
  useEffect(() => {
    if (!handle) return;
    return handle.addMarker(props);
  }, [
    handle,
    props.id,
    props.position.lat,
    props.position.lng,
    props.label,
    props.title,
    props.kind,
    props.zIndex,
  ]);
  return null;
}