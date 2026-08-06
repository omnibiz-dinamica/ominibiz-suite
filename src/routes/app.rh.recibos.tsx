import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/email/send";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Drawer, DrawerContent, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Receipt, Upload, Download, Mail, UserPlus, Trash2, Loader2, FileText, AlertTriangle, CheckCircle2, History, Send, UserCog } from "lucide-react";
import { extractPdfText, parsePayslipText, fuzzyMatchEmployee, MONTH_LABEL_PT } from "@/lib/payslip-parser";

export const Route = createFileRoute("/app/rh/recibos")({ component: PayslipsAdminPage });

type Payslip = {
  id: string; company_id: string; user_id: string | null; uploaded_by: string;
  storage_path: string; original_filename: string; size_bytes: number | null;
  period_year: number | null; period_month: number | null;
  employee_name_detected: string | null;
  gross_amount: number | null; net_amount: number | null; parse_confidence: number | null;
  status: "unassigned" | "assigned" | "sent" | "failed" | "archived";
  email_to: string | null; email_sent_at: string | null; email_delivery_status: string | null; email_error: string | null;
  created_at: string;
};
type Member = { id: string; name: string };

const STATUS_LABEL: Record<Payslip["status"], { label: string; tone: string }> = {
  unassigned: { label: "Não associado", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  assigned:   { label: "Associado",     tone: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  sent:       { label: "Enviado",       tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  failed:     { label: "Falhou",        tone: "bg-destructive/15 text-destructive" },
  archived:   { label: "Arquivado",     tone: "bg-muted text-muted-foreground" },
};

function fmtMoney(v: number | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}
function fmtPeriod(p: Payslip) {
  if (!p.period_year || !p.period_month) return "—";
  return `${MONTH_LABEL_PT[p.period_month - 1]}/${p.period_year}`;
}

function PayslipsAdminPage() {
  const { currentCompanyId, user, isManager } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Payslip["status"] | "all">("unassigned");
  const [uploading, setUploading] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Payslip | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Payslip | null>(null);

  const { data: counts } = useQuery({
    queryKey: ["payslip-counts", currentCompanyId],
    enabled: !!currentCompanyId && isManager,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("payslip_dashboard_counts", { _company_id: currentCompanyId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { total: number; unassigned: number; assigned: number; sent: number; failed: number };
    },
  });

  const { data: payslips = [] } = useQuery({
    queryKey: ["payslips", currentCompanyId, tab],
    enabled: !!currentCompanyId && isManager,
    queryFn: async () => {
      let q = supabase.from("payslips").select("*").eq("company_id", currentCompanyId!).order("created_at", { ascending: false });
      if (tab !== "all") q = q.eq("status", tab);
      const { data, error } = await q;
      if (error) throw error;
      return data as Payslip[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["payslip-members", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("company_id", currentCompanyId!);
      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
      if (!ids.length) return [] as Member[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (profs ?? []).map((p: any) => ({ id: p.id, name: p.full_name ?? "Sem nome" }));
    },
  });

  const uploadOne = async (file: File): Promise<void> => {
    if (!currentCompanyId || !user) return;
    if (file.type !== "application/pdf") {
      toast.error(`${file.name}: apenas PDF é suportado nesta fase`);
      return;
    }
    let parsed: Awaited<ReturnType<typeof parsePayslipText>> | null = null;
    try {
      const text = await extractPdfText(file);
      parsed = parsePayslipText(text);
    } catch (e) {
      console.warn("[payslips] parse failed", e);
    }
    const path = `${currentCompanyId}/unassigned/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await supabase.storage.from("payslips").upload(path, file, { contentType: "application/pdf" });
    if (upErr) throw upErr;
    const { error: insErr } = await supabase.from("payslips").insert({
      company_id: currentCompanyId,
      uploaded_by: user.id,
      storage_path: path,
      original_filename: file.name,
      mime_type: "application/pdf",
      size_bytes: file.size,
      period_year: parsed?.period_year ?? null,
      period_month: parsed?.period_month ?? null,
      employee_name_detected: parsed?.employee_name_detected ?? null,
      gross_amount: parsed?.gross_amount ?? null,
      net_amount: parsed?.net_amount ?? null,
      parse_confidence: parsed?.parse_confidence ?? null,
      parse_raw: parsed ? { text_excerpt: parsed.text.slice(0, 1000) } : {},
    });
    if (insErr) throw insErr;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const f of Array.from(files)) {
      try { await uploadOne(f); ok++; } catch (e: any) { console.error(e); fail++; toast.error(`${f.name}: ${e.message ?? "falha"}`); }
    }
    setUploading(false);
    if (ok) toast.success(`${ok} recibo(s) carregado(s)`);
    qc.invalidateQueries({ queryKey: ["payslips"] });
    qc.invalidateQueries({ queryKey: ["payslip-counts"] });
  };

  const downloadMut = useMutation({
    mutationFn: async (p: Payslip) => {
      const { data, error } = await supabase.storage.from("payslips").createSignedUrl(p.storage_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao gerar link"),
  });

  const deleteMut = useMutation({
    mutationFn: async (p: Payslip) => {
      await supabase.storage.from("payslips").remove([p.storage_path]);
      const { error } = await supabase.from("payslips").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recibo removido");
      qc.invalidateQueries({ queryKey: ["payslips"] });
      qc.invalidateQueries({ queryKey: ["payslip-counts"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover"),
  });

  const sendMut = useMutation({
    mutationFn: async (p: Payslip) => {
      if (!p.user_id) throw new Error("Associe a um funcionário primeiro");
      if (!p.email_to) throw new Error("Funcionário sem email cadastrado");
      // 1) Conta envios anteriores (sent/failed) para gerar idempotencyKey único.
      const { count: prevCount } = await (supabase as any)
        .from("payslip_email_events")
        .select("id", { count: "exact", head: true })
        .eq("payslip_id", p.id)
        .in("event", ["sent", "failed"]);
      const attempt = (prevCount ?? 0) + 1;

      // 2) Link de download assinado, válido por 7 dias.
      const SEVEN_DAYS = 60 * 60 * 24 * 7;
      const { data: signed, error: urlErr } = await supabase.storage
        .from("payslips")
        .createSignedUrl(p.storage_path, SEVEN_DAYS);
      if (urlErr || !signed?.signedUrl) {
        throw new Error(urlErr?.message ?? "Falha ao gerar link de download");
      }

      const periodLabel =
        p.period_year && p.period_month
          ? `${MONTH_LABEL_PT[p.period_month - 1]}/${p.period_year}`
          : undefined;
      const expiresAt = new Date(Date.now() + SEVEN_DAYS * 1000);
      const expiresLabel = expiresAt.toLocaleDateString("pt-PT", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });

      // 3) Envia (helper já loga em email_send_log com idempotencyKey).
      try {
        await sendTransactionalEmail({
          templateName: "payslip_published",
          recipientEmail: p.email_to,
          idempotencyKey: `payslip-${p.id}-${attempt}`,
          triggerSource: "payslip_published",
          companyId: p.company_id,
          templateData: {
            periodLabel,
            downloadUrl: signed.signedUrl,
            downloadExpiresAt: expiresLabel,
          },
        });
      } catch (e: any) {
        await (supabase as any).rpc("payslip_mark_sent", {
          _id: p.id,
          _status: "failed",
          _detail: { error: String(e?.message ?? e).slice(0, 500), attempt },
        });
        throw e;
      }

      // 4) Marca como enviado e registra evento.
      const { error: markErr } = await (supabase as any).rpc("payslip_mark_sent", {
        _id: p.id,
        _status: "sent",
        _detail: {
          attempt,
          recipient: p.email_to,
          download_expires_at: expiresAt.toISOString(),
        },
      });
      if (markErr) throw markErr;
    },
    onSuccess: (_d, p) => {
      toast.success(`Recibo enviado para ${p.email_to}`);
      qc.invalidateQueries({ queryKey: ["payslips"] });
      qc.invalidateQueries({ queryKey: ["payslip-counts"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao enviar"),
  });

  if (!currentCompanyId) {
    return <div className="text-sm text-muted-foreground">Selecione uma empresa para gerenciar recibos.</div>;
  }
  if (!isManager) {
    return <div className="text-sm text-muted-foreground">Apenas gestores podem acessar este módulo.</div>;
  }

  const tabs: { value: Payslip["status"] | "all"; label: string; count?: number }[] = [
    { value: "unassigned", label: "Não associados", count: counts?.unassigned },
    { value: "assigned",   label: "Associados",     count: counts?.assigned },
    { value: "sent",       label: "Enviados",       count: counts?.sent },
    { value: "failed",     label: "Falhas",         count: counts?.failed },
    { value: "all",        label: "Todos",          count: counts?.total },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
            <Receipt className="h-6 w-6" /> Recibos de Pagamento
          </h1>
          <p className="text-sm text-muted-foreground">Upload, associação e distribuição de recibos.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="payslip-upload"
            type="file"
            multiple
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
          />
          <Button asChild disabled={uploading}>
            <label htmlFor="payslip-upload" className="cursor-pointer">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? "Carregando..." : "Carregar PDFs"}
            </label>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total" value={counts?.total ?? 0} />
        <StatCard label="Não associados" value={counts?.unassigned ?? 0} accent="amber" />
        <StatCard label="Associados" value={counts?.assigned ?? 0} accent="blue" />
        <StatCard label="Enviados" value={counts?.sent ?? 0} accent="emerald" />
        <StatCard label="Falhas" value={counts?.failed ?? 0} accent="red" />
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Payslip["status"] | "all")}>
        <TabsList className="flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}{typeof t.count === "number" ? ` (${t.count})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <div className="rounded-lg border border-border">
            <div className="hidden grid-cols-12 gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
              <div className="col-span-2">Período</div>
              <div className="col-span-3">Funcionário</div>
              <div className="col-span-2">Valor líquido</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-3 text-right">Ações</div>
            </div>
            {payslips.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                Nenhum recibo nesta categoria.
              </div>
            ) : payslips.map((p) => {
              const memberName = p.user_id ? members.find((m) => m.id === p.user_id)?.name : null;
              return (
                <div key={p.id} className="grid grid-cols-1 gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-12 md:items-center">
                  <div className="md:col-span-2 text-sm font-medium">{fmtPeriod(p)}</div>
                  <div className="md:col-span-3 text-sm">
                    {memberName ?? <span className="text-amber-600">{p.employee_name_detected ?? "—"}</span>}
                    <div className="truncate text-[11px] text-muted-foreground">{p.original_filename}</div>
                  </div>
                  <div className="md:col-span-2 text-sm tabular-nums">{fmtMoney(p.net_amount)}</div>
                  <div className="md:col-span-2">
                    <Badge variant="secondary" className={STATUS_LABEL[p.status].tone}>{STATUS_LABEL[p.status].label}</Badge>
                    {p.status === "failed" && p.email_error && (
                      <div className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{p.email_error}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 md:col-span-3 md:justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setAssignTarget(p)} title="Associar">
                      <UserPlus className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadMut.mutate(p)} title="Baixar">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!p.user_id || !p.email_to || sendMut.isPending}
                      onClick={() => sendMut.mutate(p)}
                      title={
                        !p.user_id
                          ? "Associe a um funcionário primeiro"
                          : !p.email_to
                          ? "Funcionário sem email cadastrado"
                          : p.email_sent_at
                          ? `Reenviar (último envio ${new Date(p.email_sent_at).toLocaleString("pt-PT")})`
                          : "Enviar por email"
                      }
                    >
                      {p.email_sent_at ? <Send className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setHistoryTarget(p)} title="Histórico de envios">
                      <History className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Remover este recibo?")) deleteMut.mutate(p); }} title="Remover">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <AssignDrawer
        payslip={assignTarget}
        members={members}
        onClose={() => setAssignTarget(null)}
        onAssigned={() => {
          qc.invalidateQueries({ queryKey: ["payslips"] });
          qc.invalidateQueries({ queryKey: ["payslip-counts"] });
          setAssignTarget(null);
        }}
      />

      <HistoryDrawer payslip={historyTarget} onClose={() => setHistoryTarget(null)} />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "amber" | "blue" | "emerald" | "red" }) {
  const tone = accent === "amber" ? "text-amber-600" :
               accent === "blue" ? "text-blue-600" :
               accent === "emerald" ? "text-emerald-600" :
               accent === "red" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function AssignDrawer({
  payslip, members, onClose, onAssigned,
}: {
  payslip: Payslip | null;
  members: Member[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [userId, setUserId] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [gross, setGross] = useState<string>("");
  const [net, setNet] = useState<string>("");

  useEffect(() => {
    if (!payslip) return;
    setUserId(payslip.user_id ?? "");
    setYear(payslip.period_year ? String(payslip.period_year) : "");
    setMonth(payslip.period_month ? String(payslip.period_month) : "");
    setGross(payslip.gross_amount != null ? String(payslip.gross_amount) : "");
    setNet(payslip.net_amount != null ? String(payslip.net_amount) : "");
  }, [payslip?.id]);

  const suggestions = useMemo(
    () => fuzzyMatchEmployee(payslip?.employee_name_detected ?? null, members),
    [payslip?.employee_name_detected, members],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!payslip) return;
      // 1) atualiza metadados editáveis
      const updates = {
        period_year: year ? parseInt(year, 10) : null,
        period_month: month ? parseInt(month, 10) : null,
        gross_amount: gross ? parseFloat(gross) : null,
        net_amount: net ? parseFloat(net) : null,
      };
      const { error: upErr } = await (supabase.from("payslips") as any).update(updates).eq("id", payslip.id);
      if (upErr) throw upErr;

      // 2) move arquivo para pasta do funcionário e associa
      if (userId && userId !== payslip.user_id) {
        const newPath = `${payslip.company_id}/${userId}/${year || "sem-periodo"}-${(month || "00").padStart(2, "0")}/${crypto.randomUUID()}.pdf`;
        const { error: mvErr } = await supabase.storage.from("payslips").move(payslip.storage_path, newPath);
        if (mvErr) throw mvErr;
        const { error: pathErr } = await supabase.from("payslips").update({ storage_path: newPath }).eq("id", payslip.id);
        if (pathErr) throw pathErr;
        const { error: rpcErr } = await (supabase as any).rpc("payslip_assign", { _id: payslip.id, _user_id: userId });
        if (rpcErr) throw rpcErr;
      }
    },
    onSuccess: () => { toast.success("Recibo atualizado"); onAssigned(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  return (
    <Drawer open={!!payslip} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent size="md">
        <ModalHeader
          icon={UserCog}
          title="Associar recibo ao funcionário"
          description="Defina o funcionário, o período e os valores do recibo."
        />
        <ModalBody className="space-y-4">
          {payslip?.employee_name_detected && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Nome detectado no PDF</div>
              <div className="mt-1 font-medium">{payslip.employee_name_detected}</div>
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Button key={s.id} size="sm" variant="outline" onClick={() => setUserId(s.id)}>
                      <CheckCircle2 className="mr-1 h-3 w-3" /> {s.name} <span className="ml-1 text-[10px] text-muted-foreground">({Math.round(s.score * 100)}%)</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Funcionário</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Mês</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {MONTH_LABEL_PT.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ano</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Valor bruto</Label>
              <Input value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label>Valor líquido</Label>
              <Input value={net} onChange={(e) => setNet(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !userId}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar e associar
          </Button>
        </ModalFooter>
      </DrawerContent>
    </Drawer>
  );
}

function HistoryDrawer({ payslip, onClose }: { payslip: Payslip | null; onClose: () => void }) {
  const { data: events = [] } = useQuery({
    queryKey: ["payslip-events", payslip?.id],
    enabled: !!payslip,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payslip_email_events")
        .select("id, event, detail, created_at")
        .eq("payslip_id", payslip!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        event: string;
        detail: Record<string, any> | null;
        created_at: string;
      }>;
    },
  });

  return (
    <Drawer open={!!payslip} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent size="md">
        <ModalHeader icon={History} title="Histórico de envios" description="Eventos de entrega registados para este recibo." />
        <ModalBody className="space-y-3">
          {payslip && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{payslip.original_filename}</div>
              <div className="text-xs text-muted-foreground">
                {payslip.email_to ?? "Sem email"} · Último status: {payslip.email_delivery_status ?? "—"}
              </div>
            </div>
          )}
          {events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum envio registado ainda.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {events.map((ev) => {
                const tone =
                  ev.event === "sent"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : ev.event === "failed"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground";
                return (
                  <li key={ev.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className={tone}>{ev.event}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString("pt-PT")}
                      </span>
                    </div>
                    {ev.detail && Object.keys(ev.detail).length > 0 && (
                      <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                        {JSON.stringify(ev.detail, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ModalBody>
      </DrawerContent>
    </Drawer>
  );
}