import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle } from "lucide-react";
import {
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_LIST,
  TICKET_PRIORITY_TONE,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_LIST,
  TICKET_STATUS_TONE,
  TICKET_TYPE_LABEL,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/lib/support/constants";
import { useRealtimeInvalidate } from "@/lib/realtime/subscribe";
import { invalidateSupportCache } from "@/lib/cache/support";

export const Route = createFileRoute("/app/admin/suporte")({
  component: () => (
    <RoleGuard allow={["super_admin"]}>
      <SupportAdminPage />
    </RoleGuard>
  ),
});

type Row = {
  id: string;
  ticket_number: string;
  company_id: string;
  type: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  title: string;
  created_at: string;
  updated_at: string;
  companies: { name: string } | null;
};

const PRIORITY_ORDER: Record<SupportTicketPriority, number> = {
  urgente: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
};

function SupportAdminPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"" | SupportTicketStatus>("");
  const [priority, setPriority] = useState<"" | SupportTicketPriority>("");
  const [q, setQ] = useState("");

  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ["support-tickets", "admin-global", status, priority],
    queryFn: async () => {
      let query = supabase
        .from("support_tickets")
        .select(
          "id, ticket_number, company_id, type, priority, status, title, created_at, updated_at, companies(name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (status) query = query.eq("status", status);
      if (priority) query = query.eq("priority", priority);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  useRealtimeInvalidate({
    channel: "support-admin",
    table: "support_tickets",
    queryClient: qc,
    invalidate: invalidateSupportCache,
  });

  const filtered = useMemo(() => {
    const arr = q.trim()
      ? data.filter((t) => {
          const lower = q.trim().toLowerCase();
          return (
            t.title.toLowerCase().includes(lower) ||
            t.ticket_number.toLowerCase().includes(lower) ||
            (t.companies?.name?.toLowerCase().includes(lower) ?? false)
          );
        })
      : data;

    // Ordenação: urgentes/altos primeiro, depois mais antigos sem resposta, depois mais recentes.
    return [...arr].sort((a, b) => {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      const openA = a.status === "aberto" ? 0 : 1;
      const openB = b.status === "aberto" ? 0 : 1;
      if (openA !== openB) return openA - openB;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [data, q]);

  const kpis = useMemo(() => {
    const total = data.length;
    const abertos = data.filter((t) => t.status === "aberto").length;
    const urgentes = data.filter((t) => t.priority === "urgente").length;
    const emDev = data.filter((t) => t.status === "em_desenvolvimento").length;
    return { total, abertos, urgentes, emDev };
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Central Global de Suporte
          </h1>
          <p className="text-sm text-muted-foreground">
            Todos os tickets de todas as empresas. Ordenação por prioridade.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/app/suporte">Voltar à Central</Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: kpis.total },
          { label: "Abertos", value: kpis.abertos },
          { label: "Urgentes", value: kpis.urgentes, tone: "text-destructive" },
          { label: "Em desenvolvimento", value: kpis.emDev },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={"mt-1 text-2xl font-semibold " + ((k as any).tone ?? "")}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título, número ou empresa"
          className="max-w-sm"
        />
        <Select
          value={status || "all"}
          onValueChange={(v) => setStatus(v === "all" ? "" : (v as SupportTicketStatus))}
        >
          <SelectTrigger className="w-52"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {TICKET_STATUS_LIST.map((s) => (
              <SelectItem key={s} value={s}>{TICKET_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priority || "all"}
          onValueChange={(v) => setPriority(v === "all" ? "" : (v as SupportTicketPriority))}
        >
          <SelectTrigger className="w-48"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as prioridades</SelectItem>
            {TICKET_PRIORITY_LIST.map((p) => (
              <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum ticket corresponde aos filtros.
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
                    <span className="text-muted-foreground">
                      {TICKET_TYPE_LABEL[t.type as keyof typeof TICKET_TYPE_LABEL] ?? t.type}
                    </span>
                    {t.companies?.name && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                        {t.companies.name}
                      </span>
                    )}
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
    </div>
  );
}