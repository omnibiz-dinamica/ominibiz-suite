import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CreditCard, Check, X as XIcon, Upload, Download, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/despesas")({ component: DespesasPage });

type ExpenseStatus = "pendente" | "aprovada" | "rejeitada";
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

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-PT");
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

  const userIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.user_id))),
    [rows],
  );
  const { data: names = {} } = useQuery({
    queryKey: ["exp-names", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.full_name ?? "Colaborador"])) as Record<string, string>;
    },
  });

  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!currentCompanyId || !user?.id) throw new Error("Empresa não selecionada");
      const value = Number(amount.replace(",", "."));
      if (!Number.isFinite(value) || value < 0) throw new Error("Valor inválido");
      if (!reason.trim()) throw new Error("Indique o motivo");
      let attachmentPath: string | null = null;
      let attachmentMime: string | null = null;
      let attachmentSize: number | null = null;
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${currentCompanyId}/${user.id}/${Date.now()}-${safe}`;
        const up = await supabase.storage.from("employee-expenses").upload(path, file);
        if (up.error) throw up.error;
        attachmentPath = path;
        attachmentMime = file.type;
        attachmentSize = file.size;
      }
      const { error } = await (supabase as any).from("employee_expenses").insert({
        company_id: currentCompanyId,
        user_id: user.id,
        expense_date: expenseDate,
        amount: value,
        reason: reason.trim(),
        notes: notes.trim() || null,
        attachment_path: attachmentPath,
        attachment_mime: attachmentMime,
        attachment_size: attachmentSize,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa enviada para aprovação");
      setAmount(""); setReason(""); setNotes(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao enviar"),
  });

  const decide = useMutation({
    mutationFn: async (vars: { id: string; action: "aprovar" | "rejeitar"; reason?: string }) => {
      const { error } = await (supabase as any).rpc("expense_decide", {
        _id: vars.id, _action: vars.action, _reason: vars.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.action === "aprovar" ? "Despesa aprovada" : "Despesa rejeitada");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const remove = useMutation({
    mutationFn: async (row: ExpenseRow) => {
      if (row.attachment_path) {
        await supabase.storage.from("employee-expenses").remove([row.attachment_path]);
      }
      const { error } = await (supabase as any)
        .from("employee_expenses").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removida");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const [filterStatus, setFilterStatus] = useState<"all" | ExpenseStatus>("all");
  const [filterUser, setFilterUser] = useState<string>("all");

  const filtered = rows.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterUser !== "all" && r.user_id !== filterUser) return false;
    return true;
  });
  const pending = filtered.filter((r) => r.status === "pendente");
  const decided = filtered.filter((r) => r.status !== "pendente");

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
            {isManager ? "Aprove ou rejeite as despesas dos colaboradores." : "Registe despesas para serem aprovadas pelo gestor."}
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> Nova despesa</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="exp-date">Data</Label>
            <Input id="exp-date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="exp-amount">Valor (€)</Label>
            <Input id="exp-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label htmlFor="exp-reason">Motivo</Label>
            <Input id="exp-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: combustível obra X" maxLength={200} />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="exp-notes">Observações</Label>
            <Textarea id="exp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="md:col-span-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
              <Upload className="h-4 w-4" />
              {file ? file.name : "Anexar foto/PDF"}
              <input
                type="file" hidden accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
                <XIcon className="h-4 w-4" /> Remover anexo
              </Button>
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
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovada">Aprovada</SelectItem>
                <SelectItem value="rejeitada">Rejeitada</SelectItem>
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
                  onChange={(id) => setFilterUser(id || "all")}
                  placeholder="Todos os colaboradores"
                  ariaLabel="Filtrar por colaborador"
                />
              </div>
            )}
          </div>
        </div>
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
                    {isManager ? names[r.user_id] ?? "Colaborador" : "Você"} · {fmtEur(r.amount)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(r.expense_date)} · {r.reason}
                    {r.decision_reason ? ` · ${r.decision_reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.attachment_path && (
                    <Button size="icon" variant="ghost" onClick={() => openAttachment(r.attachment_path!)} title="Abrir anexo">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
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
  row, name, onApprove, onReject, onOpen,
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
          <div className="font-medium">{name} · {fmtEur(row.amount)}</div>
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
              <Button size="sm" onClick={onApprove}><Check className="h-4 w-4" /> Aprovar</Button>
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
            <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setReason(""); }}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={!reason.trim()} onClick={() => onReject(reason.trim())}>Confirmar rejeição</Button>
          </div>
        </div>
      )}
    </li>
  );
}