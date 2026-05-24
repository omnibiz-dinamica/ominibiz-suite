import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { punchAuditList, type PunchAuditRow } from "@/lib/punch-admin";
import { History, Plus, Pencil } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeEntryId: string | null;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") {
    // tenta datetime
    const d = new Date(v);
    if (!isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}T/.test(v)) return d.toLocaleString();
    return v;
  }
  return String(v);
}

const FIELD_LABEL: Record<string, string> = {
  started_at: "Início",
  ended_at: "Fim",
  paused_at: "Pausa",
  resumed_at: "Retorno",
  notes: "Notas",
  effective_minutes: "Min. efetivos",
};

export function PunchAuditDrawer({ open, onOpenChange, timeEntryId }: Props) {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["punch-audit", timeEntryId],
    queryFn: () => punchAuditList(timeEntryId!),
    enabled: open && !!timeEntryId,
  });

  const userIds = Array.from(new Set((audit ?? []).map((a) => a.changed_by)));
  const { data: names } = useQuery({
    queryKey: ["punch-audit-names", userIds.sort().join(",")],
    enabled: open && userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as { id: string; full_name: string | null }[]) {
        map[r.id] = r.full_name ?? r.id;
      }
      return map;
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Histórico de alterações</SheetTitle>
          <SheetDescription>Cada criação ou correção fica registrada com motivo.</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-3">
          {isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
          {!isLoading && (audit ?? []).length === 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              Sem alterações registradas.
            </div>
          )}
          {(audit ?? []).map((a: PunchAuditRow) => (
            <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {a.action === "create" ? <Plus className="h-3.5 w-3.5 text-success" /> : <Pencil className="h-3.5 w-3.5 text-info" />}
                  <span className="font-medium">{a.action === "create" ? "Criação" : "Correção"}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(a.changed_at).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                por {names?.[a.changed_by] ?? a.changed_by}
              </div>
              <div className="mt-2 rounded bg-muted/40 px-2 py-1 text-xs italic">"{a.reason}"</div>
              {Object.keys(a.changes ?? {}).length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {Object.entries(a.changes).map(([field, diff]) => (
                    <li key={field} className="grid grid-cols-[7rem_1fr] gap-2">
                      <span className="text-muted-foreground">{FIELD_LABEL[field] ?? field}</span>
                      <span>
                        <span className="line-through text-muted-foreground">{fmtVal(diff.old)}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium">{fmtVal(diff.new)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}