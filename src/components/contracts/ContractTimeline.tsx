import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Circle, FileEdit, FilePlus, Send, Eye, CheckCircle2, XCircle, Clock } from "lucide-react";

const EVENT_LABEL: Record<string, string> = {
  created: "Contrato criado",
  edited: "Contrato editado",
  sent: "Enviado para assinatura",
  viewed: "Link visualizado",
  signed: "Contrato assinado",
  cancelled: "Contrato cancelado",
  expired: "Link expirado",
  status_changed: "Estado alterado",
};

const EVENT_ICON: Record<string, typeof Circle> = {
  created: FilePlus,
  edited: FileEdit,
  sent: Send,
  viewed: Eye,
  signed: CheckCircle2,
  cancelled: XCircle,
  expired: Clock,
  status_changed: Circle,
};

export function ContractTimeline({ contractId }: { contractId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["contract-audit", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_audit_events")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem eventos registados ainda.</p>;
  }

  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const Icon = EVENT_ICON[e.event_type] ?? Circle;
        return (
          <li key={e.id} className="flex items-start gap-3">
            <div className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 text-sm">
              <div className="font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString("pt-PT")}
                {e.metadata && Object.keys(e.metadata as object).length > 0 ? (
                  <span className="ml-2 font-mono">· {JSON.stringify(e.metadata)}</span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}