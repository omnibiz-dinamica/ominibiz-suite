import { CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OfflinePunchApi } from "@/hooks/use-offline-punch";

const OP_LABEL: Record<string, string> = {
  start: "Início",
  pause: "Pausa",
  resume: "Retomar",
  stop: "Fim",
};

function hour(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Aviso da Folha de Ponto: sem rede / marcações por enviar / recusadas. */
export function OfflinePunchBanner({ offline }: { offline: OfflinePunchApi }) {
  if (!offline.enabled && offline.pending.length === 0 && offline.failed.length === 0) return null;
  const n = offline.pending.length;

  return (
    <div className="space-y-2">
      {!offline.online || n > 0 ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center"
        >
          <CloudOff className="h-4 w-4 shrink-0 text-warning-foreground" />
          <div className="flex-1">
            {!offline.online ? (
              <strong>Sem rede.</strong>
            ) : (
              <strong>{offline.syncing ? "A enviar marcações…" : "Rede disponível."}</strong>
            )}{" "}
            {n > 0
              ? `${n} marcação(ões) guardada(s) no telemóvel, por enviar. Não feche a sessão.`
              : "As marcações ficam guardadas no telemóvel e são enviadas quando a rede voltar."}
          </div>
          {offline.online && n > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={offline.syncing}
              onClick={() => void offline.syncNow()}
            >
              <RefreshCw className="mr-1 h-4 w-4" /> Enviar agora
            </Button>
          ) : null}
        </div>
      ) : null}

      {offline.failed.length > 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" /> Marcações sem rede não aceites — fale com o gestor
          </div>
          <ul className="mt-2 space-y-1">
            {offline.failed.map((e) => (
              <li key={e.client_event_id}>
                {OP_LABEL[e.op] ?? e.op} de {hour(e.captured_at)}: {e.error_message ?? e.error_code}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => void offline.dismissFailed()}
          >
            Já avisei o gestor
          </Button>
        </div>
      ) : null}
    </div>
  );
}
