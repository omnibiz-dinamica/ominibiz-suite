import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, ModalBody, ModalHeader } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { History, Pencil, UserX } from "lucide-react";

type AuditRow = {
  id: string;
  event: string;
  actor_user_id: string | null;
  actor_role: string | null;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
};

export function TaskAbsenceAuditDrawer({
  open,
  onOpenChange,
  taskId,
  taskTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
  taskTitle?: string | null;
}) {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["task-audit", taskId],
    enabled: open && !!taskId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("task_audit_events" as never) as any)
        .select("id,event,actor_user_id,actor_role,previous_status,new_status,reason,created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const actorIds = useMemo(() => Array.from(new Set((audit ?? []).map((row) => row.actor_user_id).filter(Boolean) as string[])), [audit]);
  const { data: names } = useQuery({
    queryKey: ["task-audit-names", actorIds.join(",")],
    enabled: open && actorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name").in("id", actorIds);
      return Object.fromEntries(((data ?? []) as { id: string; full_name: string | null }[]).map((row) => [row.id, row.full_name ?? row.id]));
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <ModalHeader icon={History} title="Histórico da tarefa" description={taskTitle ?? "Eventos e alterações auditados."} />
        <ModalBody className="space-y-3">
          {isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
          {!isLoading && (audit ?? []).length === 0 && <div className="rounded-lg border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">Sem eventos registrados.</div>}
          {(audit ?? []).map((row) => (
            <div key={row.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {row.event === "absence" ? <UserX className="h-4 w-4 text-destructive" /> : <Pencil className="h-4 w-4 text-info" />}
                {row.event === "absence" ? "Falta" : row.event === "no_start_reason" ? "Motivo de não início" : row.event}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()} · {names?.[row.actor_user_id ?? ""] ?? row.actor_role ?? "Utilizador"}
              </div>
              {row.reason && <div className="mt-2 rounded bg-muted/40 px-2 py-1 text-xs">{row.reason}</div>}
              {(row.previous_status || row.new_status) && <div className="mt-2 text-xs text-muted-foreground">Estado: {row.previous_status ?? "—"} → {row.new_status ?? "—"}</div>}
            </div>
          ))}
        </ModalBody>
      </SheetContent>
    </Sheet>
  );
}
