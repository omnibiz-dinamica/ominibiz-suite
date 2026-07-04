import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Filter, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { GeoMap, GeoMarker, GeoCircle, GeoRoute } from "@/components/maps";
import { classifyAccuracy } from "@/lib/geo/accuracy";
import {
  classifyEventStatus,
  EVENT_LABEL,
  LOCATION_SOURCE_LABEL,
  STATUS_TONE_CLASS,
  formatDistance,
  formatDeviceSummary,
  sortGeoPoints,
  summarizeGeoPoints,
  type GeoPointRow,
  type StatusCategory,
} from "@/lib/punch/geo-view";

export interface PunchGeoDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  timeEntryId: string | null;
  entryLabel?: {
    user?: string | null;
    task?: string | null;
    client?: string | null;
  };
}

type StatusFilter = "all" | StatusCategory;

export function PunchGeoDrawer({ open, onOpenChange, timeEntryId, entryLabel }: PunchGeoDrawerProps) {
  const { isSuperAdmin } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: points, isLoading } = useQuery({
    queryKey: ["punch-geo-points", timeEntryId],
    enabled: !!timeEntryId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entry_geopoints")
        .select(
          "id, time_entry_id, company_id, user_id, event_kind, captured_at, server_at, lat, lng, accuracy_m, client_lat, client_lng, client_radius_m, distance_m, geo_status, reason_code, reason_text, location_source, geo_policy_version, device_fingerprint, mock_location_suspected",
        )
        .eq("time_entry_id", timeEntryId!)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as GeoPointRow[];
    },
  });

  const sorted = useMemo(() => sortGeoPoints(points ?? []), [points]);
  const filtered = useMemo(() => {
    if (statusFilter === "all") return sorted;
    return sorted.filter((p) => classifyEventStatus(p).category === statusFilter);
  }, [sorted, statusFilter]);
  const summary = useMemo(() => summarizeGeoPoints(sorted), [sorted]);

  const clientLoc = useMemo(() => {
    const p = sorted.find((x) => x.client_lat != null && x.client_lng != null);
    if (!p || p.client_lat == null || p.client_lng == null) return null;
    return { lat: p.client_lat, lng: p.client_lng, radius: p.client_radius_m ?? 100 };
  }, [sorted]);

  const mapCenter = useMemo(() => {
    if (clientLoc) return { lat: clientLoc.lat, lng: clientLoc.lng };
    const p = sorted.find((x) => x.lat != null && x.lng != null);
    if (p && p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
    return null;
  }, [clientLoc, sorted]);

  const pathPoints = useMemo(
    () =>
      filtered
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ lat: p.lat as number, lng: p.lng as number })),
    [filtered],
  );

  const selected = useMemo(() => sorted.find((p) => p.id === selectedId) ?? null, [sorted, selectedId]);
  const policyVersion = sorted[0]?.geo_policy_version ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-5xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Geolocalização do registo
          </SheetTitle>
          {entryLabel && (
            <p className="text-xs text-muted-foreground">
              {[entryLabel.user, entryLabel.task, entryLabel.client].filter(Boolean).join(" · ")}
            </p>
          )}
        </SheetHeader>

        {/* Resumo */}
        <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SummaryChip icon="🟢" label="Dentro" value={summary.within} tone="success" />
          <SummaryChip icon="🔴" label="Fora" value={summary.out_of_range} tone="destructive" />
          <SummaryChip icon="🟡" label="Justificados" value={summary.justified} tone="warning" />
          <SummaryChip icon="⚫" label="Sem GPS" value={summary.no_location} tone="muted" />
          <SummaryChip icon="🟣" label="Cliente sem GEO" value={summary.client_without_geo} tone="info" />
        </section>

        {/* Filtros */}
        <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="within">🟢 Dentro do raio</SelectItem>
              <SelectItem value="out_of_range">🔴 Fora do raio</SelectItem>
              <SelectItem value="justified">🟡 Justificados</SelectItem>
              <SelectItem value="no_location">⚫ Sem localização</SelectItem>
              <SelectItem value="client_without_geo">🟣 Cliente sem coordenadas</SelectItem>
            </SelectContent>
          </Select>
          {statusFilter !== "all" && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setStatusFilter("all")}>
              <X className="mr-1 h-3 w-3" /> Limpar
            </Button>
          )}
          {isSuperAdmin && policyVersion != null && (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              geo_policy_version: {policyVersion}
            </span>
          )}
        </section>

        {/* Conteúdo: mapa + timeline */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {/* Mapa (mobile: em cima; desktop: à esquerda) */}
          <div className="order-1 lg:order-2">
            {mapCenter ? (
              <GeoMap
                center={mapCenter}
                zoom={16}
                className="h-[320px] sm:h-[420px] lg:h-[560px]"
                offlineHint={{
                  lat: mapCenter.lat,
                  lng: mapCenter.lng,
                }}
              >
                {clientLoc && (
                  <>
                    <GeoMarker
                      id="client"
                      position={{ lat: clientLoc.lat, lng: clientLoc.lng }}
                      kind="client"
                      title={entryLabel?.client ?? "Cliente"}
                      label="C"
                      zIndex={1}
                    />
                    <GeoCircle
                      id="client-radius"
                      center={{ lat: clientLoc.lat, lng: clientLoc.lng }}
                      radiusMeters={clientLoc.radius}
                    />
                  </>
                )}
                {pathPoints.length >= 2 && (
                  <GeoRoute id="events-path" path={pathPoints} strokeWeight={3} dashed />
                )}
                {filtered
                  .filter((p) => p.lat != null && p.lng != null)
                  .map((p, i) => (
                    <GeoMarker
                      key={p.id}
                      id={`ev-${p.id}`}
                      position={{ lat: p.lat as number, lng: p.lng as number }}
                      kind={p.event_kind}
                      label={String(i + 1)}
                      title={`${EVENT_LABEL[p.event_kind]} — ${new Date(p.captured_at).toLocaleTimeString()}`}
                      zIndex={10 + i}
                    />
                  ))}
              </GeoMap>
            ) : (
              <div className="grid h-[320px] place-items-center rounded-xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
                Sem coordenadas para exibir no mapa.
              </div>
            )}
            {selected && <SelectedPopup point={selected} onClose={() => setSelectedId(null)} />}
          </div>

          {/* Timeline (mobile: abaixo do mapa; desktop: à esquerda) */}
          <div className="order-2 lg:order-1">
            {isLoading && (
              <p className="text-sm text-muted-foreground">A carregar eventos…</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nenhum evento de geolocalização para os filtros atuais.
              </p>
            )}
            {filtered.length > 0 && (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {filtered.map((p, i) => {
                  const badge = classifyEventStatus(p);
                  const acc = classifyAccuracy(p.accuracy_m);
                  const isSelected = selectedId === p.id;
                  return (
                    <li key={p.id} className="relative">
                      <span className="absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-background text-[9px] font-bold">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : p.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">
                            {new Date(p.captured_at).toLocaleTimeString("pt-PT")}
                          </span>
                          <span className="text-sm font-semibold">{EVENT_LABEL[p.event_kind]}</span>
                          <Badge variant="outline" className={`ml-auto text-[10px] ${STATUS_TONE_CLASS[badge.tone]}`}>
                            {badge.icon} {badge.label}
                          </Badge>
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>Distância: <b className="text-foreground">{formatDistance(p.distance_m)}</b></span>
                          <span>Precisão: <b className="text-foreground">{acc.icon} {p.accuracy_m != null ? `${Math.round(p.accuracy_m)} m` : "—"}</b></span>
                        </div>
                        {p.reason_text && (
                          <p className="mt-1.5 rounded-md bg-amber-500/10 p-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                            <b>Motivo:</b> {p.reason_text}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  tone: "success" | "destructive" | "warning" | "muted" | "info";
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${STATUS_TONE_CLASS[tone]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-80">{icon} {label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function SelectedPopup({ point, onClose }: { point: GeoPointRow; onClose: () => void }) {
  const badge = classifyEventStatus(point);
  const acc = classifyAccuracy(point.accuracy_m);
  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold">{EVENT_LABEL[point.event_kind]}</span>
        <Badge variant="outline" className={`text-[10px] ${STATUS_TONE_CLASS[badge.tone]}`}>
          {badge.icon} {badge.label}
        </Badge>
        <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <PopupField label="Hora" value={new Date(point.captured_at).toLocaleString("pt-PT")} />
        <PopupField label="Latitude" value={point.lat != null ? point.lat.toFixed(6) : "—"} mono />
        <PopupField label="Longitude" value={point.lng != null ? point.lng.toFixed(6) : "—"} mono />
        <PopupField label="Precisão" value={`${acc.icon} ${point.accuracy_m != null ? `${Math.round(point.accuracy_m)} m` : "—"}`} />
        <PopupField label="Distância" value={formatDistance(point.distance_m)} />
        <PopupField label="Fonte" value={point.location_source ? LOCATION_SOURCE_LABEL[point.location_source] : "—"} />
        <PopupField label="Dispositivo" value={formatDeviceSummary(point.device_fingerprint)} span />
        {point.reason_text && <PopupField label="Justificativa" value={point.reason_text} span />}
      </dl>
    </div>
  );
}

function PopupField({ label, value, mono, span }: { label: string; value: string; mono?: boolean; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}