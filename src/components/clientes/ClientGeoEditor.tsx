import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GeoMap, useGeoMap } from "@/components/maps/GeoMap";
import { GeoMarker } from "@/components/maps/GeoMarker";
import { GeoCircle } from "@/components/maps/GeoCircle";
import { getMapProvider } from "@/lib/maps";
import { usePunchGeolocation } from "@/hooks/use-punch-geolocation";
import { toast } from "sonner";
import { Crosshair, LocateFixed, Loader2, Search } from "lucide-react";

export interface ClientGeoValue {
  lat: number | null;
  lng: number | null;
  address: string | null;
  radiusM: number;
}

interface Props {
  value: ClientGeoValue;
  onChange: (next: ClientGeoValue) => void;
  /** Empresa default: usado apenas se o cliente ainda não tem raio próprio. */
  defaultRadiusM?: number;
}

// Faixa permitida — reforçada pelo validador em `validateClientGeo`.
export const MIN_RADIUS_M = 5;
export const MAX_RADIUS_M = 1000;

export function validateClientGeo(v: ClientGeoValue): string | null {
  const hasLat = typeof v.lat === "number" && Number.isFinite(v.lat);
  const hasLng = typeof v.lng === "number" && Number.isFinite(v.lng);
  if (hasLat !== hasLng) return "Latitude e Longitude devem ser preenchidas em conjunto.";
  if (hasLat && hasLng) {
    if (v.lat! < -90 || v.lat! > 90) return "Latitude deve estar entre -90 e 90.";
    if (v.lng! < -180 || v.lng! > 180) return "Longitude deve estar entre -180 e 180.";
  }
  if (v.radiusM < MIN_RADIUS_M) return `O raio mínimo é ${MIN_RADIUS_M} metros.`;
  if (v.radiusM > MAX_RADIUS_M) return `O raio máximo é ${MAX_RADIUS_M} metros.`;
  return null;
}

const DEFAULT_CENTER = { lat: 38.7223, lng: -9.1393 }; // Lisboa

