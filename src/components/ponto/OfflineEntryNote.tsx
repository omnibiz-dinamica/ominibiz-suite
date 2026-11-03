import { useQuery } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { fetchOfflineEvents, formatDelay, offlineSummary } from "@/lib/punch/offline-flags";

const OP_LABEL = { start: "Início", pause: "Pausa", resume: "Retomar", stop: "Fim" } as const;

/** No detalhe do ponto: "Feito sem rede" e, por marcação, a hora no telemóvel e o atraso do envio. */
export function OfflineEntryNote({ entryId }: { entryId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["punch-offline-events", entryId],
    queryFn: () => fetchOfflineEvents(entryId),
  });
  const summary = offlineSummary(events);
  if (!summary) return null;

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        summary.warn ? "border-warning/40 bg-warning/10" : "border-border bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <CloudOff className="h-3.5 w-3.5" /> {summary.text}
      </div>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {events.map((e) => (
          <li key={`${e.op}-${e.captured_at}`}>
            {OP_LABEL[e.op]}:{" "}
            {new Date(e.captured_at).toLocaleString("pt-PT", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            (no telemóvel) · chegou {formatDelay(e.delay_minutes)} depois
          </li>
        ))}
      </ul>
    </div>
  );
}
