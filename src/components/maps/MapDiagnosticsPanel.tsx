import { useEffect, useState } from "react";
import { getMapProvider } from "@/lib/maps";
import { getMapDiagnostics, subscribeMapDiagnostics } from "@/lib/maps/diagnostics";
import type { MapDiagnosticEvent } from "@/lib/maps/types";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

/**
 * Super Admin only. Shows active provider, load timings, geocode/reverse
 * activity and failures. No PII, no business data.
 */
export function MapDiagnosticsPanel() {
  const { isSuperAdmin } = useAuth();
  const [events, setEvents] = useState<ReadonlyArray<MapDiagnosticEvent>>(getMapDiagnostics());

  useEffect(() => {
    const unsub = subscribeMapDiagnostics(() => setEvents([...getMapDiagnostics()]));
    return () => {
      unsub();
    };
  }, []);

  if (!isSuperAdmin) return null;

  const provider = getMapProvider();
  const recent = events.slice(-30).reverse();

  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-sm">
      <header className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Diagnóstico de mapas</h3>
        <Badge variant="outline">Super Admin</Badge>
      </header>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Provider ativo</dt>
        <dd className="font-medium">
          {provider.displayName} <span className="text-muted-foreground">({provider.id})</span>
        </dd>
        <dt className="text-muted-foreground">Disponível</dt>
        <dd>{provider.isAvailable() ? "sim" : "não"}</dd>
        <dt className="text-muted-foreground">Eventos capturados</dt>
        <dd>{events.length}</dd>
      </dl>
      <div className="mt-4 max-h-64 overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-2 py-1">Quando</th>
              <th className="px-2 py-1">Tipo</th>
              <th className="px-2 py-1">Duração</th>
              <th className="px-2 py-1">Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                  Sem eventos ainda.
                </td>
              </tr>
            )}
            {recent.map((e, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1 font-mono">{new Date(e.at).toLocaleTimeString()}</td>
                <td className="px-2 py-1">{e.kind.replace("_", " ")}</td>
                <td className="px-2 py-1 font-mono">
                  {e.durationMs != null ? `${e.durationMs} ms` : "—"}
                </td>
                <td className="px-2 py-1 text-muted-foreground">{e.message ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}