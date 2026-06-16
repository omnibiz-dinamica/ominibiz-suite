import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Check, X as XIcon, Plus, Plane, FileSpreadsheet, FileText, Pencil } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { sendTransactionalEmail } from "@/lib/email/send";
import { exportToExcel, exportToPdf } from "@/lib/exports";
import { buildAppUrl } from "@/lib/app-url";

export const Route = createFileRoute("/app/ferias")({ component: FeriasPage });

type VacationStatus =
  | "pendente"
  | "pendente_confirmacao"
  | "aprovado"
  | "rejeitado"
  | "cancelado";
type VacationRow = {
  id: string;
  company_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
  status: VacationStatus;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  work_location: string | null;
  prior_validation: boolean;
  validated_by: string | null;
  assigned_approver_id: string | null;
};

const STATUS_TONE: Record<VacationStatus, string> = {
  pendente: "bg-warning/15 text-warning-foreground",
  pendente_confirmacao: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  aprovado: "bg-success/15 text-success",
  rejeitado: "bg-destructive/15 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<VacationStatus, string> = {
  pendente: "pendente",
  pendente_confirmacao: "pendente de confirmação",
  aprovado: "aprovado",
  rejeitado: "rejeitado",
  cancelado: "cancelado",
};

const fmt = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

/** Inclusive day count between two ISO dates (YYYY-MM-DD). */
const daysBetween = (start: string, end: string): number => {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, Math.round((e - s) / 86400000)) + 1;
};

/** Business days (Mon-Fri) inclusive between two ISO dates. */
const businessDaysBetween = (start: string, end: string): number => {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur.getTime() <= e.getTime()) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
};

