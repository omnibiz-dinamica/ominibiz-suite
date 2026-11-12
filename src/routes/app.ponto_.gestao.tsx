import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarCheck,
  Plus,
  Filter,
  MoreHorizontal,
  Pencil,
  History,
  ChevronLeft,
  ChevronRight,
  X,
  FileSpreadsheet,
  FileDown,
  MapPin,
  RotateCcw,
  ClockPlus,
  AlertCircle,
  Plane,
  UserX,
} from "lucide-react";
import { PunchEditorDrawer } from "@/components/ponto/PunchEditorDrawer";
import { PunchAuditDrawer } from "@/components/ponto/PunchAuditDrawer";
import { PunchGeoDrawer } from "@/components/ponto/PunchGeoDrawer";
import { TaskAbsenceAuditDrawer } from "@/components/ponto/TaskAbsenceAuditDrawer";
import { MarkAbsentDialog } from "@/components/tasks/MarkAbsentDialog";
import { OpenPunchPanel } from "@/components/ponto/OpenPunchPanel";
import {
  listOperationalPunches,
  ORIGIN_LABEL,
  ORIGIN_TONE,
  punchAdminVoidForRedo,
  type OperationalPunchRow,
} from "@/lib/punch-admin";
import { formatPauseList, type TimeEntryPauseRow } from "@/lib/punch/pause";
import {
  formatDuration,
  formatStartedLateMinutes,
  pauseMinutesNow,
  resolveOperationalStatus,
  startedLateMinutes,
  type TaskRow,
  type TaskStatus,
} from "@/lib/tasks";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";
import { isEmployeeActive } from "@/lib/employee-status";
import { classifyEventStatus, type GeoPointRow } from "@/lib/punch/geo-view";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/exports";
import { toast } from "sonner";
import { RecordHistoryMenu } from "@/components/history/RecordHistoryMenu";
import { formatCivilDate, type TaskOperationalNote } from "@/lib/ponto/task-notes";
import { fetchOfflineEntryIds } from "@/lib/punch/offline-flags";
import { entryScheduleFlags, fetchEntryTimeZones } from "@/lib/punch/off-schedule";
import { RECONCILIATION_QUERY_KEY, ScheduleReconciliation } from "@/components/ponto/ScheduleReconciliation";
import { addPointDefaults, launchDefaults } from "@/lib/ponto/closing-table";
import { formatInTz, useCompanyTimeZone } from "@/lib/company-time";
import { teamGroups } from "@/lib/teams";
import { monthRange, type ReconciliationRow } from "@/lib/ponto/reconciliation";

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
  /** Ticket 172: equipa (Setor do cadastro); "all" = todas. */
  team: string;
  clientId: string;
  taskSearch: string;
  status: StatusFilter;
  from: string; // YYYY-MM-DD
  to: string;
}

const emptyFilters: Filters = {
  userId: "all",
  team: "all",
  clientId: "all",
  taskSearch: "",
  status: "all",
  from: "",
  to: "",
};

type TaskJoin = {
  title: string;
  client_id: string | null;
  scheduled_for?: string | null;
  scheduled_end?: string | null;
  recurrence_date?: string | null;
  due_at?: string | null;
};

/** Todas as pausas de cada ponto (time_entry_pauses; RLS: gestor da empresa / super admin). */
async function fetchPausesByEntry(ids: string[]): Promise<Map<string, TimeEntryPauseRow[]>> {
  const map = new Map<string, TimeEntryPauseRow[]>();
  if (ids.length === 0) return map;
  const { data, error } = await (supabase.from("time_entry_pauses" as never) as any)
    .select("time_entry_id, paused_at, resumed_at, is_current")
    .in("time_entry_id", ids)
    .order("paused_at", { ascending: true });
  if (error) throw error;
  for (const p of (data ?? []) as TimeEntryPauseRow[]) {
    const list = map.get(p.time_entry_id) ?? [];
    list.push(p);
    map.set(p.time_entry_id, list);
  }
  return map;
}

type Row = OperationalPunchRow & {
  pauses?: TimeEntryPauseRow[];
  tasks: TaskJoin | null;
  geo?: GeoSummary | null;
};

type GeoPoint = {
  time_entry_id: string;
  event_kind: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  geo_status: string;
  reason_code: string | null;
  reason_text: string | null;
  captured_at: string;
};

type GeoSummary = {
  start?: GeoPoint;
  end?: GeoPoint;
};

type DisplayNote = Pick<TaskOperationalNote, "label" | "text" | "createdAt" | "requestedDate" | "needsReassignment">;

function formatNoteTimestamp(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-PT") : "";
}

function formatNoteForExport(note: DisplayNote) {
  const details = [
    note.requestedDate ? `Nova data: ${formatCivilDate(note.requestedDate)}` : "",
    note.needsReassignment !== null && note.needsReassignment !== undefined
      ? `Troca de funcionário: ${note.needsReassignment ? "Sim" : "Não"}`
      : "",
  ].filter(Boolean);
  return `${note.label}: ${note.text}${details.length ? ` (${details.join("; ")})` : ""}`;
}

