import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { toast } from "sonner";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/exports";
import { CreditCard, Check, X as XIcon, Upload, Camera, Download, Plus, Trash2, FileSpreadsheet, FileText } from "lucide-react";

export const Route = createFileRoute("/app/despesas")({ component: DespesasPage });

type ExpenseStatus = "pendente" | "aprovada" | "rejeitada";
type PaymentStatus = "aguardando_pagamento" | "paga";
type ExpenseRow = {
  id: string;
  company_id: string;
  user_id: string;
  expense_date: string;
  amount: number;
  reason: string;
  notes: string | null;
  attachment_path: string | null;
  attachment_mime: string | null;
  status: ExpenseStatus;
  payment_status: PaymentStatus | null;
  paid_by: string | null;
  paid_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
};

const STATUS_TONE: Record<ExpenseStatus, string> = {
  pendente: "bg-warning/15 text-warning-foreground",
  aprovada: "bg-success/15 text-success",
  rejeitada: "bg-destructive/15 text-destructive",
};
const STATUS_LABEL: Record<ExpenseStatus, string> = {
  pendente: "pendente",
  aprovada: "aprovada",
  rejeitada: "rejeitada",
};
const PAYMENT_TONE: Record<PaymentStatus, string> = {
  aguardando_pagamento: "bg-warning/15 text-warning-foreground",
  paga: "bg-success/15 text-success",
};
const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  aguardando_pagamento: "aguarda pagamento",
  paga: "paga",
};
const EXPENSE_FILE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  pdf: "application/pdf",
};
const expenseFileMime = (file: File) =>
  file.type || EXPENSE_FILE_MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] || "";
const isExpenseFileSupported = (file: File) => {
  const mime = expenseFileMime(file);
  return mime === "application/pdf" || mime.startsWith("image/");
};

// OmniBiz sync marker 2026-08-27: mobile camera/gallery attachments accept image/* and PDF.

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-PT");
const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "-";
const fmtEur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

