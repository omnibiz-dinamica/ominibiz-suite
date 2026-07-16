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
import { MessageCircle, X } from "lucide-react";
import {
  PRIORITY_ORDER,
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_LIST,
  TICKET_PRIORITY_TONE,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_LIST,
  TICKET_STATUS_TONE,
  TICKET_TYPE_LABEL,
  TICKET_TYPE_LIST,
  type SupportTicketType,
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
  type: SupportTicketType;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  title: string;
  description: string;
  module: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  companies: { name: string } | null;
};

function SupportAdminPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"" | SupportTicketStatus>("");
  const [priority, setPriority] = useState<"" | SupportTicketPriority>("");
  const [type, setType] = useState<"" | SupportTicketType>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [q, setQ] = useState("");

  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ["support-tickets", "admin-global", status, priority, type, companyId, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from("support_tickets")
        .select(
          "id, ticket_number, company_id, type, priority, status, title, description, module, first_response_at, resolved_at, created_at, updated_at, companies(name)",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (status) query = query.eq("status", status);
      if (priority) query = query.eq("priority", priority);
      if (type) query = query.eq("type", type);
      if (companyId) query = query.eq("company_id", companyId);
      if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
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

  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data) if (r.companies?.name) map.set(r.company_id, r.companies.name);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = useMemo(() => {
    const arr = q.trim()
      ? data.filter((t) => {
          const lower = q.trim().toLowerCase();
          return (
            t.title.toLowerCase().includes(lower) ||
            t.ticket_number.toLowerCase().includes(lower) ||
            (t.description?.toLowerCase().includes(lower) ?? false) ||
            (t.companies?.name?.toLowerCase().includes(lower) ?? false)
          );
        })
      : data;

    // Ordenação: urgente → alta → normal → baixa; dentro, mais antigas primeiro (FIFO operacional).
    return [...arr].sort((a, b) => {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      const openA = ["aberto", "em_analise", "em_desenvolvimento", "em_validacao"].includes(a.status) ? 0 : 1;
      const openB = ["aberto", "em_analise", "em_desenvolvimento", "em_validacao"].includes(b.status) ? 0 : 1;
      if (openA !== openB) return openA - openB;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [data, q]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const abertos = data.filter((t) => t.status === "aberto").length;
    const urgentes = data.filter((t) => t.priority === "urgente" && !["fechado", "resolvido", "rejeitado"].includes(t.status)).length;
    const emAnalise = data.filter((t) => t.status === "em_analise").length;
    const aguardando = data.filter((t) => t.status === "aguardando_cliente").length;
    const resolvidosHoje = data.filter((t) => t.resolved_at && new Date(t.resolved_at).getTime() >= todayMs).length;
    // Tempo médio de 1ª resposta (min) e resolução (h)
    const respArr = data.filter((t) => t.first_response_at).map((t) => (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()) / 60000);
    const resArr = data.filter((t) => t.resolved_at).map((t) => (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 3600000);
    const avg = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    // Top empresas / módulos
    const empresas = new Map<string, number>();
    const modulos = new Map<string, number>();
    for (const t of data) {
      const name = t.companies?.name ?? "—";
      empresas.set(name, (empresas.get(name) ?? 0) + 1);
      const m = t.module ?? "—";
      modulos.set(m, (modulos.get(m) ?? 0) + 1);
    }
    const topBy = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      total: data.length, abertos, urgentes, emAnalise, aguardando, resolvidosHoje,
      avgResp: avg(respArr), avgRes: avg(resArr),
      topEmpresas: topBy(empresas), topModulos: topBy(modulos), _now: now,
    };
  }, [data]);

  function clearFilters() {
    setStatus(""); setPriority(""); setType(""); setCompanyId(""); setDateFrom(""); setDateTo(""); setQ("");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Central Global de Suporte
          </h1>
          <p className="text-sm text-muted-foreground">
            Todos os tickets de todas as empresas. Ordenação: urgente → alta → normal → baixa, mais antigos primeiro.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/app/suporte">Voltar à Central</Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total", value: kpis.total, filter: () => clearFilters() },
          { label: "Abertos", value: kpis.abertos, filter: () => setStatus("aberto") },
          { label: "Urgentes", value: kpis.urgentes, tone: "text-red-600 dark:text-red-400", filter: () => setPriority("urgente") },
          { label: "Em análise", value: kpis.emAnalise, filter: () => setStatus("em_analise") },
          { label: "Aguardando cliente", value: kpis.aguardando, filter: () => setStatus("aguardando_cliente") },
          { label: "Resolvidos hoje", value: kpis.resolvidosHoje, filter: () => setStatus("resolvido") },
        ].map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={k.filter}
            className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50"
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={"mt-1 text-2xl font-semibold " + ((k as any).tone ?? "")}>{k.value}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="text-muted-foreground">1ª resposta (média)</div>
          <div className="mt-1 text-lg font-semibold">
            {kpis.avgResp > 0 ? `${kpis.avgResp.toFixed(0)} min` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="text-muted-foreground">Resolução (média)</div>
          <div className="mt-1 text-lg font-semibold">
            {kpis.avgRes > 0 ? `${kpis.avgRes.toFixed(1)} h` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="text-muted-foreground">Top empresas</div>
          <ul className="mt-1 space-y-0.5">
            {kpis.topEmpresas.length === 0 ? <li className="text-muted-foreground">—</li> :
              kpis.topEmpresas.map(([name, n]) => (
                <li key={name} className="flex justify-between gap-2">
                  <span className="truncate">{name}</span>
                  <span className="font-mono text-muted-foreground">{n}</span>
                </li>
              ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="text-muted-foreground">Top módulos</div>
          <ul className="mt-1 space-y-0.5">
            {kpis.topModulos.length === 0 ? <li className="text-muted-foreground">—</li> :
              kpis.topModulos.map(([name, n]) => (
                <li key={name} className="flex justify-between gap-2">
                  <span className="truncate">{name}</span>
                  <span className="font-mono text-muted-foreground">{n}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número, título, descrição ou empresa"
          className="max-w-md"
        />
        <Select
          value={status || "all"}
          onValueChange={(v) => setStatus(v === "all" ? "" : (v as SupportTicketStatus))}
        >
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
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
        <Select
          value={type || "all"}
          onValueChange={(v) => setType(v === "all" ? "" : (v as SupportTicketType))}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TICKET_TYPE_LIST.map((t) => (
              <SelectItem key={t} value={t}>{TICKET_TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={companyId || "all"} onValueChange={(v) => setCompanyId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companyOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-40"
          aria-label="Data inicial"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-40"
          aria-label="Data final"
        />
        {(status || priority || type || companyId || dateFrom || dateTo || q) && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum ticket corresponde aos filtros.
        </div>
      ) : (
        <ul className="space-y-2">
          <li className="px-1 text-xs text-muted-foreground">
            {filtered.length} ticket{filtered.length !== 1 ? "s" : ""} · ordenados por prioridade e antiguidade
          </li>
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
                  <span title={`Criado ${new Date(t.created_at).toLocaleString("pt-PT")}`}>
                    {new Date(t.updated_at).toLocaleString("pt-PT")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}