function TaskNotesCell({ notes }: { notes: DisplayNote[] }) {
  if (notes.length === 0) return <span>—</span>;
  const preview = notes.map((note) => formatNoteForExport(note)).join(" · ");
  const compactPreview = preview.length > 150 ? `${preview.slice(0, 147)}...` : preview;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block max-w-[240px] truncate text-left text-sm text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          aria-label="Ver notas do registro"
        >
          {compactPreview}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))]">
        <div className="space-y-3">
          <p className="text-sm font-semibold">Notas do registro</p>
          {notes.map((note, index) => (
            <div
              key={`${note.label}-${note.createdAt ?? "sem-data"}-${index}`}
              className="border-t border-border pt-3 first:border-t-0 first:pt-0"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{note.label}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{note.text}</p>
              {note.requestedDate && (
                <p className="mt-2 text-xs text-muted-foreground">Nova data: {formatCivilDate(note.requestedDate)}</p>
              )}
              {note.needsReassignment !== null && note.needsReassignment !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Troca de funcionário: {note.needsReassignment ? "Sim" : "Não"}
                </p>
              )}
              {note.createdAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Registrado em: {formatNoteTimestamp(note.createdAt)}
                </p>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const fmtCoord = (p?: GeoPoint) => (p?.lat != null && p.lng != null ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : "");
const fmtMeters = (n: number | null | undefined) => (n != null ? `${Math.round(n)} m` : "");

/** Label humano do status geo, reutilizando a classificação oficial. */
const fmtGeoStatus = (p?: GeoPoint) => {
  if (!p) return "";
  return classifyEventStatus(p as unknown as GeoPointRow).label;
};

const hasWallTime = (iso: string | null | undefined) => !!iso && formatWallTime(iso) !== "00:00";

/** Célula fora do padrão marcado na tarefa: realce vermelho (SUP-2026-000301). */
const offCellClass = (off: boolean | undefined) =>
  off ? "rounded bg-destructive/10 px-1 font-semibold text-destructive" : "";

/**
 * "Previsto" — data + horário planejado da tarefa.
 * Nunca exibe 00:00 como horário: quando não há horário definido,
 * mostra apenas a data com o sufixo "(sem horário)".
 */
function formatPrevisto(t: TaskJoin | null | undefined): string {
  if (!t) return "";
  const base = t.scheduled_for ?? t.recurrence_date ?? t.due_at ?? null;
  if (!base) return "";
  const date = formatWallDate(base);
  if (!hasWallTime(t.scheduled_for)) return `${date} (sem horário)`;
  const start = formatWallTime(t.scheduled_for);
  const end = hasWallTime(t.scheduled_end) ? formatWallTime(t.scheduled_end) : null;
  return end ? `${date} ${start}–${end}` : `${date} ${start}`;
}

/** "YYYY-MM-DD" do instante no fuso do aparelho (dia de uma linha de férias). */
function localDayKey(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const ok = Number.isFinite(d.getTime()) ? d : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ok.getFullYear()}-${pad(ok.getMonth() + 1)}-${pad(ok.getDate())}`;
}

function GestaoPonto() {
  const nav = useNavigate();
  const companyTz = useCompanyTimeZone();
  const { currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [initialEntryKind, setInitialEntryKind] = useState<"work" | "paid_leave">("work");
  const [activeEntry, setActiveEntry] = useState<Row | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntryId, setAuditEntryId] = useState<string | null>(null);
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoEntry, setGeoEntry] = useState<Row | null>(null);
  const [absenceEditTarget, setAbsenceEditTarget] = useState<TaskRow | null>(null);
  const [taskAuditTarget, setTaskAuditTarget] = useState<Row | null>(null);
  const [manualPointTarget, setManualPointTarget] = useState<Row | null>(null);
  // Ticket 218: "Adicionar ponto" num dia de férias (ponto avulso, sem tarefa).
  const [addPointDay, setAddPointDay] = useState<{ userId: string; date: string } | null>(null);
  const [absenceCreateTarget, setAbsenceCreateTarget] = useState<TaskRow | null>(null);
  // Horário sugerido no editor: tarefa → previsto (recorrência: só a hora do fim);
  // dia de férias → 08:00–12:00 nesse dia.
  const manualPlan = manualPointTarget
    ? launchDefaults(manualPointTarget.tasks?.scheduled_for, manualPointTarget.tasks?.scheduled_end)
    : addPointDay
      ? (() => {
          const d = addPointDefaults(addPointDay.date);
          return { startedAt: d.startedAt, endedAt: d.endedAt };
        })()
      : { startedAt: null, endedAt: null };
  // Conferência Previsto x Real (pedido da gestora V-Clean, 09/11/2026)
  const [view, setView] = useState<"lancamentos" | "conferencia">("lancamentos");
  const [confFilters, setConfFilters] = useState(() => {
    const now = new Date();
    return { userId: "", ...monthRange(now.getFullYear(), now.getMonth() + 1) };
  });

  // Membros — tela histórica: inclui inativos (com selo) para filtrar e
  // nomear registros de quem saiu no meio do mês. Novas atribuições em
  // outras telas continuam usando company_active_member_options (só ativos).
  const { data: members } = useQuery({
    queryKey: ["punch-admin-members-filter", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", currentCompanyId!);
      if (rolesErr) throw rolesErr;
      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      if (ids.length === 0)
        return [] as {
          id: string;
          name: string;
          inactive: boolean;
          sector: string | null;
          team_number: number | null;
        }[];
      const { data: profs, error: profsErr } = await (supabase.from("profiles" as never) as any)
        .select("id, full_name, is_active, status, termination_date, sector, team_number")
        .in("id", ids);
      if (profsErr) throw profsErr;
      return (
        (profs ?? []) as {
          id: string;
          full_name: string | null;
          is_active: boolean | null;
          status: string | null;
          termination_date: string | null;
          sector?: string | null;
          team_number?: number | null;
        }[]
      )
        .map((p) => ({
          id: p.id,
          name: p.full_name ?? p.id,
          inactive: !isEmployeeActive(p),
          sector: p.sector ?? null,
          team_number: p.team_number ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
  });
  const memberDisplayName = (id: string | null | undefined) => {
    if (!id) return undefined;
    const m = members?.find((mm) => mm.id === id);
    return m ? (m.inactive ? `${m.name} (Inativo)` : m.name) : undefined;
  };

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

  // Ticket 172: setores (nome) e equipas (número) do cadastro.
  const teams = useMemo(() => teamGroups(members ?? []), [members]);
  const teamIds = useMemo(() => {
    if (filters.userId !== "all") return [];
    return teams.find((t) => t.key === filters.team)?.ids ?? [];
  }, [teams, filters.team, filters.userId]);

  // Feed canónico: pontos reais e faltas sem criar time_entry artificial.
  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["punch-admin-list", currentCompanyId, filters, page, teamIds.join(",")],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      // Ticket 172: filtro por equipa — o servidor filtra um funcionário de cada vez,
      // por isso lê o período todo e filtra/pagina aqui (máx. 5000 registos).
      if (teamIds.length > 0) {
        const all = await listOperationalPunches({
          companyId: currentCompanyId!,
          employeeId: null,
          clientId: filters.clientId === "all" ? null : filters.clientId,
          taskSearch: filters.taskSearch,
          status: filters.status,
          fromTs: filters.from ? new Date(filters.from + "T00:00:00").toISOString() : null,
          toTs: filters.to ? new Date(filters.to + "T23:59:59").toISOString() : null,
          fromDate: filters.from || null,
          toDate: filters.to || null,
          limit: 5000,
          offset: 0,
        });
        const set = new Set(teamIds);
        const rows = all.rows.filter((r) => set.has(r.user_id));
        return { ...all, rows: rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), total: rows.length };
      }
      return listOperationalPunches({
        companyId: currentCompanyId!,
        employeeId: filters.userId === "all" ? null : filters.userId,
        clientId: filters.clientId === "all" ? null : filters.clientId,
        taskSearch: filters.taskSearch,
        status: filters.status,
        fromTs: filters.from ? new Date(filters.from + "T00:00:00").toISOString() : null,
        toTs: filters.to ? new Date(filters.to + "T23:59:59").toISOString() : null,
        fromDate: filters.from || null,
        toDate: filters.to || null,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
    },
  });

  const pauseEntryIds = useMemo(() => (result?.rows ?? []).map((r) => r.id), [result?.rows]);
  const { data: pausesByEntry } = useQuery({
    // A chave muda quando a pausa atual/efetivo de algum ponto da página muda -> recarrega as pausas.
    queryKey: [
      "punch-admin-pauses",
      currentCompanyId,
      (result?.rows ?? [])
        .map((r) => `${r.id}|${r.paused_at ?? ""}|${r.resumed_at ?? ""}|${r.effective_minutes ?? ""}`)
        .join(","),
    ],
    enabled: !!currentCompanyId && pauseEntryIds.length > 0,
    queryFn: () => fetchPausesByEntry(pauseEntryIds),
  });

  // Ponto offline: que pontos desta página foram feitos sem rede (selo "Offline").
  const { data: offlineIds } = useQuery({
    queryKey: ["punch-admin-offline", currentCompanyId, pauseEntryIds.join(",")],
    enabled: !!currentCompanyId && pauseEntryIds.length > 0,
    queryFn: () => fetchOfflineEntryIds(pauseEntryIds),
  });

  // Fora do padrão (vermelho): fuso do telemóvel na marcação de cada ponto desta página.
  const { data: entryTimeZones } = useQuery({
    queryKey: ["punch-admin-tz", currentCompanyId, pauseEntryIds.join(",")],
    enabled: !!currentCompanyId && pauseEntryIds.length > 0,
    queryFn: () => fetchEntryTimeZones(pauseEntryIds),
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE)), [result?.total]);
  const clientsMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of clients ?? []) m[c.id] = c.name;
    return m;
  }, [clients]);

  // Fora do padrão (vermelho): mesma regra da folha de ponto, por ponto desta página.
  const offByRow = useMemo(() => {
    const m = new Map<string, ReturnType<typeof entryScheduleFlags>>();
    // Ausência/férias/tarefa operacional não mostram horas, por isso a marca não aparece.
    for (const r of result?.rows ?? []) {
      m.set(
        r.id,
        entryScheduleFlags({
          started_at: r.started_at,
          ended_at: r.ended_at,
          effective_minutes: r.effective_minutes,
          scheduled_for: r.tasks?.scheduled_for,
          scheduled_end: r.tasks?.scheduled_end,
          clientName: r.tasks?.client_id ? clientsMap[r.tasks.client_id] : null,
          timeZone: entryTimeZones?.get(r.id),
        }),
      );
    }
    return m;
  }, [result?.rows, clientsMap, entryTimeZones]);

  const resetFilters = () => {
    setFilters(emptyFilters);
    setPage(0);
  };
  const onFilterChange = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(0);
  };

  const openCreate = (entryKind: "work" | "paid_leave" = "work") => {
    setEditorMode("create");
    setInitialEntryKind(entryKind);
    setActiveEntry(null);
    setManualPointTarget(null);
    setAddPointDay(null);
    setEditorOpen(true);
  };

  // Férias aprovadas/canceladas entram no feed sem que o gestor precise alterar a folha manualmente.
  useEffect(() => {
    if (!currentCompanyId) return;
    const channel = supabase
      .channel(`company:${currentCompanyId}:ponto-gestao-vacations`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vacation_requests", filter: `company_id=eq.${currentCompanyId}` },
        () => qc.invalidateQueries({ queryKey: ["punch-admin-list"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentCompanyId, qc]);
  const openEdit = (r: Row) => {
    setEditorMode("edit");
    setInitialEntryKind("work");
    setActiveEntry(r);
    setManualPointTarget(null);
    setEditorOpen(true);
  };
  const openManualPoint = (r: Row) => {
    setEditorMode("create");
    setInitialEntryKind("work");
    setActiveEntry(null);
    setAddPointDay(null);
    setManualPointTarget(r);
    setEditorOpen(true);
  };
  // Ticket 218: dia de férias → ponto avulso nesse dia (nunca passa o id das férias como tarefa).
  const openVacationAddPoint = (r: Row) => {
    setEditorMode("create");
    setInitialEntryKind("work");
    setActiveEntry(null);
    setManualPointTarget(null);
    setAddPointDay({ userId: r.user_id, date: localDayKey(r.started_at) });
    setEditorOpen(true);
  };
  // Ticket 218: "Marcar falta" numa tarefa pendente/atrasada (o banco valida prazo e ponto aberto).
  const openAbsenceCreate = (r: Row) => {
    if (!r.task_id) return;
    setAbsenceCreateTarget({
      id: r.task_id,
      company_id: r.company_id,
      title: r.tasks?.title ?? "Tarefa",
      description: null,
      status: "pendente",
      priority: "media",
      assigned_to: r.user_id,
      created_by: r.created_by ?? r.user_id,
      client_id: r.tasks?.client_id ?? null,
      scheduled_for: r.tasks?.scheduled_for ?? null,
      scheduled_end: r.tasks?.scheduled_end ?? null,
      due_at: r.tasks?.due_at ?? null,
    } as unknown as TaskRow);
  };
  // Conferência: "Alterar" abre o mesmo editor do ponto; "Lançar ponto" a regularização da tarefa.
  const confEmployeeName = (id: string) => members?.find((m) => m.id === id)?.name ?? null;
  const openConfEdit = async (row: ReconciliationRow) => {
    if (!row.time_entry_id) return;
    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .eq("id", row.time_entry_id)
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message ?? "Ponto não encontrado");
      return;
    }
    openEdit({
      ...(data as object),
      tasks: row.task_id ? { title: row.task_title ?? "Tarefa", client_id: null } : null,
      profiles: { full_name: confEmployeeName(confFilters.userId) },
    } as unknown as Row);
  };
  const openConfLaunch = (row: ReconciliationRow) => {
    if (!row.task_id) return;
    // Recorrência: scheduled_end é o fim da série; usa-se só a hora no dia da ocorrência.
    const plan = launchDefaults(row.scheduled_for, row.scheduled_end);
    openManualPoint({
      id: row.task_id,
      company_id: currentCompanyId,
      user_id: confFilters.userId,
      task_id: row.task_id,
      tasks: {
        title: row.task_title ?? "Tarefa",
        client_id: null,
        scheduled_for: plan.startedAt,
        scheduled_end: plan.endedAt,
      },
      profiles: { full_name: confEmployeeName(confFilters.userId) },
    } as unknown as Row);
  };
  const openAudit = (r: Row) => {
    setAuditEntryId(r.id);
    setAuditOpen(true);
  };
  const openGeo = (r: Row) => {
    setGeoEntry(r);
    setGeoOpen(true);
  };
  const openAbsenceEdit = (r: Row) => {
    setAbsenceEditTarget({
      id: r.task_id ?? r.id,
      company_id: r.company_id,
      title: r.tasks?.title ?? "Tarefa",
      description: null,
      status: "ausente",
      priority: "media",
      assigned_to: r.user_id,
      created_by: r.created_by ?? r.user_id,
      client_id: r.tasks?.client_id ?? null,
      scheduled_for: r.tasks?.scheduled_for ?? null,
      scheduled_end: r.tasks?.scheduled_end ?? null,
      due_at: r.tasks?.due_at ?? null,
      started_at: null,
      completed_at: null,
      authorized_at: null,
      cancelled_at: null,
      marked_absent_at: r.created_at,
      marked_absent_by: r.created_by,
      absence_reason: r.absence_reason,
      absence_justified: r.absence_justified,
      absence_source: r.absence_source,
      absence_grace_minutes: 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      recurrence_date: r.tasks?.recurrence_date ?? null,
    });
  };
  const openTaskAudit = (r: Row) => setTaskAuditTarget(r);

  const voidMut = useMutation({
    mutationFn: async ({ id, reason, row }: { id: string; reason: string; row: Row }) => {
      const res = await punchAdminVoidForRedo(id, reason);
      // Notificação não bloqueante para o funcionário.
      if (row.task_id) {
        try {
          const { error } = await supabase.from("notifications" as never).insert({
            company_id: row.company_id,
            user_id: row.user_id,
            task_id: row.task_id,
            event: "task_assigned",
            title: "Ponto devolvido para correção",
            body: reason,
            priority: "alta",
          } as never);
          if (error) console.warn("Falha ao notificar devolução de ponto:", error.message);
        } catch (e) {
          console.warn("Falha ao notificar devolução de ponto:", e);
        }
      }
      return res;
    },
    onSuccess: () => {
      toast.success("Ponto devolvido para refazer");
      qc.invalidateQueries({ queryKey: ["punch-admin-list"] });
      qc.invalidateQueries({ queryKey: ["punch-audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestVoid = (r: Row) => {
    if (r.voided_at) {
      toast.info("Este ponto ja foi anulado.");
      return;
    }
    const reason = window.prompt("Informe o motivo para devolver este ponto ao funcionario refazer:");
    if (!reason) return;
    if (reason.trim().length < 5) {
      toast.error("Informe um motivo com pelo menos 5 caracteres.");
      return;
    }
    voidMut.mutate({ id: r.id, reason: reason.trim(), row: r });
  };

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

  // SUP-323: a mesma regra do Fechamento — fuso do sítio onde o ponto foi batido
  // (telemóvel) e, sem ele, o fuso da empresa. Nunca o fuso do computador de quem vê.
  const rowTz = (r: Row) => entryTimeZones?.get(r.id) ?? companyTz;
  const fmtDT = (r: Row, s: string | null) => (s ? formatInTz(s, rowTz(r)) : "");
  const resolvedTaskStatus = (r: Row) => {
    if (!r.tasks || !r.task_status) return r.operational_status ?? null;
    const status = r.task_status as TaskStatus;
    if (!["pendente", "autorizado", "em_andamento", "concluido", "cancelado", "ausente"].includes(status)) {
      return r.operational_status ?? null;
    }
    return resolveOperationalStatus({
      status,
      scheduled_for: r.tasks.scheduled_for,
      recurrence_date: r.tasks.recurrence_date,
      due_at: r.tasks.due_at,
      absence_source: r.absence_source,
      absence_reason: r.absence_reason,
    });
  };
  // Uma ausência automática antiga pode chegar persistida antes do prazo por
  // causa de uma versão anterior. A lista deve mostrar seu estado canônico.
  const isAbsence = (r: Row) => r.record_kind === "absence" && resolvedTaskStatus(r) === "ausente";
  const isVacation = (r: Row) => r.record_kind === "vacation";
  const isOperationalTask = (r: Row) => r.record_kind === "task" || (r.record_kind === "absence" && !isAbsence(r));
  const isNonWork = (r: Row) => isAbsence(r) || isVacation(r) || isOperationalTask(r);
  const formatSituation = (r: Row) => {
    if (isVacation(r)) return "Férias";
    if (isOperationalTask(r)) {
      const status = resolvedTaskStatus(r);
      if (status === "em_andamento") return "Em andamento";
      if (status === "atrasada") return "Atrasada";
      return "Pendente";
    }
    if (!isAbsence(r))
      return r.entry_kind === "paid_leave"
        ? "Folga remunerada"
        : r.operational_status === "em_andamento"
          ? "Em andamento"
          : "Trabalhado";
    // SUP-158: falta registada como férias
    if (r.absence_reason?.trim() === "Férias") return "Falta · férias";
    return r.absence_justified ? "Falta · justificada" : "Falta · injustificada";
  };
  const formatOrigin = (r: Row) => {
    if (isVacation(r)) return "Férias aprovadas";
    if (isOperationalTask(r)) return "Tarefa operacional";
    if (isAbsence(r)) {
      if (r.absence_origin === "employee") return "Funcionário";
      if (r.absence_origin === "automatic") return "Falta automática";
      if (r.absence_origin === "manager") return "Gestor";
      return "Origem não identificada";
    }
    const label = ORIGIN_LABEL[r.origin] ?? r.origin;
    return offlineIds?.has(r.id) ? `${label} · Offline` : label;
  };
  const getRowNoteItems = (r: Row): DisplayNote[] => {
    const notes: DisplayNote[] = [];
    if (isAbsence(r)) {
      if (r.absence_reason?.trim()) {
        notes.push({
          label: "Motivo da falta",
          text: r.absence_reason.trim(),
          createdAt: r.created_at,
          requestedDate: null,
          needsReassignment: null,
        });
      }
    } else {
      if (r.no_start_reason?.trim()) {
        notes.push({
          label: "Motivo de não início",
          text: r.no_start_reason.trim(),
          createdAt: r.no_start_reason_at ?? null,
          requestedDate: null,
          needsReassignment: null,
        });
      }
      if (r.notes?.trim()) {
        notes.push({
          label: "Nota do ponto",
          text: r.notes.trim(),
          createdAt: r.updated_at,
          requestedDate: null,
          needsReassignment: null,
        });
      }
    }
    return [...notes, ...(r.task_notes ?? [])];
  };
  const formatNotes = (r: Row) => getRowNoteItems(r).map(formatNoteForExport).join(" · ");
  // A data de férias é civil (DATE). Prefira recurrence_date para não converter meia-noite entre fusos.
  const formatVacationDate = (r: Row) =>
    r.tasks?.recurrence_date
      ? formatWallDate(r.tasks.recurrence_date)
      : r.tasks?.scheduled_for
        ? formatWallDate(r.tasks.scheduled_for)
        : "";
  const formatStartDelay = (r: Row) => {
    if (!r.tasks || !r.started_at || isNonWork(r)) return "";
    const minutes = startedLateMinutes({ scheduled_for: r.tasks.scheduled_for, started_at: r.started_at });
    return minutes == null ? "" : `Início com atraso · ${formatStartedLateMinutes(minutes)}`;
  };
  const formatPause = (r: Row) => {
    // Várias pausas por ponto: as anteriores vêm de time_entry_pauses (is_current = false).
    const list = r.pauses ?? pausesByEntry?.get(r.id) ?? [];
    const priorSec = list
      .filter((p) => !p.is_current && p.resumed_at)
      .reduce(
        (acc, p) =>
          acc + Math.max(0, Math.round((new Date(p.resumed_at!).getTime() - new Date(p.paused_at).getTime()) / 1000)),
        0,
      );
    const minutes = pauseMinutesNow({ ...r, prior_pause_seconds: priorSec });
    if (minutes == null) return "—";
    const base = r.paused_at && !r.resumed_at && !r.ended_at ? "Em pausa" : formatDuration(minutes);
    return list.length > 1 ? `${base} · ${list.length} pausas (${formatPauseList(list)})` : base;
  };

  const exportColumns = (): ExportColumn<Row>[] => [
    { header: "Funcionário", accessor: (r) => r.profiles?.full_name ?? "" },
    {
      header: "Tarefa",
      accessor: (r) =>
        isVacation(r) ? "Férias" : r.entry_kind === "paid_leave" ? "Folga remunerada" : (r.tasks?.title ?? ""),
    },
    { header: "Cliente", accessor: (r) => (r.tasks?.client_id ? (clientsMap[r.tasks.client_id] ?? "") : "") },
    { header: "Previsto", accessor: (r) => (isVacation(r) ? formatVacationDate(r) : formatPrevisto(r.tasks)) },
    { header: "Situação", accessor: (r) => formatSituation(r) },
    { header: "Início", accessor: (r) => (isNonWork(r) ? "" : fmtDT(r, r.started_at)) },
    { header: "Fim", accessor: (r) => (isNonWork(r) ? "" : fmtDT(r, r.ended_at)) },
    {
      header: "Efetivo",
      accessor: (r) => (isNonWork(r) ? "" : r.effective_minutes != null ? formatDuration(r.effective_minutes) : ""),
    },
    { header: "Pausa", accessor: (r) => formatPause(r) },
    { header: "Origem", accessor: (r) => formatOrigin(r) },
    { header: "Notas", accessor: (r) => [formatStartDelay(r), formatNotes(r)].filter(Boolean).join(" · ") },
    { header: "Geo entrada", accessor: (r) => fmtCoord(r.geo?.start) },
    { header: "Geo saída", accessor: (r) => fmtCoord(r.geo?.end) },
    { header: "Status geo entrada", accessor: (r) => fmtGeoStatus(r.geo?.start) },
    { header: "Status geo saída", accessor: (r) => fmtGeoStatus(r.geo?.end) },
    { header: "Distância entrada", accessor: (r) => fmtMeters(r.geo?.start?.distance_m) },
    { header: "Distância saída", accessor: (r) => fmtMeters(r.geo?.end?.distance_m) },
    {
      header: "Justificativa geo",
      accessor: (r) => [r.geo?.start?.reason_text, r.geo?.end?.reason_text].filter(Boolean).join(" | "),
    },
  ];

  const fetchAllForExport = async (): Promise<Row[]> => {
    const { rows: fetched } = await listOperationalPunches({
      companyId: currentCompanyId!,
      employeeId: filters.userId === "all" ? null : filters.userId,
      clientId: filters.clientId === "all" ? null : filters.clientId,
      taskSearch: filters.taskSearch,
      status: filters.status,
      fromTs: filters.from ? new Date(filters.from + "T00:00:00").toISOString() : null,
      toTs: filters.to ? new Date(filters.to + "T23:59:59").toISOString() : null,
      fromDate: filters.from || null,
      toDate: filters.to || null,
      limit: 5000,
      offset: 0,
    });
    const teamSet = teamIds.length > 0 ? new Set(teamIds) : null;
    const rows = teamSet ? fetched.filter((r) => teamSet.has(r.user_id)) : fetched;
    const realRows = rows.filter((r) => !isNonWork(r));
    const ids = realRows.map((r) => r.id);
    if (ids.length === 0) return rows;

    const { data: geoRows, error: geoError } = await supabase
      .from("time_entry_geopoints")
      .select(
        "time_entry_id, event_kind, lat, lng, accuracy_m, distance_m, geo_status, reason_code, reason_text, captured_at",
      )
      .in("time_entry_id", ids)
      .order("captured_at", { ascending: true });
    if (geoError) throw geoError;

    const geoByEntry = new Map<string, GeoSummary>();
    for (const p of (geoRows ?? []) as unknown as GeoPoint[]) {
      const summary = geoByEntry.get(p.time_entry_id) ?? {};
      if (p.event_kind === "start") summary.start = p;
      if (p.event_kind === "end") summary.end = p;
      geoByEntry.set(p.time_entry_id, summary);
    }

    const pausesAll = await fetchPausesByEntry(ids);
    return rows.map((r) => ({
      ...r,
      geo: isNonWork(r) ? null : (geoByEntry.get(r.id) ?? null),
      pauses: pausesAll.get(r.id) ?? [],
    }));
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
        const name = memberDisplayName(filters.userId);
        if (name) subtitleParts.push(`Funcionário: ${name}`);
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
          <Button variant="outline" onClick={() => openCreate("paid_leave")}>
            <CalendarCheck className="mr-1 h-4 w-4" /> Folga remunerada
          </Button>
          <Button onClick={() => openCreate("work")}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar ponto
          </Button>
        </div>
      </div>

      <div
        className="inline-flex rounded-xl border border-border bg-card p-1"
        role="tablist"
        aria-label="Vista"
      >
        {(
          [
            ["lancamentos", "Lançamentos"],
            ["conferencia", "Conferência Previsto x Real"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              view === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "conferencia" && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Funcionário</Label>
              <EmployeePicker
                employees={(members ?? []).map((m) => ({
                  id: m.id,
                  full_name: m.inactive ? `${m.name} (Inativo)` : m.name,
                }))}
                value={confFilters.userId || null}
                onChange={(id: string) => setConfFilters((f) => ({ ...f, userId: id || "" }))}
                placeholder="Escolha o funcionário"
                ariaLabel="Funcionário da conferência"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="conf-from">
                De
              </Label>
              <Input
                id="conf-from"
                type="date"
                value={confFilters.from}
                onChange={(e) =>
                  e.target.value && setConfFilters((f) => ({ ...f, from: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="conf-to">
                Até
              </Label>
              <Input
                id="conf-to"
                type="date"
                value={confFilters.to}
                onChange={(e) =>
                  e.target.value && setConfFilters((f) => ({ ...f, to: e.target.value }))
                }
              />
            </div>
          </div>
          <ScheduleReconciliation
            companyId={currentCompanyId}
            employeeId={confFilters.userId || null}
            from={confFilters.from}
            to={confFilters.to}
            onEdit={(row) => void openConfEdit(row)}
            onLaunch={openConfLaunch}
            onChanged={() => qc.invalidateQueries({ queryKey: ["punch-admin-list"] })}
          />
        </section>
      )}

      {/* Lançamentos: pontos em aberto, filtros e lista (escondidos na conferência) */}
      <div className={view === "lancamentos" ? "space-y-5" : "hidden"}>
        {/* Pontos em aberto */}
        <OpenPunchPanel companyId={currentCompanyId} />

        {/* Filtros */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4" /> Filtros
            {(filters.userId !== "all" ||
              filters.clientId !== "all" ||
              filters.taskSearch ||
              filters.status !== "all" ||
              filters.from ||
              filters.to) && (
              <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={resetFilters}>
                <X className="mr-1 h-3 w-3" /> Limpar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <Label className="text-xs">Funcionário</Label>
              <EmployeePicker
                employees={(members ?? []).map((m) => ({
                  id: m.id,
                  full_name: m.inactive ? `${m.name} (Inativo)` : m.name,
                }))}
                value={filters.userId === "all" ? null : filters.userId}
                onChange={(id: string) => onFilterChange("userId", id || "all")}
                placeholder="Todos"
                ariaLabel="Filtrar por funcionário"
              />
            </div>
            <div>
              <Label className="text-xs">Setor / equipa</Label>
              <Select
                value={filters.team}
                onValueChange={(v) => {
                  setFilters((f) => ({ ...f, team: v, userId: v === "all" ? f.userId : "all" }));
                  setPage(0);
                }}
              >
                <SelectTrigger aria-label="Filtrar por equipa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.name} ({t.ids.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cliente</Label>
              <Select value={filters.clientId} onValueChange={(v) => onFilterChange("clientId", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => onFilterChange("status", v as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Input
                placeholder="Título da tarefa"
                value={filters.taskSearch}
                onChange={(e) => onFilterChange("taskSearch", e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Tabela */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span>{isError ? "Falha ao carregar registros" : `${result?.total ?? 0} registro(s)`}</span>
            <span>{PAGE_SIZE} por página</span>
          </div>
          {isError && (
            <div
              role="alert"
              className="m-4 flex items-start justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Não foi possível carregar a Folha de Ponto.</p>
                  <p className="mt-1 text-xs opacity-90">
                    {error instanceof Error ? error.message : "Erro técnico inesperado."}
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Tarefa</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Previsto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead className="text-right">Efetivo</TableHead>
                  <TableHead>Pausa</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-sm text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !isError && (result?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-sm text-muted-foreground">
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {(result?.rows ?? []).map((r) => (
                  <RecordHistoryMenu key={r.id} entityType={isVacation(r) ? "vacation" : "punch"} entityId={r.id}>
                  <TableRow>
                    <TableCell className="font-medium">{r.profiles?.full_name ?? r.user_id.slice(0, 8)}</TableCell>
                    <TableCell className="max-w-[260px] truncate">
                      {isVacation(r) ? "Férias" : (r.tasks?.title ?? "—")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.tasks?.client_id ? (clientsMap[r.tasks.client_id] ?? "—") : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {(isVacation(r) ? formatVacationDate(r) : formatPrevisto(r.tasks)) || "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isAbsence(r)
                            ? "bg-destructive/15 text-destructive"
                            : isVacation(r)
                              ? "bg-success/15 text-success"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {formatSituation(r)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {isNonWork(r) ? (
                        "—"
                      ) : (
                        <span className={offCellClass(offByRow.get(r.id)?.start)}>
                          {fmtDT(r, r.started_at)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {isNonWork(r) ? (
                        "—"
                      ) : r.ended_at ? (
                        <span className={offCellClass(offByRow.get(r.id)?.end)}>
                          {fmtDT(r, r.ended_at)}
                        </span>
                      ) : (
                        <span className="text-warning">em aberto</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {isNonWork(r) ? (
                        "—"
                      ) : r.effective_minutes != null ? (
                        <span className={offCellClass(offByRow.get(r.id)?.over6h)}>
                          {formatDuration(r.effective_minutes)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatPause(r)}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${ORIGIN_TONE[r.origin]}`}
                      >
                        {formatOrigin(r)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <TaskNotesCell
                        notes={[
                          ...(formatStartDelay(r)
                            ? [
                                {
                                  label: "Início com atraso",
                                  text: formatStartDelay(r),
                                  createdAt: r.started_at,
                                  requestedDate: null,
                                  needsReassignment: null,
                                },
                              ]
                            : []),
                          ...getRowNoteItems(r),
                        ]}
                      />
                    </TableCell>
                    <TableCell>
                      {isOperationalTask(r) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações da tarefa">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!r.task_id || resolvedTaskStatus(r) === "em_andamento"}
                              title={resolvedTaskStatus(r) === "em_andamento" ? "A tarefa já tem um ponto aberto" : undefined}
                              onClick={() => openManualPoint(r)}
                            >
                              <ClockPlus className="mr-2 h-4 w-4" /> Lançar ponto
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!r.task_id || resolvedTaskStatus(r) === "em_andamento"}
                              onClick={() => openAbsenceCreate(r)}
                            >
                              <UserX className="mr-2 h-4 w-4" /> Marcar falta
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!r.task_id} onClick={() => openTaskAudit(r)}>
                              <History className="mr-2 h-4 w-4" /> Histórico
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : isVacation(r) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações das férias">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openVacationAddPoint(r)}>
                              <ClockPlus className="mr-2 h-4 w-4" /> Adicionar ponto neste dia
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => nav({ to: "/app/ferias" })}>
                              <Plane className="mr-2 h-4 w-4" /> Abrir em Férias
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações do registro">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isAbsence(r) && (
                              <DropdownMenuItem onClick={() => openManualPoint(r)}>
                                <ClockPlus className="mr-2 h-4 w-4" /> Lançar ponto manual
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => (isAbsence(r) ? openAbsenceEdit(r) : openEdit(r))}>
                              <Pencil className="mr-2 h-4 w-4" /> {isAbsence(r) ? "Editar falta" : "Editar"}
                            </DropdownMenuItem>
                            {isAbsence(r) ? (
                              <DropdownMenuItem disabled title="Falta não possui ponto para devolver">
                                <RotateCcw className="mr-2 h-4 w-4" /> Devolver para refazer
                              </DropdownMenuItem>
                            ) : (
                              !r.voided_at &&
                              r.entry_kind !== "paid_leave" && (
                                <DropdownMenuItem onClick={() => requestVoid(r)} disabled={voidMut.isPending}>
                                  <RotateCcw className="mr-2 h-4 w-4" /> Devolver para refazer
                                </DropdownMenuItem>
                              )
                            )}
                            <DropdownMenuItem onClick={() => (isAbsence(r) ? openTaskAudit(r) : openAudit(r))}>
                              <History className="mr-2 h-4 w-4" /> Histórico
                            </DropdownMenuItem>
                            {isAbsence(r) ? (
                              <DropdownMenuItem disabled title="Falta não possui geolocalização">
                                <MapPin className="mr-2 h-4 w-4" /> Geolocalização
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => openGeo(r)}>
                                <MapPin className="mr-2 h-4 w-4" /> Geolocalização
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                  </RecordHistoryMenu>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>

      <PunchEditorDrawer
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            setManualPointTarget(null);
            setAddPointDay(null);
            qc.invalidateQueries({ queryKey: [RECONCILIATION_QUERY_KEY] });
          }
        }}
        mode={editorMode}
        companyId={currentCompanyId}
        entry={activeEntry}
        entryTaskTitle={(manualPointTarget ?? activeEntry)?.tasks?.title ?? undefined}
        entryUserName={(manualPointTarget ?? activeEntry)?.profiles?.full_name ?? undefined}
        entryClientName={
          (manualPointTarget ?? activeEntry)?.tasks?.client_id
            ? (clientsMap[(manualPointTarget ?? activeEntry)!.tasks!.client_id!] ?? undefined)
            : undefined
        }
        initialEntryKind={initialEntryKind}
        initialUserId={manualPointTarget?.user_id ?? addPointDay?.userId}
        initialTaskId={manualPointTarget?.task_id}
        initialStartedAt={manualPlan.startedAt}
        initialEndedAt={manualPlan.endedAt}
        regularizeTaskAbsence={!!manualPointTarget}
        regularizeKind={manualPointTarget && !isAbsence(manualPointTarget) ? "task" : "absence"}
        entryTimeZone={activeEntry ? (entryTimeZones?.get(activeEntry.id) ?? null) : null}
      />
      <MarkAbsentDialog
        mode="create"
        task={absenceCreateTarget}
        employeeName={absenceCreateTarget?.assigned_to ? memberDisplayName(absenceCreateTarget.assigned_to) : undefined}
        clientName={absenceCreateTarget?.client_id ? (clientsMap[absenceCreateTarget.client_id] ?? undefined) : undefined}
        open={!!absenceCreateTarget}
        onOpenChange={(open) => !open && setAbsenceCreateTarget(null)}
        onDone={() => {
          setAbsenceCreateTarget(null);
          qc.invalidateQueries({ queryKey: ["punch-admin-list"] });
          qc.invalidateQueries({ queryKey: [RECONCILIATION_QUERY_KEY] });
        }}
      />
      <PunchAuditDrawer open={auditOpen} onOpenChange={setAuditOpen} timeEntryId={auditEntryId} />
      <PunchGeoDrawer
        open={geoOpen}
        onOpenChange={setGeoOpen}
        timeEntryId={geoEntry?.id ?? null}
        entryLabel={{
          user: geoEntry?.profiles?.full_name ?? null,
          task: geoEntry?.tasks?.title ?? null,
          client: geoEntry?.tasks?.client_id ? (clientsMap[geoEntry.tasks.client_id] ?? null) : null,
        }}
      />
      <MarkAbsentDialog
        mode="edit"
        task={absenceEditTarget}
        employeeName={absenceEditTarget?.assigned_to ? memberDisplayName(absenceEditTarget.assigned_to) : undefined}
        clientName={absenceEditTarget?.client_id ? (clientsMap[absenceEditTarget.client_id] ?? undefined) : undefined}
        open={!!absenceEditTarget}
        onOpenChange={(open) => !open && setAbsenceEditTarget(null)}
        onDone={() => {
          setAbsenceEditTarget(null);
          qc.invalidateQueries({ queryKey: ["punch-admin-list"] });
        }}
      />
      <TaskAbsenceAuditDrawer
        open={!!taskAuditTarget}
        onOpenChange={(open) => !open && setTaskAuditTarget(null)}
        taskId={taskAuditTarget?.task_id ?? null}
        taskTitle={taskAuditTarget?.tasks?.title}
      />
    </div>
  );
}
