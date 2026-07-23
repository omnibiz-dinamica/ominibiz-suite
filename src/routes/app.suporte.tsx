import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, LifeBuoy, MessageCircle } from "lucide-react";
import { NewTicketDialog } from "@/components/support/NewTicketDialog";
import {
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_TONE,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_LIST,
  TICKET_STATUS_TONE,
  TICKET_TYPE_LABEL,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SupportTicketType,
} from "@/lib/support/constants";
import { useRealtimeInvalidate } from "@/lib/realtime/subscribe";
import { invalidateSupportCache } from "@/lib/cache/support";

export const Route = createFileRoute("/app/suporte")({
  component: () => (
    <RoleGuard allow={["super_admin", "owner", "manager", "employee"]}>
      <SupportRouteContent />
    </RoleGuard>
  ),
});

type TicketRow = {
  id: string;
  ticket_number: string;
  company_id: string;
  type: SupportTicketType;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  title: string;
  created_at: string;
  updated_at: string;
};

function SupportRouteContent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isListRoute = pathname === "/app/suporte" || pathname === "/app/suporte/";
  return isListRoute ? <SupportListPage /> : <Outlet />;
}

function SupportListPage() {
  const { currentCompanyId, isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | SupportTicketStatus>("");
  const [q, setQ] = useState("");

  const { data: tickets = [], isLoading } = useQuery<TicketRow[]>({
    queryKey: ["support-tickets", "list", currentCompanyId, statusFilter],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      let query = supabase
        .from("support_tickets")
        .select("id, ticket_number, company_id, type, priority, status, title, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(200);
      // RLS já filtra por empresa para managers; para super admin operando dentro de empresa, filtramos manualmente
      if (currentCompanyId) query = query.eq("company_id", currentCompanyId);
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TicketRow[];
    },
  });

  useRealtimeInvalidate({
    channel: "support",
    table: "support_tickets",
    queryClient: qc,
    invalidate: invalidateSupportCache,
    enabled: !!currentCompanyId,
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return tickets;
    const lower = q.trim().toLowerCase();
    return tickets.filter(
      (t) => t.title.toLowerCase().includes(lower) || t.ticket_number.toLowerCase().includes(lower),
    );
  }, [tickets, q]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Central de Suporte</h1>
          <p className="text-sm text-muted-foreground">
            Envie pedidos, dúvidas e problemas diretamente à equipe do OmniBiz.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button asChild variant="outline">
              <Link to="/app/admin/suporte">Central Global</Link>
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)} disabled={!currentCompanyId}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo ticket
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título ou número (SUP-…)"
          className="max-w-sm"
        />
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => setStatusFilter(v === "all" ? "" : (v as SupportTicketStatus))}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {TICKET_STATUS_LIST.map((s) => (
              <SelectItem key={s} value={s}>
                {TICKET_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <LifeBuoy className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 font-display text-lg font-semibold">Nenhum ticket</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Você ainda não abriu nenhum ticket. Use o botão “Novo ticket” para enviar sua primeira solicitação.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link
                to="/app/suporte/$id"
                params={{ id: t.id }}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-muted-foreground">{t.ticket_number}</span>
                    <span className={"rounded px-1.5 py-0.5 " + TICKET_STATUS_TONE[t.status]}>
                      {TICKET_STATUS_LABEL[t.status]}
                    </span>
                    <span className={"rounded px-1.5 py-0.5 " + TICKET_PRIORITY_TONE[t.priority]}>
                      {TICKET_PRIORITY_LABEL[t.priority]}
                    </span>
                    <span className="text-muted-foreground">{TICKET_TYPE_LABEL[t.type]}</span>
                  </div>
                  <div className="mt-1 truncate text-sm font-medium">{t.title}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {new Date(t.updated_at).toLocaleString("pt-PT")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <NewTicketDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
