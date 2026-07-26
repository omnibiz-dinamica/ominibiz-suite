import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type QueueRow = {
  id: string;
  event: string;
  ticket_id: string | null;
  recipient_user_id: string | null;
  recipient_phone: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  http_status: number | null;
  next_attempt_at: string | null;
  sent_at: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sending: "bg-primary/10 text-primary",
  sent: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-destructive/10 text-destructive",
  skipped: "bg-amber-500/10 text-amber-600",
};

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Auditoria do outbox `whatsapp_notifications`.
 * Só o Super Admin consegue reenfileirar (RPC valida o papel no servidor).
 */
export function WhatsappQueuePanel() {
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery<QueueRow[]>({
    queryKey: ["whatsapp-queue"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_notifications")
        .select(
          "id, event, ticket_id, recipient_user_id, recipient_phone, status, attempts, max_attempts, last_error, http_status, next_attempt_at, sent_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
    refetchInterval: 30_000,
  });

  const requeue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("whatsapp_requeue", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notificação reenfileirada");
      qc.invalidateQueries({ queryKey: ["whatsapp-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Fila de notificações WhatsApp</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos 50 registos do outbox. Destinatário sempre único; registos
            <span className="font-medium"> ignorados</span> indicam o motivo em detalhe.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["whatsapp-queue"] })}
        >
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">A carregar…</p>
      ) : data.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma notificação registada ainda.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Criado</th>
                <th className="py-2 pr-3">Evento</th>
                <th className="py-2 pr-3">Destinatário</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Tentativas</th>
                <th className="py-2 pr-3">Detalhe</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{fmt(row.created_at)}</td>
                  <td className="py-2 pr-3 font-medium">{row.event}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{row.recipient_phone ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_TONE[row.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {row.attempts}/{row.max_attempts}
                  </td>
                  <td className="py-2 pr-3 max-w-[320px] text-xs text-muted-foreground">
                    {row.last_error ?? (row.http_status ? `HTTP ${row.http_status}` : "—")}
                  </td>
                  <td className="py-2">
                    {(row.status === "failed" || row.status === "skipped") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={requeue.isPending}
                        onClick={() => requeue.mutate(row.id)}
                      >
                        Reenfileirar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}