export function ClientGeoEditor({ value, onChange, defaultRadiusM = 50 }: Props) {
  const provider = useMemo(() => getMapProvider(), []);
  const available = provider.isAvailable();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const hasPoint =
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng);

  const center = hasPoint ? { lat: value.lat!, lng: value.lng! } : DEFAULT_CENTER;

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const results = await provider.geocode(q);
      const first = results[0];
      if (!first) {
        toast.error("Endereço não encontrado.");
        return;
      }
      onChange({
        ...value,
        lat: first.location.lat,
        lng: first.location.lng,
        address: first.formattedAddress ?? value.address,
        radiusM: value.radiusM || defaultRadiusM,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/50 p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold">Localização do Trabalho</h3>
          <p className="text-xs text-muted-foreground">
            Define o local e o raio para validar o ponto do funcionário.
          </p>
        </div>
      </header>

      {/* Pesquisa */}
      <div className="space-y-1.5">
        <Label>Pesquisar endereço</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Rua, número, cidade…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            maxLength={250}
          />
          <Button type="button" variant="secondary" onClick={runSearch} disabled={searching || !available}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {!available && (
          <p className="text-[11px] text-muted-foreground">
            Mapa indisponível — utilize o preenchimento manual abaixo.
          </p>
        )}
      </div>

      {/* Mapa (ou fallback manual) */}
      {available ? (
        <GeoMap
          center={center}
          zoom={hasPoint ? 17 : 12}
          className="h-[280px]"
          offlineHint={{
            lat: value.lat ?? undefined,
            lng: value.lng ?? undefined,
            address: value.address,
          }}
        >
          <MapClickCapture onChange={onChange} value={value} defaultRadiusM={defaultRadiusM} />
          {hasPoint && (
            <>
              <GeoMarker
                id="client-location"
                position={{ lat: value.lat!, lng: value.lng! }}
                kind="client"
                title={value.address ?? "Local do cliente"}
              />
              <GeoCircle
                id="client-radius"
                center={{ lat: value.lat!, lng: value.lng! }}
                radiusMeters={value.radiusM}
              />
            </>
          )}
          <MapToolbar
            hasPoint={hasPoint}
            onCenter={() => value.lat && value.lng /* handled inside */}
            onMyLocation={(pos) =>
              onChange({
                ...value,
                lat: pos.lat,
                lng: pos.lng,
                radiusM: value.radiusM || defaultRadiusM,
              })
            }
            centerTo={hasPoint ? { lat: value.lat!, lng: value.lng! } : null}
          />
        </GeoMap>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          Mapa não disponível neste momento. Preencha latitude, longitude e raio manualmente.
        </div>
      )}

      {/* Campos + raio */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Latitude</Label>
          <Input
            inputMode="decimal"
            placeholder="38.7223"
            value={value.lat ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const n = raw === "" ? null : Number(raw.replace(",", "."));
              onChange({ ...value, lat: n === null || Number.isNaN(n) ? null : n });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Longitude</Label>
          <Input
            inputMode="decimal"
            placeholder="-9.1393"
            value={value.lng ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const n = raw === "" ? null : Number(raw.replace(",", "."));
              onChange({ ...value, lng: n === null || Number.isNaN(n) ? null : n });
            }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Endereço</Label>
        <Input
          maxLength={250}
          value={value.address ?? ""}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="Preenchido pela pesquisa ou manual"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Raio permitido</Label>
          <span className="text-xs font-mono text-muted-foreground">{value.radiusM} m</span>
        </div>
        <Slider
          min={MIN_RADIUS_M}
          max={MAX_RADIUS_M}
          step={5}
          value={[value.radiusM]}
          onValueChange={(v) => onChange({ ...value, radiusM: v[0] ?? value.radiusM })}
        />
        <p className="text-[11px] text-muted-foreground">
          Entre {MIN_RADIUS_M} m e {MAX_RADIUS_M} m. Default da empresa: {defaultRadiusM} m.
        </p>
      </div>

      {/* Pré-visualização */}
      {hasPoint && (
        <div className="rounded-xl border border-border bg-muted/50 p-3 text-xs">
          <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
            Pré-visualização
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
            <dt className="text-muted-foreground">Latitude</dt>
            <dd>{value.lat!.toFixed(6)}</dd>
            <dt className="text-muted-foreground">Longitude</dt>
            <dd>{value.lng!.toFixed(6)}</dd>
            <dt className="text-muted-foreground">Raio</dt>
            <dd>{value.radiusM} m</dd>
          </dl>
          {value.address && (
            <p className="mt-1 text-muted-foreground">{value.address}</p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Filhos internos ao GeoMap (acessam o handle) ----------

function MapClickCapture({
  value,
  onChange,
  defaultRadiusM,
}: {
  value: ClientGeoValue;
  onChange: (next: ClientGeoValue) => void;
  defaultRadiusM: number;
}) {
  const handle = useGeoMap();
  const provider = useMemo(() => getMapProvider(), []);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!handle) return;
    const off = handle.onClick(async (pos) => {
      const current = valueRef.current;
      onChange({
        ...current,
        lat: pos.lat,
        lng: pos.lng,
        radiusM: current.radiusM || defaultRadiusM,
      });
      try {
        const addr = await provider.reverseGeocode(pos);
        if (addr) {
          onChange({
            ...valueRef.current,
            address: addr,
          });
        }
      } catch {
        /* silencioso — reverse geocode é auxiliar */
      }
    });
    return () => {
      off();
    };
  }, [handle, provider, onChange, defaultRadiusM]);

  return null;
}

function MapToolbar({
  hasPoint,
  centerTo,
  onMyLocation,
}: {
  hasPoint: boolean;
  onCenter: () => void;
  centerTo: { lat: number; lng: number } | null;
  onMyLocation: (pos: { lat: number; lng: number }) => void;
}) {
  const handle = useGeoMap();
  const { capture, isCapturing } = usePunchGeolocation();

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col gap-1.5">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="pointer-events-auto h-8 w-8 shadow-md"
        disabled={!hasPoint || !handle}
        onClick={() => {
          if (handle && centerTo) handle.setCenter(centerTo);
        }}
        title="Centralizar no marcador"
      >
        <Crosshair className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="pointer-events-auto h-8 w-8 shadow-md"
        disabled={isCapturing}
        onClick={async () => {
          try {
            const r = await capture();
            onMyLocation({ lat: r.lat, lng: r.lng });
            handle?.setCenter({ lat: r.lat, lng: r.lng });
          } catch (err) {
            const message = (err as { message?: string }).message ?? "Não foi possível obter localização.";
            toast.error(message);
          }
        }}
        title="Minha localização"
      >
        {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
      </Button>
    </div>
  );
}