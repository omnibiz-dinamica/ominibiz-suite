/**
 * OmniBiz · Resumo para pagamento (SUP-2026-000302, 15/11/2026).
 * Por funcionário: o que a folha de ponto contabilizou + renda, transporte,
 * alimentação, despesas, acréscimos/descontos, total, avanço e 2.º pagamento.
 * Os números vêm do banco (payroll_payment_summary). O gestor regista aqui o
 * avanço e os acréscimos/descontos do mês.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Minus, Plus, Printer, Receipt, Search, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MONTH_LABELS,
  TIMESHEET_STATUS_LABEL,
  monthLabel,
  type TimesheetStatus,
} from "@/lib/timesheet";
import { missingEmployeeRate } from "@/lib/ponto/day-type-summary";
import {
  addAdjustment,
  attachExpenses,
  detachExpense,
  expenseInclusion,
  extraRows,
  fetchPaymentSummary,
  formatMoney,
  nextMonthOf,
  paymentSummaryCsv,
  periodLabel,
  setAdvance,
  voidAdjustment,
  workRows,
  type PaymentEmployee,
} from "@/lib/ponto/payment-summary";

export const Route = createFileRoute("/app/ponto_/pagamento")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["manager", "owner", "super_admin"]}>
      <PaymentSummaryPage />
    </RoleGuard>
  );
}

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function PaymentSummaryPage() {
  const { currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  // Por defeito o mês anterior (o que se paga agora).
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const [year, setYear] = useState(prev.getUTCFullYear());
  const [month, setMonth] = useState(prev.getUTCMonth() + 1);
  const [onlyFinal, setOnlyFinal] = useState<"final" | "all">("final");
  const [search, setSearch] = useState("");
  const [advanceFor, setAdvanceFor] = useState<PaymentEmployee | null>(null);
  const [adjustFor, setAdjustFor] = useState<PaymentEmployee | null>(null);

  const key = ["payment-summary", currentCompanyId, year, month] as const;
  const q = useQuery({
    queryKey: key,
    enabled: !!currentCompanyId,
    queryFn: () => fetchPaymentSummary(currentCompanyId!, year, month),
  });
  const currency = q.data?.currency ?? "EUR";

  const employees = useMemo(() => {
    const words = norm(search).split(/\s+/).filter(Boolean);
    return (q.data?.employees ?? []).filter(
      (e) => (onlyFinal === "all" || e.final) && words.every((w) => norm(e.full_name).includes(w)),
    );
  }, [q.data, onlyFinal, search]);
  const totals = useMemo(
    () =>
      employees.reduce(
        (s, e) => ({
          total: s.total + Number(e.total ?? 0),
          advance: s.advance + Number(e.advance ?? 0),
          second: s.second + Number(e.second_payment ?? 0),
        }),
        { total: 0, advance: 0, second: 0 },
      ),
    [employees],
  );
  const pendingCount = (q.data?.employees ?? []).filter((e) => !e.final).length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["payment-summary"] });

  // SUP-301: despesas "Aguarda pagamento" ainda por incluir neste mês (todos).
  const pendingExpenses = (q.data?.employees ?? []).reduce(
    (n, e) => n + expenseInclusion(e).pending.length,
    0,
  );
  const attachAll = useMutation({
    mutationFn: () => attachExpenses({ companyId: currentCompanyId!, year, month }),
    onSuccess: (n) => {
      toast.success(
        n > 0
          ? `${n} despesa(s) incluída(s) no pagamento de ${periodLabel(year, month)}.`
          : "Não havia despesas por incluir.",
      );
      void refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exportCsv = () => {
    if (!q.data) return;
    const blob = new Blob([paymentSummaryCsv(q.data, employees)], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `resumo-pagamento-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
            <Wallet className="h-6 w-6" /> Resumo para pagamento
          </h1>
          <p className="text-sm text-muted-foreground">
            O que as folhas de ponto contabilizaram, com renda, transporte, despesas, descontos,
            avanço e 2.º pagamento — {monthLabel(month, year)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={!employees.length}
          >
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="attach-all-expenses"
            onClick={() => attachAll.mutate()}
            disabled={!currentCompanyId || pendingExpenses === 0 || attachAll.isPending}
            title="Inclui neste mês as despesas em Aguarda pagamento; em Despesas fica a indicação do mês"
          >
            <Receipt className="mr-1 h-4 w-4" /> Incluir despesas ({pendingExpenses})
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!employees.length}>
            <Download className="mr-1 h-4 w-4" /> Exportar (Excel)
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="space-y-1.5">
          <Label>Ano</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1].map(
                (y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Mês</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, i) => (
                <SelectItem key={label} value={String(i + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Folhas</Label>
          <Select value={onlyFinal} onValueChange={(v) => setOnlyFinal(v as "final" | "all")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="final">Só fechadas / enviadas à contabilidade</SelectItem>
              <SelectItem value="all">Todas (com provisórias)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-search">Pesquisar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="pay-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome do funcionário"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Carregando resumo...
        </div>
      ) : q.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <span>{(q.error as Error).message}</span>
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : employees.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {onlyFinal === "final" && pendingCount > 0
            ? `Ainda não há folhas fechadas neste mês (${pendingCount} por fechar). Feche-as no Fechamento Mensal ou escolha "Todas".`
            : "Nenhuma folha neste mês."}
        </div>
      ) : (
        <>
          <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-3 print:hidden">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Total do mês</div>
              <div className="font-semibold">{formatMoney(totals.total, currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Avanços</div>
              <div className="font-semibold">{formatMoney(totals.advance, currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">2.º pagamento</div>
              <div className="font-semibold">{formatMoney(totals.second, currency)}</div>
            </div>
          </div>
          {onlyFinal === "final" && pendingCount > 0 && (
            <p className="text-xs text-muted-foreground print:hidden">
              {pendingCount} folha(s) ainda por fechar não aparecem. Escolha "Todas" para as ver
              como provisórias.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2 print:gap-2">
            {employees.map((e) => (
              <EmployeeCard
                key={e.employee_id}
                e={e}
                currency={currency}
                onAdvance={() => setAdvanceFor(e)}
                onAdjust={() => setAdjustFor(e)}
                onChanged={refresh}
                companyId={currentCompanyId ?? ""}
                year={year}
                month={month}
              />
            ))}
          </div>
        </>
      )}

      {currentCompanyId && advanceFor && (
        <AdvanceDialog
          e={advanceFor}
          companyId={currentCompanyId}
          year={year}
          month={month}
          onClose={() => setAdvanceFor(null)}
          onDone={refresh}
        />
      )}
      {currentCompanyId && adjustFor && (
        <AdjustmentDialog
          e={adjustFor}
          companyId={currentCompanyId}
          year={year}
          month={month}
          onClose={() => setAdjustFor(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function EmployeeCard({
  e,
  currency,
  onAdvance,
  onAdjust,
  onChanged,
  companyId,
  year,
  month,
}: {
  e: PaymentEmployee;
  currency: string;
  onAdvance: () => void;
  onAdjust: () => void;
  onChanged: () => void;
  companyId: string;
  year: number;
  month: number;
}) {
  const inclusion = expenseInclusion(e);
  const attachOne = useMutation({
    mutationFn: () => attachExpenses({ companyId, year, month, employeeId: e.employee_id }),
    onSuccess: (n) => {
      toast.success(`${n} despesa(s) incluída(s) no pagamento de ${periodLabel(year, month)}.`);
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const detach = useMutation({
    mutationFn: (id: string) => detachExpense(id, "Retirada no resumo para pagamento"),
    onSuccess: () => {
      toast.success("Despesa retirada deste mês");
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const rows = [...workRows(e), ...extraRows(e)];
  const missing = missingEmployeeRate(e.by_client);
  const removeAdj = useMutation({
    mutationFn: (id: string) => voidAdjustment(id, "Removido no resumo para pagamento"),
    onSuccess: () => {
      toast.success("Removido");
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <section
      className="break-inside-avoid rounded-2xl border border-border bg-card p-4 text-sm print:rounded-none print:p-2"
      aria-label={`Resumo de ${e.full_name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase text-muted-foreground">Nome</div>
          <div className="truncate text-base font-semibold">{e.full_name}</div>
        </div>
        <Badge variant={e.final ? "secondary" : "outline"}>
          {e.final
            ? (TIMESHEET_STATUS_LABEL[e.period_status as TimesheetStatus] ?? "Fechada")
            : `Provisória · ${TIMESHEET_STATUS_LABEL[e.period_status as TimesheetStatus] ?? e.period_status}`}
        </Badge>
      </div>
      {missing && (
        <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          Há horas a 0,00: falta o valor no cadastro do funcionário.
        </div>
      )}
      <table className="mt-3 w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="w-16 py-1 text-right font-medium">Qtd.</th>
            <th className="px-2 py-1 text-left font-medium">Item</th>
            <th className="w-20 py-1 text-right font-medium">Valor</th>
            <th className="w-4" />
            <th className="w-24 py-1 text-right font-medium">Total</th>
            <th className="w-6 print:hidden" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border">
              <td className="py-1 text-right tabular-nums">{r.quantity}</td>
              <td className="px-2 py-1">{r.label}</td>
              <td className="py-1 text-right tabular-nums">{r.rate}</td>
              <td className="text-center text-muted-foreground">=</td>
              <td
                className={`py-1 text-right tabular-nums ${r.kind === "discount" ? "text-destructive" : ""}`}
              >
                {formatMoney(r.amount, currency)}
              </td>
              <td className="text-right print:hidden">
                {r.key.startsWith("j:") && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    title="Remover"
                    disabled={removeAdj.isPending}
                    onClick={() => removeAdj.mutate(r.key.slice(2))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border font-semibold">
            <td />
            <td className="px-2 py-1">Total</td>
            <td />
            <td />
            <td className="py-1 text-right tabular-nums">{formatMoney(e.total, currency)}</td>
            <td className="print:hidden" />
          </tr>
          <tr className="border-t border-border">
            <td />
            <td className="px-2 py-1">
              Avanço
              {e.notes ? <span className="text-xs text-muted-foreground"> · {e.notes}</span> : null}
            </td>
            <td />
            <td />
            <td className="py-1 text-right tabular-nums">{formatMoney(e.advance, currency)}</td>
            <td className="print:hidden" />
          </tr>
          <tr className="border-t border-border bg-primary/5 font-semibold">
            <td />
            <td className="px-2 py-1">2.º pagamento</td>
            <td />
            <td />
            <td className="py-1 text-right tabular-nums">
              {formatMoney(e.second_payment, currency)}
            </td>
            <td className="print:hidden" />
          </tr>
        </tbody>
      </table>
      {e.expenses.length > 0 && (
        <div className="mt-3 rounded-lg border border-border p-2" data-testid="payment-expenses">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Despesas ({e.expenses.length})
            </span>
            {inclusion.pending.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 print:hidden"
                disabled={!companyId || attachOne.isPending}
                onClick={() => attachOne.mutate()}
              >
                <Receipt className="mr-1 h-3.5 w-3.5" /> Incluir neste mês
              </Button>
            )}
          </div>
          <ul className="space-y-1 text-xs">
            {e.expenses.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {x.date ? `${x.date.slice(8, 10)}/${x.date.slice(5, 7)}` : "—"}
                </span>
                <span className="min-w-0 flex-1 break-words">{x.reason || "Despesa"}</span>
                <span className="tabular-nums">{formatMoney(x.amount, currency)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 ${x.attached ? "bg-success/15 text-success" : "bg-warning/15 text-warning-foreground"}`}
                >
                  {x.attached ? `Incluída em ${periodLabel(year, month)}` : "Por incluir"}
                </span>
                {x.attached && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive print:hidden"
                    title="Retirar deste mês (não se já estiver paga)"
                    aria-label="Retirar despesa deste mês"
                    disabled={detach.isPending}
                    onClick={() => detach.mutate(x.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={onAdvance}>
          <Wallet className="mr-1 h-3.5 w-3.5" /> Avanço
        </Button>
        <Button size="sm" variant="outline" onClick={onAdjust}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Acréscimo / desconto
        </Button>
      </div>
    </section>
  );
}

function AdvanceDialog({
  e,
  companyId,
  year,
  month,
  onClose,
  onDone,
}: {
  e: PaymentEmployee;
  companyId: string;
  year: number;
  month: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(e.advance ?? 0));
  const [notes, setNotes] = useState(e.notes ?? "");
  const value = Number(amount.replace(",", "."));
  const valid = Number.isFinite(value) && value >= 0;
  const save = useMutation({
    mutationFn: () =>
      setAdvance({ companyId, employeeId: e.employee_id, year, month, amount: value, notes }),
    onSuccess: () => {
      toast.success("Avanço guardado");
      onDone();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avanço · {e.full_name}</DialogTitle>
          <DialogDescription>
            Valor já adiantado neste mês. O 2.º pagamento é o total menos o avanço.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="adv-amount">Valor (€)</Label>
            <Input
              id="adv-amount"
              inputMode="decimal"
              value={amount}
              onChange={(x) => setAmount(x.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-notes">Nota (ex.: data do avanço)</Label>
            <Input
              id="adv-notes"
              value={notes}
              maxLength={200}
              onChange={(x) => setNotes(x.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending ? "A guardar..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustmentDialog({
  e,
  companyId,
  year,
  month,
  onClose,
  onDone,
}: {
  e: PaymentEmployee;
  companyId: string;
  year: number;
  month: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<"acrescimo" | "desconto">("desconto");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  // SUP-301: "transitar" — lançar já no mês seguinte (ex.: pagou-se a mais em setembro).
  const next = nextMonthOf(year, month);
  const [target, setTarget] = useState<"this" | "next">("this");
  const targetYear = target === "next" ? next.year : year;
  const targetMonth = target === "next" ? next.month : month;
  const value = Number(amount.replace(",", "."));
  const valid = Number.isFinite(value) && value > 0 && reason.trim().length > 0;
  const save = useMutation({
    mutationFn: () =>
      addAdjustment({
        companyId,
        employeeId: e.employee_id,
        year: targetYear,
        month: targetMonth,
        kind,
        amount: value,
        reason,
        label,
      }),
    onSuccess: () => {
      toast.success(
        `${kind === "desconto" ? "Desconto registado" : "Acréscimo registado"} em ${monthLabel(targetMonth, targetYear)}`,
      );
      onDone();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acréscimo ou desconto · {e.full_name}</DialogTitle>
          <DialogDescription>
            Entra no total do mês escolhido e fica registado no histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "desconto" ? "default" : "outline"}
              onClick={() => setKind("desconto")}
            >
              <Minus className="mr-1 h-3.5 w-3.5" /> Desconto
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "acrescimo" ? "default" : "outline"}
              onClick={() => setKind("acrescimo")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Acréscimo
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Aplicar em</Label>
            <Select value={target} onValueChange={(v) => setTarget(v as "this" | "next")}>
              <SelectTrigger data-testid="adj-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this">Este mês · {monthLabel(month, year)}</SelectItem>
                <SelectItem value="next">
                  Mês seguinte · {monthLabel(next.month, next.year)} (transitar)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-label">Nome curto (aparece no resumo)</Label>
            <Input
              id="adj-label"
              value={label}
              maxLength={60}
              placeholder="Ex.: Multa estacionamento"
              onChange={(x) => setLabel(x.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">Valor (€)</Label>
            <Input
              id="adj-amount"
              inputMode="decimal"
              value={amount}
              onChange={(x) => setAmount(x.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Motivo</Label>
            <Textarea
              id="adj-reason"
              value={reason}
              maxLength={1000}
              onChange={(x) => setReason(x.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending ? "A guardar..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
