import { useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Search, ShoppingCart, Trash2, UserRound } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth";
import { normalizeSearch } from "@/lib/messages/format";
import { ReceiptButton } from "@/components/retail/ReceiptButton";
import {
  PAYMENT_LABEL,
  RETAIL_OPERATOR_ROLES,
  RETAIL_ROLES,
  computeCart,
  formatMoney,
  formatQty,
  paymentMethodsFor,
  retailErrorMessage,
  retailSaleCreate,
  round2,
  useOpenCashSession,
  useRetailBalances,
  useRetailCategories,
  useRetailCompany,
  useRetailProducts,
  useRetailUnits,
  type PaymentMethod,
  type SaleCustomer,
} from "@/lib/retail";

export const Route = createFileRoute("/app/lojas/pdv")({
  head: () => ({
    meta: [
      { title: "PDV · Lojas · OmniBiz" },
      {
        name: "description",
        content: "Ponto de venda: carrinho, pagamentos, troco e comprovativo.",
      },
      { property: "og:title", content: "PDV · Lojas · OmniBiz" },
      {
        property: "og:description",
        content: "Ponto de venda: carrinho, pagamentos, troco e comprovativo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PdvPage,
});

const UNIT_KEY = "omnibiz:retail:pdv-unit";
const readUnit = () => {
  try {
    return localStorage.getItem(UNIT_KEY) ?? "";
  } catch {
    return "";
  }
};
const saveUnit = (id: string) => {
  try {
    localStorage.setItem(UNIT_KEY, id);
  } catch {
    /* armazenamento indisponível: só não lembra a loja */
  }
};

type CartLine = { productId: string; quantity: number; qtyText?: string };
type PayLine = { key: string; method: PaymentMethod; amount: string };
const parseNum = (v: string) => Number(v.replace(",", "."));

function PdvPage() {
  const { effectiveRole, profile } = useAuth();
  const { country, locale, currency } = useRetailCompany();
  const units = useRetailUnits();
  const products = useRetailProducts();
  const cats = useRetailCategories();
  const balances = useRetailBalances();
  const qc = useQueryClient();

  const activeUnits = (units.data ?? []).filter((u) => u.active);
  const [unitPick, setUnitPick] = useState<string>(readUnit);
  const unitId = activeUnits.some((u) => u.id === unitPick) ? unitPick : (activeUnits[0]?.id ?? "");
  const unit = activeUnits.find((u) => u.id === unitId);
  const session = useOpenCashSession(unitId);
  const isManager = !!effectiveRole && (RETAIL_ROLES as readonly string[]).includes(effectiveRole);
  const methods = paymentMethodsFor(country);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [customer, setCustomer] = useState<SaleCustomer>({});
  const [pays, setPays] = useState<PayLine[]>([
    { key: crypto.randomUUID(), method: "dinheiro", amount: "" },
  ]);
  const saleKey = useRef<string>(crypto.randomUUID());
  const [done, setDone] = useState<null | {
    code: string;
    total: number;
    change: number;
    saleId: string;
  }>(null);

  const stock = (pid: string) =>
    (balances.data ?? []).find((b) => b.unit_id === unitId && b.product_id === pid)?.quantity ?? 0;
  const sellable = useMemo(() => (products.data ?? []).filter((p) => p.active), [products.data]);
  const shown = useMemo(() => {
    const term = normalizeSearch(q);
    return sellable.filter(
      (p) =>
        (cat === "all" || p.category_id === cat) &&
        (!term ||
          normalizeSearch(p.name).includes(term) ||
          (p.sku ?? "").toLowerCase().includes(term) ||
          (p.barcode ?? "").includes(q.trim())),
    );
  }, [sellable, q, cat]);

  const priced = cart
    .map((l) => ({ ...l, p: sellable.find((p) => p.id === l.productId) }))
    .filter((l): l is CartLine & { p: NonNullable<typeof l.p> } => !!l.p);
  const payInputs = pays.map((p) => ({ method: p.method, amount: parseNum(p.amount) || 0 }));
  const calc = computeCart(
    priced.map((l) => ({ quantity: l.quantity, price: Number(l.p.price) })),
    parseNum(discount) || 0,
    payInputs,
  );
  const maxDiscount = unit
    ? round2((calc.subtotal * Number(unit.max_discount_pct ?? 10)) / 100)
    : 0;
  const discountTooHigh = !isManager && calc.discount > maxDiscount;
  const stockProblem = priced.find((l) => l.quantity > stock(l.productId));

  const add = (pid: string, by = 1) =>
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === pid);
      if (i < 0) return by > 0 ? [...c, { productId: pid, quantity: by }] : c;
      const next = round2(c[i].quantity + by);
      return next <= 0
        ? c.filter((_, j) => j !== i)
        : c.map((l, j) => (j === i ? { ...l, quantity: next, qtyText: undefined } : l));
    });

  const onSearchEnter = () => {
    const term = q.trim();
    if (!term) return;
    const exact = sellable.find(
      (p) => p.barcode === term || (p.sku ?? "").toLowerCase() === term.toLowerCase(),
    );
    const hit = exact ?? (shown.length === 1 ? shown[0] : null);
    if (hit) {
      add(hit.id);
      setQ("");
    } else toast.info("Nenhum produto único para esse código. Escolha na lista.");
  };

  const reset = () => {
    setCart([]);
    setDiscount("");
    setCustomer({});
    setPays([{ key: crypto.randomUUID(), method: "dinheiro", amount: "" }]);
    saleKey.current = crypto.randomUUID();
  };

  const finish = useMutation({
    mutationFn: async () => {
      if (!unitId || !session.data) throw new Error("Abra o caixa desta loja antes de vender.");
      if (!calc.ok) throw new Error(calc.problems[0]);
      if (discountTooHigh)
        throw new Error(`Desconto acima do limite da loja (${unit?.max_discount_pct}%).`);
      if (stockProblem) throw new Error(`Estoque insuficiente de ${stockProblem.p.name}.`);
      const hasCustomer = Object.values(customer).some((v) => (v ?? "").trim());
      return retailSaleCreate({
        unitId,
        lines: priced.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        payments: payInputs.filter((p) => p.amount > 0),
        discount: calc.discount,
        customer: hasCustomer ? customer : null,
        // A mesma chave é reutilizada se o pedido for repetido (rede, duplo clique): não duplica a venda.
        idempotencyKey: saleKey.current,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["retail-balances"] });
      qc.invalidateQueries({ queryKey: ["retail-sales"] });
      qc.invalidateQueries({ queryKey: ["retail-cash-totals"] });
      setDone({
        code: r.code ?? "",
        total: Number(r.total ?? calc.total),
        change: Number(r.change_amount ?? calc.change),
        saleId: r.sale_id,
      });
      reset();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const money = (v: number) => formatMoney(v, locale, currency);

  const body = (() => {
    if (units.isLoading || products.isLoading || balances.isLoading)
      return <StateBox kind="loading" />;
    if (units.isError || products.isError)
      return <StateBox kind="error" text={retailErrorMessage(units.error ?? products.error)} />;
    if (!activeUnits.length)
      return (
        <StateBox
          kind="empty"
          text={
            isManager
              ? "Crie uma loja ativa primeiro."
              : "Ainda não está vinculado a nenhuma loja. Fale com o gestor."
          }
        />
      );
    if (session.isLoading) return <StateBox kind="loading" />;
    if (!session.data)
      return (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm">
          <p className="mb-3 text-muted-foreground">O caixa de {unit?.name} está fechado.</p>
          <Button asChild>
            <Link to="/app/lojas/caixa">Abrir caixa</Link>
          </Button>
        </div>
      );
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <section className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-8"
              placeholder="Nome, SKU ou código de barras (Enter adiciona)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearchEnter()}
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            <Button
              size="sm"
              variant={cat === "all" ? "default" : "outline"}
              onClick={() => setCat("all")}
            >
              Todos
            </Button>
            {(cats.data ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={cat === c.id ? "default" : "outline"}
                  onClick={() => setCat(c.id)}
                >
                  {c.name}
                </Button>
              ))}
          </div>
          {shown.length === 0 ? (
            <StateBox kind="empty" text="Nenhum produto encontrado." />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((p) => {
                const s = stock(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={s <= 0}
                      onClick={() => add(p.id)}
                      className="flex h-full w-full flex-col items-start gap-1 rounded-lg border border-border bg-card p-3 text-left text-sm transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="line-clamp-2 font-medium">{p.name}</span>
                      <span className="text-primary">{money(Number(p.price))}</span>
                      <span
                        className={
                          s <= 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                        }
                      >
                        {s <= 0 ? "Sem estoque" : `${formatQty(s, locale)} ${p.unit}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-3 rounded-lg border border-border bg-card p-3 lg:sticky lg:top-4 lg:self-start">
          <h2 className="flex items-center gap-2 font-medium">
            <ShoppingCart className="h-4 w-4" /> Carrinho
          </h2>
          {priced.length === 0 ? (
            <p className="text-sm text-muted-foreground">Toque num produto para adicionar.</p>
          ) : (
            <ul className="divide-y divide-border">
              {priced.map((l) => {
                const over = l.quantity > stock(l.productId);
                return (
                  <li key={l.productId} className="py-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{l.p.name}</span>
                      <span className="font-medium">
                        {money(round2(l.quantity * Number(l.p.price)))}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        aria-label="Menos"
                        onClick={() => add(l.productId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        className="h-7 w-16 text-center"
                        inputMode="decimal"
                        value={l.qtyText ?? String(l.quantity)}
                        aria-label="Quantidade"
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = parseNum(raw);
                          setCart((c) =>
                            c.map((x) =>
                              x.productId === l.productId
                                ? {
                                    ...x,
                                    qtyText: raw,
                                    quantity:
                                      Number.isFinite(n) && n > 0 ? round2(n) : x.quantity,
                                  }
                                : x,
                            ),
                          );
                        }}
                        onBlur={() =>
                          setCart((c) =>
                            c.map((x) =>
                              x.productId === l.productId ? { ...x, qtyText: undefined } : x,
                            ),
                          )
                        }
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        aria-label="Mais"
                        onClick={() => add(l.productId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="ml-1 text-xs text-muted-foreground">
                        × {money(Number(l.p.price))}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto h-7 w-7"
                        aria-label="Remover"
                        onClick={() => setCart((c) => c.filter((x) => x.productId !== l.productId))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {over && (
                      <p className="text-xs text-destructive">
                        Só há {formatQty(stock(l.productId), locale)} em estoque.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">
              Desconto{" "}
              {isManager ? "" : `(até ${unit?.max_discount_pct ?? 10}% = ${money(maxDiscount)})`}
            </span>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            {discountTooHigh && (
              <span className="text-xs text-destructive">Acima do limite. Peça a um gestor.</span>
            )}
          </label>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="px-0">
                <UserRound className="mr-1 h-4 w-4" /> Cliente (opcional)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-2 pt-1">
              <Input
                placeholder="Nome"
                value={customer.name ?? ""}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              />
              <Input
                placeholder={country === "BR" ? "CPF/CNPJ" : "NIF"}
                value={customer.tax_id ?? ""}
                onChange={(e) => setCustomer({ ...customer, tax_id: e.target.value })}
              />
              <Input
                placeholder="Telefone"
                inputMode="tel"
                value={customer.phone ?? ""}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
              <Input
                placeholder="E-mail"
                type="email"
                value={customer.email ?? ""}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              />
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">Pagamento</span>
            {pays.map((p, i) => (
              <div key={p.key} className="flex gap-2">
                <Select
                  value={p.method}
                  onValueChange={(v) =>
                    setPays(
                      pays.map((x, j) => (j === i ? { ...x, method: v as PaymentMethod } : x)),
                    )
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="w-28"
                  inputMode="decimal"
                  placeholder="Valor"
                  value={p.amount}
                  onChange={(e) =>
                    setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover pagamento"
                  disabled={pays.length === 1}
                  onClick={() => setPays(pays.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={calc.total <= calc.paid}
                onClick={() => {
                  const rest = round2(calc.total - calc.paid);
                  const last = pays[pays.length - 1];
                  if (last && !last.amount)
                    setPays(
                      pays.map((x, j) =>
                        j === pays.length - 1 ? { ...x, amount: rest.toFixed(2) } : x,
                      ),
                    );
                  else
                    setPays([
                      ...pays,
                      { key: crypto.randomUUID(), method: "dinheiro", amount: rest.toFixed(2) },
                    ]);
                }}
              >
                Valor em falta
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPays([
                    ...pays,
                    { key: crypto.randomUUID(), method: methods[1] ?? "dinheiro", amount: "" },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Dividir pagamento
              </Button>
            </div>
          </div>

          <dl className="space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{money(calc.subtotal)}</dd>
            </div>
            {calc.discount > 0 && (
              <div className="flex justify-between">
                <dt>Desconto</dt>
                <dd>− {money(calc.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd>{money(calc.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Pago</dt>
              <dd>{money(calc.paid)}</dd>
            </div>
            {calc.change > 0 && (
              <div className="flex justify-between font-medium text-primary">
                <dt>Troco</dt>
                <dd>{money(calc.change)}</dd>
              </div>
            )}
          </dl>
          {priced.length > 0 && !calc.ok && (
            <p className="text-xs text-destructive">{calc.problems[0]}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!cart.length || finish.isPending} onClick={reset}>
              Limpar
            </Button>
            <Button
              className="flex-1"
              disabled={!calc.ok || discountTooHigh || !!stockProblem || finish.isPending}
              onClick={() => finish.mutate()}
            >
              {finish.isPending ? "A registar…" : `Finalizar ${money(calc.total)}`}
            </Button>
          </div>
        </aside>
      </div>
    );
  })();

  return (
    <RetailShell
      title="PDV"
      desc="Venda rápida com pagamento dividido, troco e comprovativo."
      allow={[...RETAIL_OPERATOR_ROLES]}
      actions={
        activeUnits.length > 1 ? (
          <Select
            value={unitId}
            onValueChange={(v) => {
              setUnitPick(v);
              saveUnit(v);
              reset();
            }}
          >
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
        ) : unit ? (
          <Badge variant="secondary">{unit.name}</Badge>
        ) : null
      }
    >
      {body}
      {done && (
        <Dialog open onOpenChange={(o) => !o && setDone(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Venda {done.code} registada</DialogTitle>
            </DialogHeader>
            <div className="space-y-1 text-sm">
              <p>
                Total: <strong>{money(done.total)}</strong>
              </p>
              {done.change > 0 && (
                <p className="text-lg">
                  Troco: <strong>{money(done.change)}</strong>
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <ReceiptButton saleId={done.saleId} sellerName={profile?.full_name ?? null} />
              <Button onClick={() => setDone(null)}>Nova venda</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </RetailShell>
  );
}
