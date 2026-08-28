/**
 * OmniBiz · Funcionário — Meus Relatórios de Ponto (ADR-038).
 *
 * Conferência obrigatória antes da assinatura: o funcionário vê a prévia
 * completa dos registos (dias, entradas, saídas, pausas, totais) e só depois
 * assina. Assinar cria uma versão imutável + PDF no bucket privado.
 * Nada aqui altera `time_entries`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSignature, MessageSquareWarning, Printer } from "lucide-react";
import {
  MONTH_LABELS,
  TIMESHEET_STATUS_LABEL,
  buildSnapshot,
  confirmDay,
  ensurePeriod,
  formatDayTime,
  formatMinutes,
  getVersion,
  listMyPeriods,
  logAccess,
  monthLabel,
  pdfPath,
  registerPdf,
  requestCorrection,
  sha256Hex,
  signPeriod,
  uploadTimesheetPdf,
  type TimesheetPeriod,
  type TimesheetStatus,
} from "@/lib/timesheet";
import { downloadBytes, generateTimesheetPdf, printBytes } from "@/lib/timesheet-pdf";
import { formatWallDate } from "@/lib/wall-clock";

export const Route = createFileRoute("/app/ponto_/meus-relatorios")({ component: Page });

function statusTone(status: TimesheetStatus) {
  if (status === "disponivel_contabilidade" || status === "fechado_gestor") return "secondary" as const;
  if (status === "aguardando_correcao") return "destructive" as const;
  if (status === "assinado_funcionario") return "default" as const;
  return "outline" as const;
}

function Page() {
  return (
    <RoleGuard allow={["employee", "manager", "owner", "super_admin"]}>
      <MyReports />
    </RoleGuard>
  );
}

function MyReports() {
  const { user, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState<number | "all">(now.getUTCMonth() + 1);
  const [status, setStatus] = useState<TimesheetStatus | "all">("all");
  const [openPeriod, setOpenPeriod] = useState<TimesheetPeriod | null>(null);

  const periods = useQuery({
    queryKey: ["my-timesheets", user?.id, year],
    enabled: !!user?.id,
    queryFn: () => listMyPeriods(user!.id, year),
  });

  // Garante que o mês corrente existe para conferência mesmo sem abertura do gestor.
  const ensureCurrent = useMutation({
    mutationFn: async (m: number) => {
      if (!currentCompanyId || !user?.id) throw new Error("Empresa activa não definida.");
      return ensurePeriod({ companyId: currentCompanyId, employeeId: user.id, year, month: m });
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["my-timesheets", user?.id, year] });
      setOpenPeriod(row);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const list = periods.data ?? [];
    return list.filter(
      (p) => (month === "all" || p.period_month === month) && (status === "all" || p.status === status),
    );
  }, [periods.data, month, status]);

  const years = useMemo(() => {
    const y = now.getUTCFullYear();
    return [y + 1, y, y - 1, y - 2];
  }, [now]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Meus Relatórios de Ponto</h1>
        <p className="mt-1 text-muted-foreground">
          Confira os registos do mês, assine e guarde o seu documento.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Ano</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Mês</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(v === "all" ? "all" : Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {MONTH_LABELS.map((label, i) => (
                <SelectItem key={label} value={String(i + 1)}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as TimesheetStatus | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(TIMESHEET_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {typeof month === "number" && !rows.some((r) => r.period_month === month) && (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Ainda não existe relatório para {monthLabel(month, year)}.
          </p>
          <Button
            className="mt-3"
            disabled={ensureCurrent.isPending}
            onClick={() => ensureCurrent.mutate(month)}
          >
            Preparar relatório de {monthLabel(month, year)}
          </Button>
        </div>
      )}

      {periods.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpenPeriod(p)}
              className="rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary/50"
            >
              <div className="font-display text-lg font-semibold">
                {monthLabel(p.period_month, p.period_year)}
              </div>
              <Badge variant={statusTone(p.status)} className="mt-2">
                {TIMESHEET_STATUS_LABEL[p.status]}
              </Badge>
              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>Total de horas: {formatMinutes(p.worked_minutes)}</div>
                <div>Dias com registo: {p.paid_days ?? 0}</div>
                {p.correction_reason && <div className="text-destructive">Correção: {p.correction_reason}</div>}
              </dl>
            </button>
          ))}
          {rows.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhum relatório neste filtro.</div>
          )}
        </div>
      )}

      <PeriodDetail
        period={openPeriod}
        onClose={() => setOpenPeriod(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["my-timesheets", user?.id, year] })}
      />
    </div>
  );
}

function PeriodDetail({
  period,
  onClose,
  onChanged,
}: {
  period: TimesheetPeriod | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [declared, setDeclared] = useState(false);
  const [reason, setReason] = useState("");
  const [askCorrection, setAskCorrection] = useState(false);
  const [busy, setBusy] = useState(false);

  const snap = useQuery({
    queryKey: ["timesheet-snapshot", period?.id, period?.current_version],
    enabled: !!period,
    queryFn: async () => {
      if (period!.current_version > 0) {
        const v = await getVersion(period!.id, period!.current_version);
        if (v?.snapshot) {
          void logAccess(period!.id, "REPORT_VIEWED");
          return v.snapshot;
        }
      }
      const built = await buildSnapshot({
        companyId: period!.company_id,
        employeeId: period!.employee_id,
        year: period!.period_year,
        month: period!.period_month,
      });
      void logAccess(period!.id, "REPORT_VIEWED");
      return built;
    },
  });

  const locked =
    !!period &&
    (period.status === "fechado_gestor" || period.status === "disponivel_contabilidade");

  const sign = async () => {
    if (!period) return;
    setBusy(true);
    try {
      const version = await signPeriod(period.id);
      const bytes = await generateTimesheetPdf(version.snapshot, {
        versionLabel: `Versão ${version.version}`,
      });
      const path = pdfPath({
        company_id: period.company_id,
        employee_id: period.employee_id,
        year: period.period_year,
        month: period.period_month,
        version: version.version,
      });
      await uploadTimesheetPdf(path, bytes);
      await registerPdf(version.id, path, await sha256Hex(bytes));
      toast.success("Relatório assinado e arquivado.");
      onChanged();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCorrection = async () => {
    if (!period) return;
    if (!reason.trim()) {
      toast.error("Descreva o que precisa de correção.");
      return;
    }
    setBusy(true);
    try {
      await requestCorrection(period.id, reason.trim());
      toast.success("Pedido de correção enviado ao gestor.");
      setAskCorrection(false);
      setReason("");
      onChanged();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async (mode: "download" | "print") => {
    if (!snap.data || !period) return;
    const bytes = await generateTimesheetPdf(snap.data, {
      versionLabel: period.current_version > 0 ? `Versão ${period.current_version}` : "Prévia",
    });
    void logAccess(period.id, "REPORT_DOWNLOADED");
    if (mode === "download") {
      downloadBytes(bytes, `folha-ponto-${period.period_year}-${String(period.period_month).padStart(2, "0")}.pdf`);
    } else {
      printBytes(bytes);
    }
  };

  return (
    <Dialog open={!!period} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl">
        <ModalHeader
          icon={FileSignature}
          title={period ? `Folha de Ponto · ${monthLabel(period.period_month, period.period_year)}` : ""}
          description={period ? TIMESHEET_STATUS_LABEL[period.status] : ""}
        />
        <ModalBody>
          {snap.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando registos...</div>
          ) : snap.data ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Entrada</th>
                      <th className="px-3 py-2 text-left">Saída</th>
                      <th className="px-3 py-2 text-left">Pausas</th>
                      <th className="px-3 py-2 text-left">Total</th>
                      <th className="px-3 py-2 text-left">Situação</th>
                      <th className="px-3 py-2 text-left">Visto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.data.days.map((d) => (
                      <tr key={d.work_date} className="border-t border-border">
                        <td className="px-3 py-2">{formatWallDate(d.work_date) || d.work_date}</td>
                        <td className="px-3 py-2">{formatDayTime(d.first_in)}</td>
                        <td className="px-3 py-2">{formatDayTime(d.last_out)}</td>
                        <td className="px-3 py-2">{formatMinutes(d.break_minutes)}</td>
                        <td className="px-3 py-2">{formatMinutes(d.worked_minutes)}</td>
                        <td className="px-3 py-2">
                          {d.day_type === "vacation" ? (
                            <div className="space-y-1">
                              <Badge variant="secondary">Férias</Badge>
                              {d.first_in && <div className="text-xs text-amber-700">Conflito com ponto</div>}
                            </div>
                          ) : (
                            "Trabalhado"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {d.confirmed_at ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5" /> confirmado
                            </span>
                          ) : locked || period!.current_version > 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await confirmDay(period!.company_id, d.work_date, true);
                                  await snap.refetch();
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                              }}
                            >
                              Confirmar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {snap.data.days.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-sm text-muted-foreground" colSpan={7}>
                          Sem registos de ponto neste mês.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-2 rounded-xl border border-border bg-card/60 p-4 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Total de horas</div>
                  <div className="font-medium">{formatMinutes(snap.data.summary.worked_minutes)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Dias com registo</div>
                  <div className="font-medium">{snap.data.summary.paid_days}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Tipo de pagamento</div>
                  <div className="font-medium">{snap.data.summary.payment_type_used ?? "—"}</div>
                </div>
              </div>

              {askCorrection ? (
                <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                  <Label>O que precisa de correção?</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
                </div>
              ) : (
                !locked && (
                  <label className="flex items-start gap-2 rounded-xl border border-border bg-card/60 p-4 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={declared}
                      onChange={(e) => setDeclared(e.target.checked)}
                    />
                    <span>
                      Declaro que conferi os registos acima e confirmo as informações da minha folha de
                      ponto.
                    </span>
                  </label>
                )
              )}
            </div>
          ) : (
            <div className="text-sm text-destructive">Não foi possível carregar o relatório.</div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => exportPdf("print")} disabled={!snap.data}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={() => exportPdf("download")} disabled={!snap.data}>
            <Download className="h-4 w-4" /> Baixar PDF
          </Button>
          {!locked && (
            askCorrection ? (
              <>
                <Button variant="ghost" disabled={busy} onClick={() => setAskCorrection(false)}>
                  Voltar
                </Button>
                <Button variant="destructive" disabled={busy} onClick={submitCorrection}>
                  Enviar pedido
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" disabled={busy} onClick={() => setAskCorrection(true)}>
                  <MessageSquareWarning className="h-4 w-4" /> Solicitar correção
                </Button>
                <Button disabled={busy || !declared || !snap.data} onClick={sign}>
                  <FileSignature className="h-4 w-4" />
                  {busy ? "Assinando..." : "Assinar e gerar relatório"}
                </Button>
              </>
            )
          )}
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