function DespesasPage() {
  const { user, currentCompanyId, isManager } = useAuth();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["expenses", currentCompanyId, user?.id],
    enabled: !!user?.id && !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("employee_expenses")
        .select("*")
        .eq("company_id", currentCompanyId!)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });

  const userIds = useMemo(() => Array.from(new Set(rows.map((r) => r.user_id))), [rows]);
  const { data: names = {} } = useQuery({
    queryKey: ["exp-names", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.full_name ?? "Colaborador"])) as Record<
        string,
        string
      >;
    },
  });

  const { data: companyMeta } = useQuery({
    queryKey: ["company-meta-expenses", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, primary_color")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      return data ?? null;
    },
  });

  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Pré-visualização só para imagens; PDF cai no ícone.
  useEffect(() => {
    if (!file || !expenseFileMime(file).startsWith("image/")) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /**
   * Chrome Android aborta o seletor quando o value é limpo dentro do próprio
   * onClick do input. Limpar antes do click() programático resolve e mantém a
   * possibilidade de escolher o mesmo arquivo novamente.
   */
  const openPicker = (ref: React.RefObject<HTMLInputElement>) => {
    const input = ref.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const selected = input.files?.[0] ?? null;
    if (!selected) return; // usuário cancelou: mantém o anexo anterior
    if (selected.size > 20 * 1024 * 1024) {
      toast.error("O comprovante deve ter no máximo 20 MB.");
      input.value = "";
      return;
    }
    if (!isExpenseFileSupported(selected)) {
      toast.error("Formato não suportado. Use uma imagem (JPG, PNG, WEBP, HEIC) ou PDF.");
      input.value = "";
      return;
    }
    setFile(selected);
    toast.success("Comprovante anexado. Envie a despesa para guardar.");
  };


  const create = useMutation({
    mutationFn: async () => {
      if (!currentCompanyId || !user?.id) throw new Error("Empresa não selecionada");
      const value = Number(amount.replace(",", "."));
      if (!Number.isFinite(value) || value < 0) throw new Error("Valor inválido");
      if (!reason.trim()) throw new Error("Indique o motivo");
      const { data: expense, error } = await (supabase as any).from("employee_expenses").insert({
        company_id: currentCompanyId,
        user_id: user.id,
        expense_date: expenseDate,
        amount: value,
        reason: reason.trim(),
        notes: notes.trim() || null,
      }).select("id").single();
      if (error) throw error;
      if (!file) return { attachmentError: null as string | null };

      // Tie the object path to the expense record. The proof is optional,
      // so a storage failure must not discard the expense itself.
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${currentCompanyId}/${user.id}/${expense.id}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from("employee-expenses").upload(path, file, {
        contentType: expenseFileMime(file),
        upsert: false,
      });
      if (up.error) return { attachmentError: up.error.message };

      const { error: attachError } = await (supabase as any)
        .from("employee_expenses")
        .update({
          attachment_path: path,
          attachment_mime: expenseFileMime(file) || null,
          attachment_size: file.size,
        })
        .eq("id", expense.id);
      if (attachError) {
        await supabase.storage.from("employee-expenses").remove([path]);
        return { attachmentError: attachError.message };
      }
      return { attachmentError: null as string | null };
    },
    onSuccess: (result) => {
      toast.success(
        result.attachmentError
          ? "Despesa salva, porém o comprovante não foi anexado."
          : "Despesa enviada para aprovação",
      );
      if (result.attachmentError) toast.error(`Comprovante: ${result.attachmentError}`);
      setAmount("");
      setReason("");
      setNotes("");
      setFile(null);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao enviar"),
  });

  const decide = useMutation({
    mutationFn: async (vars: { id: string; action: "aprovar" | "rejeitar"; reason?: string }) => {
      const { error } = await (supabase as any).rpc("expense_decide", {
        _id: vars.id,
        _action: vars.action,
        _reason: vars.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.action === "aprovar" ? "Despesa aprovada" : "Despesa rejeitada");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const markPayment = useMutation({
    mutationFn: async (vars: { id: string; paymentStatus: PaymentStatus }) => {
      const { error } = await (supabase as any).rpc("expense_mark_payment", {
        _id: vars.id,
        _payment_status: vars.paymentStatus,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.paymentStatus === "paga" ? "Despesa marcada como paga" : "Despesa marcada como aguardando pagamento",
      );
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar pagamento"),
  });

  const remove = useMutation({
    mutationFn: async (row: ExpenseRow) => {
      if (row.attachment_path) {
        await supabase.storage.from("employee-expenses").remove([row.attachment_path]);
      }
      const { error } = await (supabase as any).from("employee_expenses").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removida");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const [filterStatus, setFilterStatus] = useState<"all" | ExpenseStatus>("all");
  const [filterPayment, setFilterPayment] = useState<"all" | PaymentStatus>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterDateBy, setFilterDateBy] = useState<"expense_date" | "created_at">("expense_date");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const filtered = rows.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterPayment !== "all" && r.payment_status !== filterPayment) return false;
    if (filterUser !== "all" && r.user_id !== filterUser) return false;
    const comparableDate =
      filterDateBy === "expense_date" ? r.expense_date : new Date(r.created_at).toISOString().slice(0, 10);
    if (filterStartDate && comparableDate < filterStartDate) return false;
    if (filterEndDate && comparableDate > filterEndDate) return false;
    return true;
  });
  const pending = filtered.filter((r) => r.status === "pendente");
  const decided = filtered.filter((r) => r.status !== "pendente");

  const exportExpenses = (kind: "xlsx" | "pdf") => {
    if (filtered.length === 0) {
      toast.info("Não há despesas para exportar com os filtros atuais.");
      return;
    }
    const columns: ExportColumn<ExpenseRow>[] = [
      { header: "Colaborador", accessor: (r) => names[r.user_id] ?? "Colaborador", width: 120 },
      { header: "Data despesa", accessor: (r) => fmtDate(r.expense_date), width: 72 },
      { header: "Data envio", accessor: (r) => fmtDateTime(r.created_at), width: 92 },
      { header: "Valor", accessor: (r) => fmtEur(r.amount), width: 64 },
      { header: "Motivo", accessor: (r) => r.reason, width: 140 },
      { header: "Estado", accessor: (r) => STATUS_LABEL[r.status], width: 72 },
      {
        header: "Pagamento",
        accessor: (r) => (r.status === "aprovada" ? PAYMENT_LABEL[r.payment_status ?? "aguardando_pagamento"] : "-"),
        width: 88,
      },
      { header: "Pago em", accessor: (r) => fmtDateTime(r.paid_at), width: 92 },
      { header: "Observações", accessor: (r) => r.notes ?? "", width: 170 },
    ];
    const subtitleParts = [
      filterDateBy === "expense_date" ? "Período por data da despesa" : "Período por data de envio",
      filterStartDate ? `De ${fmtDate(filterStartDate)}` : null,
      filterEndDate ? `Até ${fmtDate(filterEndDate)}` : null,
      filterStatus !== "all" ? `Estado: ${STATUS_LABEL[filterStatus]}` : null,
      filterPayment !== "all" ? `Pagamento: ${PAYMENT_LABEL[filterPayment]}` : null,
      filterUser !== "all" ? `Colaborador: ${names[filterUser] ?? "Colaborador"}` : null,
    ].filter(Boolean);
    const meta = {
      fileName: `despesas-${new Date().toISOString().slice(0, 10)}`,
      title: "Despesas",
      companyName: companyMeta?.name ?? null,
      primaryColor: companyMeta?.primary_color ?? null,
      subtitle: subtitleParts.join(" · ") || null,
    };
    if (kind === "xlsx") exportToExcel(filtered, columns, meta);
    else exportToPdf(filtered, columns, meta);
  };

  const openAttachment = async (path: string) => {
    const { data } = await supabase.storage.from("employee-expenses").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Despesas</h1>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? "Aprove ou rejeite as despesas dos colaboradores."
              : "Registe despesas para serem aprovadas pelo gestor."}
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Plus className="h-4 w-4" /> Nova despesa
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="exp-date">Data</Label>
            <Input id="exp-date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="exp-amount">Valor (€)</Label>
            <Input
              id="exp-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label htmlFor="exp-reason">Motivo</Label>
            <Input
              id="exp-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: combustível obra X"
              maxLength={200}
            />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="exp-notes">Observações</Label>
            <Textarea id="exp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="md:col-span-3 space-y-2">
            {/*
              Chrome Android: um único input com accept combinado + reset de value
              dentro do onClick fazia o seletor abortar silenciosamente. Agora há
              dois inputs explícitos (galeria/arquivos e câmera), acionados por
              botões reais, com o value limpo ANTES do click() programático.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => openPicker(galleryInputRef)}>
                <Upload className="h-4 w-4" /> Escolher da galeria/arquivos
              </Button>
              <Button type="button" variant="outline" onClick={() => openPicker(cameraInputRef)}>
                <Camera className="h-4 w-4" /> Tirar foto
              </Button>
              {file && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (galleryInputRef.current) galleryInputRef.current.value = "";
                    if (cameraInputRef.current) cameraInputRef.current.value = "";
                  }}
                >
                  <XIcon className="h-4 w-4" /> Remover anexo
                </Button>
              )}
            </div>
            <input
              ref={galleryInputRef}
              id="exp-file-gallery"
              type="file"
              className="sr-only"
              accept="image/*,application/pdf"
              onChange={onPicked}
            />
            <input
              ref={cameraInputRef}
              id="exp-file-camera"
              type="file"
              className="sr-only"
              accept="image/*"
              capture="environment"
              onChange={onPicked}
            />
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
                {filePreview ? (
                  <img
                    src={filePreview}
                    alt="Pré-visualização do comprovante"
                    className="h-16 w-16 rounded-md border border-border object-cover"
                  />
                ) : (
                  <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 text-xs">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · {expenseFileMime(file) || "tipo desconhecido"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Imagem ou PDF até 20 MB (opcional).</p>
            )}
          </div>

        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            Enviar despesa
          </Button>
        </div>
      </section>

      {isManager && pending.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Aguardando aprovação ({pending.length})</h2>
          <ul className="space-y-2">
            {pending.map((r) => (
              <PendingRow
                key={r.id}
                row={r}
                name={names[r.user_id] ?? "Colaborador"}
                onOpen={openAttachment}
                onApprove={() => decide.mutate({ id: r.id, action: "aprovar" })}
                onReject={(reason) => decide.mutate({ id: r.id, action: "rejeitar", reason })}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Histórico</h2>
          <div className="flex flex-wrap gap-2">
            {isManager && (
              <>
                <Button size="sm" variant="outline" onClick={() => exportExpenses("xlsx")}>
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportExpenses("pdf")}>
                  <FileText className="h-4 w-4" /> PDF
                </Button>
              </>
            )}
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovada">Aprovada</SelectItem>
                <SelectItem value="rejeitada">Rejeitada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPayment} onValueChange={(v) => setFilterPayment(v as any)}>
              <SelectTrigger className="w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pagamentos</SelectItem>
                <SelectItem value="aguardando_pagamento">Aguarda pagamento</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
              </SelectContent>
            </Select>
            {isManager && (
              <div className="w-[240px]">
                <EmployeePicker
                  employees={Object.entries(names).map(([id, name]) => ({
                    id,
                    full_name: name,
                  }))}
                  value={filterUser === "all" ? null : filterUser}
                  onChange={(id: string) => setFilterUser(id || "all")}
                  placeholder="Todos os colaboradores"
                  ariaLabel="Filtrar por colaborador"
                />
              </div>
            )}
          </div>
        </div>
        {isManager && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">Extrair por</Label>
              <Select value={filterDateBy} onValueChange={(v) => setFilterDateBy(v as typeof filterDateBy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense_date">Data da despesa</SelectItem>
                  <SelectItem value="created_at">Data de envio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="expense-export-start" className="text-xs">
                Data inicial
              </Label>
              <Input
                id="expense-export-start"
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="expense-export-end" className="text-xs">
                Data final
              </Label>
              <Input
                id="expense-export-end"
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setFilterStartDate("");
                  setFilterEndDate("");
                }}
              >
                Limpar datas
              </Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : decided.length === 0 && pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem despesas registadas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(isManager ? decided : filtered).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {isManager ? (names[r.user_id] ?? "Colaborador") : "Você"} · {fmtEur(r.amount)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(r.expense_date)} · {r.reason}
                    {r.decision_reason ? ` · ${r.decision_reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.attachment_path && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openAttachment(r.attachment_path!)}
                      title="Abrir anexo"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.status === "aprovada" && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${PAYMENT_TONE[r.payment_status ?? "aguardando_pagamento"]}`}
                    >
                      {PAYMENT_LABEL[r.payment_status ?? "aguardando_pagamento"]}
                    </span>
                  )}
                  {isManager && r.status === "aprovada" && (r.payment_status ?? "aguardando_pagamento") !== "paga" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markPayment.isPending}
                      onClick={() => markPayment.mutate({ id: r.id, paymentStatus: "paga" })}
                    >
                      Marcar paga
                    </Button>
                  )}
                  {isManager && r.status === "aprovada" && r.payment_status === "paga" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={markPayment.isPending}
                      onClick={() => markPayment.mutate({ id: r.id, paymentStatus: "aguardando_pagamento" })}
                    >
                      Aguardar pagamento
                    </Button>
                  )}
                  {r.status === "pendente" && r.user_id === user?.id && (
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(r)} title="Apagar">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PendingRow({
  row,
  name,
  onApprove,
  onReject,
  onOpen,
}: {
  row: ExpenseRow;
  name: string;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onOpen: (path: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">
            {name} · {fmtEur(row.amount)}
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtDate(row.expense_date)} · {row.reason}
            {row.notes ? ` · ${row.notes}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {row.attachment_path && (
            <Button size="sm" variant="ghost" onClick={() => onOpen(row.attachment_path!)}>
              <Download className="h-4 w-4" /> Anexo
            </Button>
          )}
          {!rejecting && (
            <>
              <Button size="sm" onClick={onApprove}>
                <Check className="h-4 w-4" /> Aprovar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                <XIcon className="h-4 w-4" /> Rejeitar
              </Button>
            </>
          )}
        </div>
      </div>
      {rejecting && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`rj-${row.id}`}>Motivo da rejeição</Label>
          <Textarea id={`rj-${row.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRejecting(false);
                setReason("");
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" disabled={!reason.trim()} onClick={() => onReject(reason.trim())}>
              Confirmar rejeição
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
