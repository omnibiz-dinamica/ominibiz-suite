import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import type { PunchGeoReading, PunchGeoState } from "@/hooks/use-punch-geolocation";

interface Props {
  state: PunchGeoState;
  reading: PunchGeoReading | null;
}

/**
 * Painel de diagnóstico do hook `usePunchGeolocation`.
 * Visível APENAS para Super Admin. Gestor e Funcionário não veem nada.
 */
export function PunchGeoDiagnostics({ state, reading }: Props) {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-xs">
      <header className="flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold">Diagnóstico GPS</h4>
        <Badge variant="outline">Super Admin</Badge>
      </header>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Estado</dt>
        <dd className="font-mono">{state}</dd>
        <dt className="text-muted-foreground">Latitude</dt>
        <dd className="font-mono">{reading?.lat.toFixed(6) ?? "—"}</dd>
        <dt className="text-muted-foreground">Longitude</dt>
        <dd className="font-mono">{reading?.lng.toFixed(6) ?? "—"}</dd>
        <dt className="text-muted-foreground">Accuracy</dt>
        <dd className="font-mono">
          {reading ? `${Math.round(reading.accuracyM)} m` : "—"}
        </dd>
        <dt className="text-muted-foreground">Classificação</dt>
        <dd>
          {reading
            ? `${reading.classification.icon} ${reading.classification.label}`
            : "—"}
        </dd>
        <dt className="text-muted-foreground">Timestamp</dt>
        <dd className="font-mono">
          {reading ? new Date(reading.capturedAt).toISOString() : "—"}
        </dd>
        <dt className="text-muted-foreground">Tempo de captura</dt>
        <dd className="font-mono">
          {reading ? `${reading.captureDurationMs} ms` : "—"}
        </dd>
      </dl>
    </section>
  );
}