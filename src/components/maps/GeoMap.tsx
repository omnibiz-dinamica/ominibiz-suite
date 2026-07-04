import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getMapProvider } from "@/lib/maps";
import type { LatLng, MapHandle } from "@/lib/maps/types";
import { cn } from "@/lib/utils";
import { GeoOfflineFallback } from "./GeoOfflineFallback";

interface GeoMapContextValue {
  handle: MapHandle | null;
}

const GeoMapCtx = createContext<GeoMapContextValue | null>(null);

export function useGeoMap(): MapHandle | null {
  const ctx = useContext(GeoMapCtx);
  return ctx?.handle ?? null;
}

export interface GeoMapProps {
  center: LatLng;
  zoom?: number;
  interactive?: boolean;
  /** Fallback content when the map cannot render (offline / no key / error). */
  fallback?: ReactNode;
  className?: string;
  /** Fallback data shown by <GeoOfflineFallback /> when no `fallback` prop. */
  offlineHint?: {
    lat?: number;
    lng?: number;
    accuracyM?: number;
    distanceM?: number;
    address?: string | null;
  };
  children?: ReactNode;
}

/**
 * Reusable map container. Mounts the active provider exactly once and keeps
 * the same instance alive across re-renders — only markers/circles/lines
 * are diffed inside child components.
 */
export function GeoMap({
  center,
  zoom = 16,
  interactive = true,
  fallback,
  className,
  offlineHint,
  children,
}: GeoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const provider = getMapProvider();
    if (!provider.isAvailable() || !containerRef.current) {
      setError("map-unavailable");
      return;
    }
    provider
      .mount({ container: containerRef.current, center, zoom, interactive })
      .then((h) => {
        if (cancelled) {
          h.destroy();
          return;
        }
        handleRef.current = h;
        setHandle(h);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // Mount once — center/zoom updates are pushed imperatively below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter without remounting.
  useEffect(() => {
    if (handle) handle.setCenter(center);
  }, [handle, center.lat, center.lng]);

  if (error) {
    return <>{fallback ?? <GeoOfflineFallback {...offlineHint} reason={error} />}</>;
  }

  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl bg-muted", className)}>
      <div ref={containerRef} className="h-full min-h-[240px] w-full" />
      <GeoMapCtx.Provider value={{ handle }}>{handle ? children : null}</GeoMapCtx.Provider>
    </div>
  );
}