function FeriasPage() {
  const { user, currentCompanyId, effectiveRole, isManager } = useAuth();
  const qc = useQueryClient();
  const isEmployee = effectiveRole === "employee";

  const { data: myProfile } = useQuery({
    queryKey: ["my-op-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("work_location, job_title")
        .eq("id", user!.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["vacations", currentCompanyId, effectiveRole, user?.id],
    enabled: !!user?.id && !!currentCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("vacation_requests")
        .select("*")
        .order("start_date", { ascending: false });
      if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      if (isEmployee) q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as VacationRow[];
    },
  });

  // Names for manager view
  const userIds = useMemo(
    () =>
      Array.from(
        new Set(
          rows.flatMap((r) =>
            [r.user_id, r.assigned_approver_id].filter(Boolean) as string[],
          ),
        ),
      ),
    [rows],
  );
  const { data: names = {} } = useQuery({
    queryKey: ["vac-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, job_title")
        .in("id", userIds);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((p: any) => [p.id, { name: p.full_name ?? "Usuário", jobTitle: p.job_title ?? null }]),
      ) as Record<string, { name: string; jobTitle: string | null }>;
    },
  });

  // Company members (for manager-create selector)
  const { data: members = [] } = useQuery({
    queryKey: ["vac-company-members", currentCompanyId],
    enabled: !!currentCompanyId && isManager,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", currentCompanyId!);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [] as { id: string; name: string; jobTitle: string | null }[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, job_title")
        .in("id", ids);
      return (profs ?? []).map((p: any) => ({
        id: p.id,
        name: p.full_name ?? "Usuário",
        jobTitle: p.job_title ?? null,
      }));
    },
  });

  const nameOf = (id: string | null | undefined): string =>
    id ? names[id]?.name ?? "Usuário" : "—";
  const jobOf = (id: string | null | undefined): string =>
    (id ? names[id]?.jobTitle : null) ?? "—";

  // ---- Send email helper (best-effort, never block UI) ----
  async function sendVacationEmail(
    vacationId: string,
    template:
      | "vacation_request"
      | "vacation_approved"
      | "vacation_rejected"
      | "vacation_created_by_manager"
      | "vacation_change_requested",
    triggerSource:
      | "vacation_request"
      | "vacation_approved"
      | "vacation_rejected"
      | "vacation_created_by_manager"
      | "vacation_change_requested",
    suffix: string,
  ) {
    try {
      const { data, error } = await (supabase as any).rpc("vacation_notify_payload", {
        _vacation_id: vacationId,
      });
      if (error) throw error;
      const p = data as any;
      const startDate = fmt(p.start_date);
      const endDate = fmt(p.end_date);
      const totalDays = daysBetween(p.start_date, p.end_date);
      const reviewUrl = buildAppUrl("/app/ferias");
      let to: string | undefined;
      let templateData: Record<string, any> = {
        startDate,
        endDate,
        totalDays,
        reviewUrl,
        appUrl: reviewUrl,
      };
      if (template === "vacation_request") {
        to = p.approver?.email;
        templateData.employeeName = p.employee?.name;
        templateData.note = p.decision_reason ?? undefined;
      } else if (template === "vacation_approved" || template === "vacation_rejected") {
        to = p.employee?.email;
        templateData.decidedBy = p.decided_by?.name;
        templateData.reason = p.decision_reason ?? undefined;
      } else if (template === "vacation_created_by_manager") {
        to = p.employee?.email;
        templateData.employeeName = p.employee?.name;
        templateData.managerName = p.decided_by?.name;
      } else if (template === "vacation_change_requested") {
        to = p.approver?.email ?? p.decided_by?.email;
        templateData.employeeName = p.employee?.name;
        templateData.reason = p.decision_reason ?? undefined;
      }
      if (!to) return;
      await sendTransactionalEmail({
        templateName: template,
        recipientEmail: to,
        idempotencyKey: `${template}-${vacationId}-${suffix}`,
        triggerSource,
        companyId: p.company_id,
        templateData,
      });
    } catch (e) {
      console.error("[vacation email]", template, e);
    }
  }

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [priorValidation, setPriorValidation] = useState<"sim" | "nao">("nao");
  const [validatedBy, setValidatedBy] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!start || !end) throw new Error("Informe início e fim");
      if (end < start) throw new Error("Data final deve ser após o início");
      if (!currentCompanyId || !user?.id) throw new Error("Empresa não selecionada");
      if (priorValidation === "sim" && !validatedBy.trim()) {
        throw new Error("Informe quem realizou a validação prévia");
      }
      const { data, error } = await supabase.from("vacation_requests").insert({
        company_id: currentCompanyId,
        user_id: user.id,
        start_date: start,
        end_date: end,
        note: note.trim() || null,
        prior_validation: priorValidation === "sim",
        validated_by: priorValidation === "sim" ? validatedBy.trim() : null,
      }).select("id").single();
      if (error) throw error;
      if (data?.id) await sendVacationEmail(data.id, "vacation_request", "vacation_request", "create");
    },
    onSuccess: () => {
      toast.success("Solicitação enviada");
      setStart(""); setEnd(""); setNote("");
      setPriorValidation("nao"); setValidatedBy("");
      qc.invalidateQueries({ queryKey: ["vacations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao solicitar"),
  });

  // ----- Manager creates vacation for a chosen employee -----
  const [mgrTargetUser, setMgrTargetUser] = useState<string>("");
  const [mgrStart, setMgrStart] = useState("");
  const [mgrEnd, setMgrEnd] = useState("");
  const [mgrNote, setMgrNote] = useState("");
  const mgrCreate = useMutation({
    mutationFn: async () => {
      if (!mgrTargetUser) throw new Error("Selecione o colaborador");
      if (!mgrStart || !mgrEnd) throw new Error("Informe início e fim");
      if (mgrEnd < mgrStart) throw new Error("Data final deve ser após o início");
      if (!currentCompanyId) throw new Error("Empresa não selecionada");
      const { data, error } = await supabase.from("vacation_requests").insert({
        company_id: currentCompanyId,
        user_id: mgrTargetUser,
        start_date: mgrStart,
        end_date: mgrEnd,
        note: mgrNote.trim() || null,
        prior_validation: false,
      }).select("id").single();
      if (error) throw error;
      if (data?.id) {
        await sendVacationEmail(
          data.id,
          "vacation_created_by_manager",
          "vacation_created_by_manager",
          "manager-create",
        );
      }
    },
    onSuccess: () => {
      toast.success("Férias agendadas — aguardando confirmação do funcionário");
      setMgrTargetUser(""); setMgrStart(""); setMgrEnd(""); setMgrNote("");
      qc.invalidateQueries({ queryKey: ["vacations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao agendar"),
  });

  const decide = useMutation({
    mutationFn: async (vars: { id: string; action: "aprovar" | "rejeitar" | "cancelar"; reason?: string }) => {
      const { error } = await (supabase as any).rpc("vacation_decide", {
        _id: vars.id,
        _action: vars.action,
        _reason: vars.reason ?? null,
      });
      if (error) throw error;
      if (vars.action === "aprovar") {
        await sendVacationEmail(vars.id, "vacation_approved", "vacation_approved", "approve");
      } else if (vars.action === "rejeitar") {
        await sendVacationEmail(vars.id, "vacation_rejected", "vacation_rejected", "reject");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vacations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na operação"),
  });

  const confirmMutation = useMutation({
    mutationFn: async (vars: { id: string; action: "confirmar" | "solicitar_alteracao"; reason?: string }) => {
      const { error } = await (supabase as any).rpc("vacation_confirm", {
        _id: vars.id,
        _action: vars.action,
        _reason: vars.reason ?? null,
      });
      if (error) throw error;
      if (vars.action === "solicitar_alteracao") {
        await sendVacationEmail(vars.id, "vacation_change_requested", "vacation_change_requested", "change-req");
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vacations"] });
      toast.success(vars.action === "confirmar" ? "Férias confirmadas" : "Alteração solicitada");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na operação"),
  });

  const pending = rows.filter((r) => r.status === "pendente");
  // Filtros de visão
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>(""); // YYYY-MM
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [businessOnly, setBusinessOnly] = useState<boolean>(false);

  const matchesFilters = (r: VacationRow): boolean => {
    if (filterUser !== "all" && r.user_id !== filterUser) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterYear !== "all") {
      const sY = r.start_date.slice(0, 4);
      const eY = r.end_date.slice(0, 4);
      if (sY !== filterYear && eY !== filterYear) return false;
    }
    if (filterMonth) {
      // Mês "intersecta" o intervalo?
      const monthStart = filterMonth + "-01";
      const [yy, mm] = filterMonth.split("-").map(Number);
      const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
      if (r.end_date < monthStart || r.start_date > monthEnd) return false;
    }
    if (filterLocation.trim()) {
      const q = filterLocation.trim().toLowerCase();
      if (!(r.work_location ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const filtered = rows.filter(matchesFilters);
  const approved = filtered.filter((r) => r.status === "aprovado");
  const history = rows.filter(
    (r) => (r.status === "rejeitado" || r.status === "cancelado") && matchesFilters(r),
  );

  const yearOptions = useMemo(() => {
    const ys = new Set<string>();
    for (const r of rows) {
      ys.add(r.start_date.slice(0, 4));
      ys.add(r.end_date.slice(0, 4));
    }
    return Array.from(ys).sort().reverse();
  }, [rows]);

  const countDays = (r: VacationRow) =>
    businessOnly ? businessDaysBetween(r.start_date, r.end_date) : daysBetween(r.start_date, r.end_date);

  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.user_id, nameOf(r.user_id));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows, names]);
  const awaitingMyConfirm = rows.filter(
    (r) => r.status === "pendente_confirmacao" && r.user_id === user?.id,
  );
  const awaitingTheirConfirm = rows.filter(
    (r) => r.status === "pendente_confirmacao" && r.user_id !== user?.id,
  );

  // Requests this user needs to decide on
  const toApprove = rows.filter(
    (r) => r.status === "pendente" && r.assigned_approver_id === user?.id && r.user_id !== user?.id,
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
          <Plane className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Férias</h1>
          <p className="text-sm text-muted-foreground">
            {isManager ? "Aprove solicitações e acompanhe o calendário da equipe." : "Solicite e acompanhe suas férias."}
          </p>
        </div>
      </header>

      {/* New request form — any member can request */}
      {!!user && !!currentCompanyId && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> Nova solicitação</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="start">Início</Label>
              <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="end">Fim</Label>
              <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div>
              <Label>Local de trabalho</Label>
              <Input value={myProfile?.work_location ?? "Não definido"} readOnly disabled />
            </div>
            <div className="md:col-span-3">
              <Label htmlFor="note">Observação (opcional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo, contexto..." />
            </div>
            <div className="md:col-span-3 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Label>No local de trabalho já houve validação prévia?</Label>
              <RadioGroup
                value={priorValidation}
                onValueChange={(v) => setPriorValidation(v as "sim" | "nao")}
                className="flex gap-6"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="sim" id="pv-sim" /> Sim
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="nao" id="pv-nao" /> Não
                </label>
              </RadioGroup>
              {priorValidation === "sim" && (
                <div>
                  <Label htmlFor="validated-by">Quem validou?</Label>
                  <Input
                    id="validated-by"
                    value={validatedBy}
                    onChange={(e) => setValidatedBy(e.target.value)}
                    placeholder="Ex.: Supervisor João, Cliente Happy Kot..."
                    maxLength={200}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Isto não substitui a aprovação do gestor — é apenas contexto operacional.
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !start || !end}>
              Enviar solicitação
            </Button>
          </div>
        </section>
      )}

      {/* Manager: pending */}
      {(isManager || toApprove.length > 0) && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Aguardando sua aprovação ({toApprove.length})</h2>
          {toApprove.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada para aprovar agora.</p>
          ) : (
            <ul className="space-y-2">
              {toApprove.map((r) => (
                <PendingRow
                  key={r.id}
                  row={r}
                  name={nameOf(r.user_id)}
                  onApprove={() => decide.mutate({ id: r.id, action: "aprovar" })}
                  onReject={(reason) => decide.mutate({ id: r.id, action: "rejeitar", reason })}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Employee: vacations awaiting MY confirmation */}
      {awaitingMyConfirm.length > 0 && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="mb-3 font-semibold">Aguardando sua confirmação ({awaitingMyConfirm.length})</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            O gestor agendou estas férias em seu nome. Confirme ou solicite alteração.
          </p>
          <ul className="space-y-2">
            {awaitingMyConfirm.map((r) => (
              <ConfirmRow
                key={r.id}
                row={r}
                onAccept={() => confirmMutation.mutate({ id: r.id, action: "confirmar" })}
                onRequestChange={(reason) =>
                  confirmMutation.mutate({ id: r.id, action: "solicitar_alteracao", reason })
                }
              />
            ))}
          </ul>
        </section>
      )}

      {/* Manager view: vacations awaiting employee confirmation */}
      {isManager && awaitingTheirConfirm.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">
            Pendentes de confirmação do funcionário ({awaitingTheirConfirm.length})
          </h2>
          <ul className="divide-y divide-border">
            {awaitingTheirConfirm.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="font-medium">{nameOf(r.user_id)}</div>
                  <div className="text-sm text-muted-foreground">
                    {fmt(r.start_date)} → {fmt(r.end_date)}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE.pendente_confirmacao}`}>
                  {STATUS_LABEL.pendente_confirmacao}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Approved calendar */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <CalendarIcon className="h-4 w-4" /> Aprovadas ({approved.length})
        </h2>
        {isManager && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">Colaborador</Label>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {uniqueUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Mês</Label>
              <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Local de trabalho</Label>
              <Input
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filtrar por local…"
              />
            </div>
            <div className="flex items-end gap-2">
              <Switch id="biz-only" checked={businessOnly} onCheckedChange={setBusinessOnly} />
              <Label htmlFor="biz-only" className="text-xs">Contar apenas dias úteis</Label>
            </div>
          </div>
        )}
        {approved.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma férias aprovada.</p>
        ) : (
          <ul className="divide-y divide-border">
            {approved.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="font-medium">
                    {isManager ? nameOf(r.user_id) : "Você"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {fmt(r.start_date)} → {fmt(r.end_date)}
                    {" · "}
                    <span className="font-mono">{countDays(r)} {businessOnly ? "dias úteis" : "dias"}</span>
                    {r.work_location && <span> · {r.work_location}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE.aprovado}`}>aprovado</span>
                  {(r.user_id === user?.id || isManager) && (
                    <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: r.id, action: "cancelar" })}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Own pending list */}
      {pending.some((r) => r.user_id === user?.id) && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Minhas pendentes</h2>
          <ul className="divide-y divide-border">
            {pending
              .filter((r) => r.user_id === user?.id)
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{fmt(r.start_date)} → {fmt(r.end_date)}</div>
                    <div className="text-xs text-muted-foreground">
                      Aprovador:{" "}
                      {r.assigned_approver_id
                        ? nameOf(r.assigned_approver_id)
                        : "Não definido"}
                    </div>
                    {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: r.id, action: "cancelar" })}>
                    Cancelar
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* History */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Histórico</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registros.</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="font-medium">
                    {isManager ? nameOf(r.user_id) : "Você"} — {fmt(r.start_date)} → {fmt(r.end_date)}
                  </div>
                  {r.decision_reason && (
                    <div className="text-xs text-muted-foreground">Motivo: {r.decision_reason}</div>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ConfirmRow({
  row, onAccept, onRequestChange,
}: {
  row: VacationRow;
  onAccept: () => void;
  onRequestChange: (reason: string) => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">
            {fmt(row.start_date)} → {fmt(row.end_date)}
          </div>
          {row.decision_reason && (
            <div className="text-xs text-muted-foreground">Nota do gestor: {row.decision_reason}</div>
          )}
        </div>
        {!requesting ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={onAccept}>
              <Check className="h-4 w-4" /> Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRequesting(true)}>
              <Pencil className="h-4 w-4" /> Solicitar alteração
            </Button>
          </div>
        ) : null}
      </div>
      {requesting && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`c-${row.id}`}>Descreva a alteração pretendida</Label>
          <Textarea
            id={`c-${row.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: preferia adiar uma semana, conflito com..."
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setRequesting(false); setReason(""); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!reason.trim()}
              onClick={() => { onRequestChange(reason.trim()); setRequesting(false); setReason(""); }}
            >
              Enviar pedido de alteração
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function PendingRow({
  row, name, onApprove, onReject,
}: {
  row: VacationRow;
  name: string;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-muted-foreground">
            {fmt(row.start_date)} → {fmt(row.end_date)}
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <div>Local: {row.work_location ?? "—"}</div>
            <div>
              Validação prévia:{" "}
              {row.prior_validation ? (
                <span className="text-success">Sim{row.validated_by ? ` — ${row.validated_by}` : ""}</span>
              ) : (
                "Não"
              )}
            </div>
          </div>
          {row.note && <div className="mt-1 text-xs text-muted-foreground">"{row.note}"</div>}
        </div>
        {!rejecting ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={onApprove}>
              <Check className="h-4 w-4" /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
              <XIcon className="h-4 w-4" /> Rejeitar
            </Button>
          </div>
        ) : null}
      </div>
      {rejecting && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`r-${row.id}`}>Motivo da rejeição</Label>
          <Textarea
            id={`r-${row.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explique o motivo..."
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setReason(""); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!reason.trim()}
              onClick={() => { onReject(reason.trim()); setRejecting(false); setReason(""); }}
            >
              Confirmar rejeição
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}