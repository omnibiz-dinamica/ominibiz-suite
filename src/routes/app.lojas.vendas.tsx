import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { RetailShell, StateBox } from "@/components/retail/RetailShell";
import { ReceiptButton } from "@/components/retail/ReceiptButton";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { SALES_PAGE, useSaleDetail, useSales } from "@/lib/retail-sales";
import {
  PAYMENT_LABEL,
  RETAIL_OPERATOR_ROLES,
  RETAIL_ROLES,
  formatMoney,
  formatQty,
  retailErrorMessage,
  retailSaleCancel,
  useRetailCompany,
  useRetailUnits,
  type RetailSale,
} from "@/lib/retail";

export const Route = createFileRoute("/app/lojas/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas · Lojas · OmniBiz" },
      { name: "description", content: "Vendas por loja, detalhe, comprovativo e cancelamento." },
      { property: "og:title", content: "Vendas · Lojas · OmniBiz" },
      {
        property: "og:description",
        content: "Vendas por loja, detalhe, comprovativo e cancelamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const { locale, currency } = useRetailCompany();
  const units = useRetailUnits();
  const [unitId, setUnitId] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const sales = useSales({ unitId, status, from, to, q, page });
  const money = (v: number | null | undefined) => formatMoney(v ?? 0, locale, currency);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const unitName = (id: string) => units.data?.find((u) => u.id === id)?.name ?? "—";
  const rows = (sales.data ?? []).slice(0, SALES_PAGE);
  const reset = (fn: () => void) => () => {
    fn();
    setPage(0);
  };

  return (
    <RetailShell
      title="Vendas"
      desc="Consulta de vendas, comprovativo e cancelamento."
      allow={[...RETAIL_OPERATOR_ROLES]}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          className="w-56"
          placeholder="Nº da venda ou cliente"
          value={q}
          onChange={(e) => reset(() => setQ(e.target.value))()}
        />
        <Input
          type="date"
          className="w-40"
          aria-label="De"
          value={from}
          onChange={(e) => reset(() => setFrom(e.target.value))()}
        />
        <Input
          type="date"
          className="w-40"
          aria-label="Até"
          value={to}
          onChange={(e) => reset(() => setTo(e.target.value))()}
        />
        <Select value={unitId} onValueChange={(v) => reset(() => setUnitId(v))()}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as lojas</SelectItem>
            {(units.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => reset(() => setStatus(v))()}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {sales.isLoading ? (
        <StateBox kind="loading" />
      ) : sales.isError ? (
        <StateBox kind="error" text={retailErrorMessage(sales.error)} />
      ) : rows.length === 0 ? (
        <StateBox kind="empty" text="Sem vendas para estes filtros." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpen(s.id)}
                className="grid w-full gap-1 px-4 py-2 text-left text-sm hover:bg-muted/50 sm:grid-cols-[9rem_8rem_1fr_auto] sm:items-center sm:gap-3"
              >
                <span className="text-xs text-muted-foreground">
                  {fmt.format(new Date(s.created_at))}
                </span>
                <span className="font-medium">{s.code}</span>
                <span className="truncate text-muted-foreground">
                  {unitName(s.unit_id)}
                  {s.customer_name ? ` · ${s.customer_name}` : ""}
                  {s.status === "cancelada" && (
                    <Badge variant="destructive" className="ml-2">
                      Cancelada
                    </Badge>
                  )}
                </span>
                <span
                  className={
                    s.status === "cancelada" ? "text-right line-through" : "text-right font-medium"
                  }
                >
                  {money(s.total)}
                </span>
              </button>
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
          disabled={(sales.data ?? []).length <= SALES_PAGE}
          onClick={() => setPage(page + 1)}
        >
          Seguinte
        </Button>
      </div>
      <SaleSheet saleId={open} onClose={() => setOpen(null)} />
    </RetailShell>
  );
}

function SaleSheet({ saleId, onClose }: { saleId: string | null; onClose: () => void }) {
  const { effectiveRole } = useAuth();
  const { locale, currency, country } = useRetailCompany();
  const d = useSaleDetail(saleId);
  const [cancelling, setCancelling] = useState<RetailSale | null>(null);
  const money = (v: number | null | undefined) => formatMoney(v ?? 0, locale, currency);
  const isManager = !!effectiveRole && (RETAIL_ROLES as readonly string[]).includes(effectiveRole);
  const s = d.data?.sale;
  return (
    <Sheet open={!!saleId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{s ? `Venda ${s.code}` : "Venda"}</SheetTitle>
        </SheetHeader>
        {d.isLoading ? (
          <StateBox kind="loading" />
        ) : d.isError || !d.data || !s ? (
          <StateBox kind="error" text={retailErrorMessage(d.error)} />
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            {s.status === "cancelada" && (
              <p className="rounded-md border border-destructive p-2 text-destructive">
                Cancelada: {s.cancel_reason}
              </p>
            )}
            {(s.customer_name || s.customer_tax_id || s.customer_phone || s.customer_email) && (
              <div className="text-muted-foreground">
                {[
                  s.customer_name,
                  s.customer_tax_id &&
                    `${country === "BR" ? "CPF/CNPJ" : "NIF"} ${s.customer_tax_id}`,
                  s.customer_phone,
                  s.customer_email,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            <ul className="divide-y divide-border rounded-md border border-border">
              {d.data.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    {i.product_name}
                    <span className="block text-xs text-muted-foreground">
                      {formatQty(i.quantity, locale)} {i.product_unit} × {money(i.unit_price)}
                    </span>
                  </span>
                  <span className="whitespace-nowrap">{money(i.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{money(s.subtotal)}</dd>
              </div>
              {s.discount > 0 && (
                <div className="flex justify-between">
                  <dt>Desconto</dt>
                  <dd>− {money(s.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd>{money(s.total)}</dd>
              </div>
              {d.data.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-muted-foreground">
                  <dt>{PAYMENT_LABEL[p.method] ?? p.method}</dt>
                  <dd>{money(p.amount)}</dd>
                </div>
              ))}
              {s.change_amount > 0 && (
                <div className="flex justify-between">
                  <dt>Troco</dt>
                  <dd>{money(s.change_amount)}</dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              <ReceiptButton saleId={s.id} />
              {isManager && s.status === "concluida" && (
                <Button variant="destructive" onClick={() => setCancelling(s)}>
                  <Ban className="mr-1 h-4 w-4" /> Cancelar venda
                </Button>
              )}
            </div>
          </div>
        )}
        {cancelling && <CancelDialog sale={cancelling} onClose={() => setCancelling(null)} />}
      </SheetContent>
    </Sheet>
  );
}

function CancelDialog({ sale, onClose }: { sale: RetailSale; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("O motivo é obrigatório.");
      return retailSaleCancel(sale.id, reason.trim());
    },
    onSuccess: () => {
      toast.success("Venda cancelada e estoque devolvido");
      for (const k of ["retail-sales", "retail-sale", "retail-balances", "retail-cash-totals"])
        qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancelar venda {sale.code}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O estoque volta para a loja e o valor sai do caixa aberto. Só é possível enquanto o caixa
          desta venda estiver aberto.
        </p>
        <Input placeholder="Motivo *" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="destructive" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "A cancelar…" : "Cancelar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
