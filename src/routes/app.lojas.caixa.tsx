import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Lock, Unlock } from "lucide-react";
import { RetailShell, StateBox } from "@/components/retail/RetailShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCashMovements, useCashSessions } from "@/lib/retail-sales";
import {
  PAYMENT_LABEL,
  RETAIL_OPERATOR_ROLES,
  formatMoney,
  retailCashClose,
  retailCashMove,
  retailCashOpen,
  retailCashTotals,
  retailErrorMessage,
  useOpenCashSession,
  useRetailCompany,
  useRetailUnits,
  type CashSession,
  type CashTotals,
  type PaymentMethod,
} from "@/lib/retail";

export const Route = createFileRoute("/app/lojas/caixa")({
  head: () => ({
    meta: [
      { title: "Caixa · Lojas · OmniBiz" },
      { name: "description", content: "Abertura, sangria, suprimento e fecho de caixa por loja." },
      { property: "og:title", content: "Caixa · Lojas · OmniBiz" },
      {
        property: "og:description",
        content: "Abertura, sangria, suprimento e fecho de caixa por loja.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CashPage,
});

const parseNum = (v: string) => Number(v.replace(",", "."));

function CashPage() {
  const { locale, currency } = useRetailCompany();
  const units = useRetailUnits();
  const activeUnits = (units.data ?? []).filter((u) => u.active);
  const [pick, setPick] = useState("");
  const unitId = activeUnits.some((u) => u.id === pick) ? pick : (activeUnits[0]?.id ?? "");
  const session = useOpenCashSession(unitId);
  const money = (v: number | null | undefined) => formatMoney(v ?? 0, locale, currency);

  return (
    <RetailShell
      title="Caixa"
      desc="Abertura, sangria, suprimento e fecho com conferência."
      allow={[...RETAIL_OPERATOR_ROLES]}
      actions={
        activeUnits.length > 1 ? (
          <Select value={unitId} onValueChange={setPick}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Loja" />
            </SelectTrigger>
            <SelectContent>
              {activeUnits.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
    >
      {units.isLoading ? (
        <StateBox kind="loading" />
      ) : units.isError ? (
        <StateBox kind="error" text={retailErrorMessage(units.error)} />
      ) : !activeUnits.length ? (
        <StateBox kind="empty" text="Nenhuma loja disponível para si." />
      ) : session.isLoading ? (
        <StateBox kind="loading" />
      ) : session.isError ? (
        <StateBox kind="error" text={retailErrorMessage(session.error)} />
      ) : session.data ? (
        <OpenSession session={session.data} money={money} />
      ) : (
        <OpenForm unitId={unitId} unitName={activeUnits.find((u) => u.id === unitId)?.name ?? ""} />
      )}
      {unitId && <SessionHistory unitId={unitId} money={money} />}
    </RetailShell>
  );
}

function invalidateCash(qc: ReturnType<typeof useQueryClient>) {
  for (const k of [
    "retail-open-session",
    "retail-cash-sessions",
    "retail-cash-movements",
    "retail-cash-totals",
  ])
    qc.invalidateQueries({ queryKey: [k] });
}

function OpenForm({ unitId, unitName }: { unitId: string; unitName: string }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const open = useMutation({
    mutationFn: async () => {
      const v = amount.trim() === "" ? 0 : parseNum(amount);
      if (!Number.isFinite(v) || v < 0) throw new Error("O valor inicial deve ser 0 ou mais.");
      return retailCashOpen(unitId, v);
    },
    onSuccess: () => {
      toast.success("Caixa aberto");
      invalidateCash(qc);
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 font-medium">
        <Lock className="h-4 w-4" /> Caixa fechado · {unitName}
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Valor inicial em dinheiro (fundo de troco)</span>
          <Input
            className="w-48"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <Button disabled={open.isPending} onClick={() => open.mutate()}>
          <Unlock className="mr-1 h-4 w-4" /> {open.isPending ? "A abrir…" : "Abrir caixa"}
        </Button>
      </div>
    </section>
  );
}

function OpenSession({
  session,
  money,
}: {
  session: CashSession;
  money: (v: number | null | undefined) => string;
}) {
  const { locale } = useRetailCompany();
  const totals = useQuery({
    queryKey: ["retail-cash-totals", session.id],
    queryFn: () => retailCashTotals(session.id),
    refetchInterval: 30_000,
  });
  const moves = useCashMovements(session.id);
  const [moveKind, setMoveKind] = useState<null | "sangria" | "suprimento">(null);
  const [closing, setClosing] = useState(false);
  const t = totals.data;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          <Badge>Aberto</Badge> desde {fmt.format(new Date(session.opened_at))}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMoveKind("sangria")}>
            <ArrowUpFromLine className="mr-1 h-4 w-4" /> Sangria
          </Button>
          <Button variant="outline" onClick={() => setMoveKind("suprimento")}>
            <ArrowDownToLine className="mr-1 h-4 w-4" /> Suprimento
          </Button>
          <Button onClick={() => setClosing(true)}>
            <Lock className="mr-1 h-4 w-4" /> Fechar caixa
          </Button>
        </div>
      </div>
      {totals.isLoading ? (
        <StateBox kind="loading" />
      ) : totals.isError || !t ? (
        <StateBox kind="error" text={retailErrorMessage(totals.error)} />
      ) : (
        <TotalsGrid t={t} money={money} />
      )}
      {(moves.data ?? []).length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {moves.data!.map((m) => (
            <li key={m.id} className="flex justify-between gap-2 px-3 py-2">
              <span className="min-w-0 truncate">
                <Badge variant="secondary" className="mr-2">
                  {m.kind === "sangria" ? "Sangria" : "Suprimento"}
                </Badge>
                {m.reason}
              </span>
              <span className="whitespace-nowrap">
                {m.kind === "sangria" ? "−" : "+"}
                {money(m.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {moveKind && (
        <CashMoveDialog session={session} kind={moveKind} onClose={() => setMoveKind(null)} />
      )}
      {closing && t && (
        <CloseDialog
          session={session}
          expected={t.expected_cash}
          money={money}
          onClose={() => setClosing(false)}
        />
      )}
    </section>
  );
}

function TotalsGrid({
  t,
  money,
}: {
  t: CashTotals;
  money: (v: number | null | undefined) => string;
}) {
  const methods = Object.entries(t.by_method ?? {}) as [PaymentMethod, number][];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Vendas"
        value={`${t.sales_count}`}
        hint={t.cancelled_count ? `${t.cancelled_count} cancelada(s)` : undefined}
      />
      <Stat label="Total vendido" value={money(t.sales_total)} />
      <Stat label="Dinheiro esperado na gaveta" value={money(t.expected_cash)} strong />
      <Stat
        label="Fundo inicial"
        value={money(t.opening_amount)}
        hint={`Sangrias ${money(t.sangria_total)} · Suprimentos ${money(t.suprimento_total)} · Troco ${money(t.change_total)}`}
      />
      {methods.length > 0 && (
        <div className="rounded-md border border-border p-3 text-sm sm:col-span-2 lg:col-span-4">
          <p className="mb-1 text-muted-foreground">Por forma de pagamento</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {methods.map(([m, v]) => (
              <span key={m}>
                {PAYMENT_LABEL[m] ?? m}: <strong>{money(Number(v))}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? "text-xl font-semibold text-primary" : "text-lg font-medium"}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CashMoveDialog({
  session,
  kind,
  onClose,
}: {
  session: CashSession;
  kind: "sangria" | "suprimento";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const run = useMutation({
    mutationFn: async () => {
      const v = parseNum(amount);
      if (!Number.isFinite(v) || v <= 0) throw new Error("Informe um valor maior que zero.");
      if (!reason.trim()) throw new Error("O motivo é obrigatório.");
      return retailCashMove({
        sessionId: session.id,
        kind,
        amount: v,
        reason: reason.trim(),
        idempotencyKey: key,
      });
    },
    onSuccess: () => {
      toast.success(kind === "sangria" ? "Sangria registada" : "Suprimento registado");
      invalidateCash(qc);
      onClose();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {kind === "sangria" ? "Sangria (retirar dinheiro)" : "Suprimento (pôr dinheiro)"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            inputMode="decimal"
            placeholder="Valor"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            placeholder={
              kind === "sangria"
                ? "Motivo (ex.: depósito no banco)"
                : "Motivo (ex.: reforço de troco)"
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "A registar…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({
  session,
  expected,
  money,
  onClose,
}: {
  session: CashSession;
  expected: number;
  money: (v: number | null | undefined) => string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const c = parseNum(counted);
  const diff =
    Number.isFinite(c) && counted.trim() !== "" ? Math.round((c - expected) * 100) / 100 : null;
  const run = useMutation({
    mutationFn: async () => {
      if (diff === null || c < 0) throw new Error("Conte o dinheiro da gaveta e informe o valor.");
      if (diff !== 0 && !notes.trim()) throw new Error("Há diferença: explique nas observações.");
      return retailCashClose(session.id, c, notes.trim() || undefined);
    },
    onSuccess: (r) => {
      toast.success(
        r.difference === 0
          ? "Caixa fechado sem diferenças"
          : `Caixa fechado · diferença ${money(r.difference)}`,
      );
      invalidateCash(qc);
      onClose();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fechar caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Dinheiro esperado na gaveta: <strong>{money(expected)}</strong>
          </p>
          <label className="block space-y-1">
            <span className="text-muted-foreground">Dinheiro contado *</span>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
            />
          </label>
          {diff !== null && (
            <p className={diff === 0 ? "text-primary" : "text-destructive"}>
              {diff === 0
                ? "Sem diferença."
                : `${diff > 0 ? "Sobra" : "Falta"} de ${money(Math.abs(diff))}.`}
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-muted-foreground">Observações {diff ? "*" : ""}</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <p className="text-xs text-muted-foreground">
            Depois de fechado, as vendas deste caixa não podem ser canceladas.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "A fechar…" : "Fechar caixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionHistory({
  unitId,
  money,
}: {
  unitId: string;
  money: (v: number | null | undefined) => string;
}) {
  const { locale } = useRetailCompany();
  const [page, setPage] = useState(0);
  const list = useCashSessions(unitId, page);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const rows = (list.data ?? []).filter((s) => s.status === "fechada").slice(0, 30);
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Caixas anteriores</h2>
      {list.isLoading ? (
        <StateBox kind="loading" />
      ) : list.isError ? (
        <StateBox kind="error" text={retailErrorMessage(list.error)} />
      ) : rows.length === 0 ? (
        <StateBox kind="empty" text="Ainda não há caixas fechados." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
          {rows.map((s) => (
            <li
              key={s.id}
              className="grid gap-1 px-4 py-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4"
            >
              <span>
                {fmt.format(new Date(s.opened_at))} →{" "}
                {s.closed_at ? fmt.format(new Date(s.closed_at)) : "—"}
              </span>
              <span className="text-muted-foreground">
                {s.totals?.sales_count ?? 0} vendas · {money(s.totals?.sales_total)}
              </span>
              <span>
                Esperado {money(s.expected_cash)} · Contado {money(s.counted_cash)}
              </span>
              <span className={s.difference ? "font-medium text-destructive" : "text-primary"}>
                {s.difference ? `Dif. ${money(s.difference)}` : "Sem diferença"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={(list.data ?? []).length <= 30}
          onClick={() => setPage(page + 1)}
        >
          Seguinte
        </Button>
      </div>
    </section>
  );
}
