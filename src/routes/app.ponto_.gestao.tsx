import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Filter, MoreHorizontal, Pencil, History, ChevronLeft, ChevronRight, X, FileSpreadsheet, FileDown, MapPin } from "lucide-react";
import { PunchEditorDrawer } from "@/components/ponto/PunchEditorDrawer";
import { PunchAuditDrawer } from "@/components/ponto/PunchAuditDrawer";
import { PunchGeoDrawer } from "@/components/ponto/PunchGeoDrawer";
import { ORIGIN_LABEL, ORIGIN_TONE, type AdminTimeEntry } from "@/lib/punch-admin";
import { formatDuration } from "@/lib/tasks";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/exports";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ponto_/gestao")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["manager", "super_admin"]}>
      <GestaoPonto />
    </RoleGuard>
  );
}

type StatusFilter = "all" | "open" | "closed";
const PAGE_SIZE = 50;

interface Filters {
  userId: string;
  clientId: string;
  taskSearch: string;
  status: StatusFilter;
  from: string; // YYYY-MM-DD
  to: string;
}

const emptyFilters: Filters = {
  userId: "all",
  clientId: "all",
  taskSearch: "",
  status: "all",
  from: "",
  to: "",
};

type Row = AdminTimeEntry & {
  tasks: { title: string; client_id: string | null } | null;
  profiles: { full_name: string | null } | null;
};

function GestaoPonto() {
  const { currentCompanyId } = useAuth();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [activeEntry, setActiveEntry] = useState<Row | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntryId, setAuditEntryId] = useState<string | null>(null);
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoEntry, setGeoEntry] = useState<Row | null>(null);

  // Membros
  const { data: members } = useQuery({
    queryKey: ["punch-admin-members-filter", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles!inner(full_name)")
        .eq("company_id", currentCompanyId!);
      if (error) throw error;
      const seen = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[])
        .filter((r) => { if (seen.has(r.user_id)) return false; seen.add(r.user_id); return true; })
        .map((r) => ({ id: r.user_id as string, name: (r.profiles?.full_name as string) ?? r.user_id }));
    },
  });

  // Clientes
  const { data: clients } = useQuery({
    queryKey: ["punch-admin-clients-filter", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("company_id", currentCompanyId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // Lista paginada
  const { data: result, isLoading } = useQuery({
    queryKey: ["punch-admin-list", currentCompanyId, filters, page],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("time_entries")
        .select(
          "id, company_id, task_id, user_id, started_at, ended_at, paused_at, resumed_at, effective_minutes, notes, created_at, updated_at, origin, created_by, last_edited_by, last_edited_at, last_edit_reason, tasks!inner(title, client_id), profiles!inner(full_name)",
          { count: "exact" },
        )
        .eq("company_id", currentCompanyId!)
        .order("started_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filters.userId !== "all") q = q.eq("user_id", filters.userId);
      if (filters.status === "open") q = q.is("ended_at", null);
      if (filters.status === "closed") q = q.not("ended_at", "is", null);
      if (filters.from) q = q.gte("started_at", new Date(filters.from + "T00:00:00").toISOString());
      if (filters.to) q = q.lte("started_at", new Date(filters.to + "T23:59:59").toISOString());
      if (filters.clientId !== "all") q = q.eq("tasks.client_id", filters.clientId);
      if (filters.taskSearch.trim()) q = q.ilike("tasks.title", `%${filters.taskSearch.trim()}%`);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
    },
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE)), [result?.total]);
  const clientsMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of clients ?? []) m[c.id] = c.name;
    return m;
  }, [clients]);

  const resetFilters = () => { setFilters(emptyFilters); setPage(0); };
  const onFilterChange = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(0);
  };

  const openCreate = () => { setEditorMode("create"); setActiveEntry(null); setEditorOpen(true); };
  const openEdit = (r: Row) => { setEditorMode("edit"); setActiveEntry(r); setEditorOpen(true); };
  const openAudit = (r: Row) => { setAuditEntryId(r.id); setAuditOpen(true); };
  const openGeo = (r: Row) => { setGeoEntry(r); setGeoOpen(true); };

  const { data: company } = useQuery({
    queryKey: ["company-branding", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, primary_color")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      return data;
    },
  });

  const fmtDT = (s: string | null) => (s ? new Date(s).toLocaleString("pt-PT") : "");

  const exportColumns = (): ExportColumn<Row>[] => [
    { header: "Funcionário", accessor: (r) => r.profiles?.full_name ?? "" },
    { header: "Tarefa", accessor: (r) => r.tasks?.title ?? "" },
    { header: "Cliente", accessor: (r) => (r.tasks?.client_id ? clientsMap[r.tasks.client_id] ?? "" : "") },
    { header: "Início", accessor: (r) => fmtDT(r.started_at) },
    { header: "Fim", accessor: (r) => fmtDT(r.ended_at) },
    { header: "Efetivo", accessor: (r) => (r.effective_minutes != null ? formatDuration(r.effective_minutes) : "") },
    { header: "Origem", accessor: (r) => ORIGIN_LABEL[r.origin] ?? r.origin },
    { header: "Notas", accessor: (r) => r.notes ?? "" },
  ];

  const fetchAllForExport = async (): Promise<Row[]> => {
    let q = supabase
      .from("time_entries")
      .select(
        "id, company_id, task_id, user_id, started_at, ended_at, paused_at, resumed_at, effective_minutes, notes, created_at, updated_at, origin, created_by, last_edited_by, last_edited_at, last_edit_reason, tasks!inner(title, client_id), profiles!inner(full_name)",
      )
      .eq("company_id", currentCompanyId!)
      .order("started_at", { ascending: false })
      .limit(5000);
    if (filters.userId !== "all") q = q.eq("user_id", filters.userId);
    if (filters.status === "open") q = q.is("ended_at", null);
    if (filters.status === "closed") q = q.not("ended_at", "is", null);
    if (filters.from) q = q.gte("started_at", new Date(filters.from + "T00:00:00").toISOString());
    if (filters.to) q = q.lte("started_at", new Date(filters.to + "T23:59:59").toISOString());
    if (filters.clientId !== "all") q = q.eq("tasks.client_id", filters.clientId);
    if (filters.taskSearch.trim()) q = q.ilike("tasks.title", `%${filters.taskSearch.trim()}%`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  };

  const handleExport = async (kind: "xlsx" | "pdf") => {
    try {
      const rows = await fetchAllForExport();
      if (rows.length === 0) {
        toast.info("Nenhum registo para exportar.");
        return;
      }
      const subtitleParts: string[] = [];
      if (filters.from) subtitleParts.push(`De ${filters.from}`);
      if (filters.to) subtitleParts.push(`Até ${filters.to}`);
      if (filters.userId !== "all") {
        const m = members?.find((mm) => mm.id === filters.userId);
        if (m) subtitleParts.push(`Funcionário: ${m.name}`);
      }
      const meta = {
        fileName: `folha-ponto-${new Date().toISOString().slice(0, 10)}`,
        title: "Folha de Ponto",
        companyName: company?.name ?? null,
        primaryColor: (company as { primary_color?: string | null } | null | undefined)?.primary_color ?? null,
        subtitle: subtitleParts.join(" · ") || `${rows.length} registo(s)`,
      };
      if (kind === "xlsx") exportToExcel(rows, exportColumns(), meta);
      else exportToPdf(rows, exportColumns(), meta);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!currentCompanyId) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Selecione uma empresa para gerenciar folha de ponto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Folha de Ponto · Gestão</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão completa, correções auditadas e inclusão de pontos perdidos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <FileDown className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar ponto
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4" /> Filtros
          {(filters.userId !== "all" || filters.clientId !== "all" || filters.taskSearch || filters.status !== "all" || filters.from || filters.to) && (
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={resetFilters}>
              <X className="mr-1 h-3 w-3" /> Limpar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <Label className="text-xs">Funcionário</Label>
            <EmployeePicker
              employees={(members ?? []).map((m) => ({ id: m.id, full_name: m.name }))}
              value={filters.userId === "all" ? null : filters.userId}
              onChange={(id: string) => onFilterChange("userId", id || "all")}
              placeholder="Todos"
              ariaLabel="Filtrar por funcionário"
            />
          </div>
          <div>
            <Label className="text-xs">Cliente</Label>
            <Select value={filters.clientId} onValueChange={(v) => onFilterChange("clientId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filters.status} onValueChange={(v) => onFilterChange("status", v as StatusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Em aberto</SelectItem>
                <SelectItem value="closed">Encerrado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={filters.from} onChange={(e) => onFilterChange("from", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={filters.to} onChange={(e) => onFilterChange("to", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Buscar tarefa</Label>
            <Input placeholder="Título da tarefa" value={filters.taskSearch} onChange={(e) => onFilterChange("taskSearch", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Tabela */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span>{result?.total ?? 0} registro(s)</span>
          <span>{PAGE_SIZE} por página</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Tarefa</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead className="text-right">Efetivo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Carregando...</TableCell></TableRow>
              )}
              {!isLoading && (result?.rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Nenhum registro encontrado.</TableCell></TableRow>
              )}
              {(result?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.profiles?.full_name ?? r.user_id.slice(0, 8)}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{r.tasks?.title ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.tasks?.client_id ? clientsMap[r.tasks.client_id] ?? "—" : "—"}</TableCell>
                  <TableCell className="text-sm">{new Date(r.started_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">
                    {r.ended_at ? new Date(r.ended_at).toLocaleString() : <span className="text-warning">em aberto</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.effective_minutes != null ? formatDuration(r.effective_minutes) : "—"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${ORIGIN_TONE[r.origin]}`}>
                      {ORIGIN_LABEL[r.origin]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(r)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAudit(r)}>
                          <History className="mr-2 h-4 w-4" /> Histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openGeo(r)}>
                          <MapPin className="mr-2 h-4 w-4" /> Geolocalização
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </section>

      <PunchEditorDrawer
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        companyId={currentCompanyId}
        entry={activeEntry}
        entryTaskTitle={activeEntry?.tasks?.title ?? undefined}
        entryUserName={activeEntry?.profiles?.full_name ?? undefined}
      />
      <PunchAuditDrawer
        open={auditOpen}
        onOpenChange={setAuditOpen}
        timeEntryId={auditEntryId}
      />
      <PunchGeoDrawer
        open={geoOpen}
        onOpenChange={setGeoOpen}
        timeEntryId={geoEntry?.id ?? null}
        entryLabel={{
          user: geoEntry?.profiles?.full_name ?? null,
          task: geoEntry?.tasks?.title ?? null,
          client: geoEntry?.tasks?.client_id ? clientsMap[geoEntry.tasks.client_id] ?? null : null,
        }}
      />
    </div>
  );
}