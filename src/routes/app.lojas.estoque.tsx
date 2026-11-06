import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { RetailShell, StateBox } from "@/components/retail/RetailShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  MOVEMENT_LABEL,
  formatQty,
  rdb,
  retailErrorMessage,
  retailStockMove,
  useRetailBalances,
  useRetailCategories,
  useRetailCompany,
  useRetailProducts,
  useRetailUnits,
  type MoveKind,
  type RetailMovement,
} from "@/lib/retail";

export const Route = createFileRoute("/app/lojas/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque · Lojas · OmniBiz" },
      { name: "description", content: "Saldo de estoque por loja, movimentações e histórico." },
      { property: "og:title", content: "Estoque · Lojas · OmniBiz" },
      { property: "og:description", content: "Saldo de estoque por loja, movimentações e histórico." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockPage,
});

const KIND_TONE: Record<RetailMovement["kind"], string> = {
  entrada: "bg-primary/15 text-primary",
  saida: "bg-destructive/15 text-destructive",
  transferencia_saida: "bg-accent text-accent-foreground",
  transferencia_entrada: "bg-accent text-accent-foreground",
  ajuste: "bg-secondary text-secondary-foreground",
};

function StockPage() {
  const { locale } = useRetailCompany();
  const units = useRetailUnits();
  const products = useRetailProducts();
  const cats = useRetailCategories();
  const balances = useRetailBalances();
  const [unitId, setUnitId] = useState<string>("");
  const [moveOpen, setMoveOpen] = useState(false);

  const activeUnits = (units.data ?? []).filter((u) => u.active);
  const selected = unitId || activeUnits[0]?.id || "";

  const grouped = useMemo(() => {
    const byCat = new Map<string, { name: string; rows: { id: string; name: string; unit: string; qty: number; active: boolean }[] }>();
    for (const p of products.data ?? []) {
      const qty = (balances.data ?? []).find((b) => b.unit_id === selected && b.product_id === p.id)?.quantity ?? 0;
      if (!p.active && qty === 0) continue;
      const key = p.category_id ?? "none";
      const name = cats.data?.find((c) => c.id === p.category_id)?.name ?? "Sem categoria";
      if (!byCat.has(key)) byCat.set(key, { name, rows: [] });
      byCat.get(key)!.rows.push({ id: p.id, name: p.name, unit: p.unit, qty, active: p.active });
    }
    return [...byCat.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products.data, balances.data, cats.data, selected]);

  const loading = units.isLoading || products.isLoading || balances.isLoading;

  return (
    <RetailShell
      title="Estoque"
      desc="Saldo por loja, movimentações e histórico."
      actions={
        <Button disabled={!activeUnits.length || !(products.data ?? []).length} onClick={() => setMoveOpen(true)}>
          <ArrowLeftRight className="mr-1 h-4 w-4" /> Movimentar
        </Button>
      }
    >
      <Tabs defaultValue="saldos">
        <TabsList>
          <TabsTrigger value="saldos">Saldos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="saldos" className="space-y-4">
          {loading ? (
            <StateBox kind="loading" />
          ) : units.isError || balances.isError ? (
            <StateBox kind="error" text={retailErrorMessage(units.error ?? balances.error)} />
          ) : !activeUnits.length ? (
            <StateBox kind="empty" text="Crie uma loja ativa primeiro." />
          ) : (
            <>
              <Select value={selected} onValueChange={setUnitId}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Loja" /></SelectTrigger>
                <SelectContent>{activeUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
              {grouped.length === 0 ? (
                <StateBox kind="empty" text="Sem produtos cadastrados." />
              ) : (
                grouped.map((g) => (
                  <section key={g.name} className="rounded-lg border border-border bg-card">
                    <h2 className="border-b border-border px-4 py-2 text-sm font-medium">{g.name}</h2>
                    <ul className="divide-y divide-border">
                      {g.rows.map((r) => (
                        <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                          <span className="truncate">
                            {r.name} {!r.active && <Badge variant="secondary" className="ml-1">Inativo</Badge>}
                          </span>
                          <span className={r.qty === 0 ? "text-destructive" : "font-medium"}>
                            {formatQty(r.qty, locale)} {r.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </TabsContent>
        <TabsContent value="historico">
          <History />
        </TabsContent>
      </Tabs>
      {moveOpen && <MoveDialog defaultUnit={selected} onClose={() => setMoveOpen(false)} />}
    </RetailShell>
  );
}

type Line = { key: string; productId: string; qty: string };
const newLine = (): Line => ({ key: crypto.randomUUID(), productId: "", qty: "" });

function MoveDialog({ defaultUnit, onClose }: { defaultUnit: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { locale } = useRetailCompany();
  const units = useRetailUnits();
  const products = useRetailProducts();
  const balances = useRetailBalances();
  const [kind, setKind] = useState<MoveKind>("entrada");
  const [unitId, setUnitId] = useState(defaultUnit);
  const [destId, setDestId] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const activeUnits = (units.data ?? []).filter((u) => u.active);
  const eligible = (products.data ?? []).filter((p) => p.active || kind === "saida" || kind === "ajuste");
  const bal = (pid: string) => (balances.data ?? []).find((b) => b.unit_id === unitId && b.product_id === pid)?.quantity ?? 0;

  const run = useMutation({
    mutationFn: async () => {
      if (!unitId) throw new Error("Escolha a loja.");
      if (kind === "transferencia" && (!destId || destId === unitId)) throw new Error("Escolha uma loja de destino diferente.");
      if (!reason.trim()) throw new Error("O motivo é obrigatório.");
      const valid = lines.filter((l) => l.productId);
      if (!valid.length) throw new Error("Adicione pelo menos um produto.");
      const parsed = valid.map((l) => ({ ...l, n: Number(l.qty.replace(",", ".")) }));
      for (const l of parsed) {
        if (!Number.isFinite(l.n) || (kind === "ajuste" ? l.n < 0 : l.n <= 0))
          throw new Error(kind === "ajuste" ? "O novo saldo deve ser 0 ou mais." : "As quantidades devem ser maiores que zero.");
      }
      let ok = 0;
      const errors: string[] = [];
      for (const l of parsed) {
        // Chave por linha e por pedido: um duplo clique ou nova tentativa não duplica.
        try {
          await retailStockMove({ unitId, productId: l.productId, kind, quantity: l.n, reason: reason.trim(), relatedUnitId: kind === "transferencia" ? destId : null, idempotencyKey: l.key });
          ok++;
        } catch (e) {
          const name = products.data?.find((p) => p.id === l.productId)?.name ?? "";
          errors.push(`${name}: ${retailErrorMessage(e)}`);
        }
      }
      return { ok, errors };
    },
    onSuccess: ({ ok, errors }) => {
      qc.invalidateQueries({ queryKey: ["retail-balances"] });
      qc.invalidateQueries({ queryKey: ["retail-movements"] });
      qc.invalidateQueries({ queryKey: ["retail-history-refs"] });
      if (ok) toast.success(`${ok} movimento(s) registado(s)`);
      if (errors.length) toast.error(errors.join("\n"));
      if (!errors.length) onClose();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Movimentar estoque</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Tipo</span>
            <Select value={kind} onValueChange={(v) => setKind(v as MoveKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="ajuste">Ajuste (novo saldo)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">{kind === "transferencia" ? "Loja de origem" : "Loja"}</span>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger><SelectValue placeholder="Loja" /></SelectTrigger>
              <SelectContent>{activeUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {kind === "transferencia" && (
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Loja de destino</span>
              <Select value={destId} onValueChange={setDestId}>
                <SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger>
                <SelectContent>{activeUnits.filter((u) => u.id !== unitId).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          )}
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Motivo *</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: receção do fornecedor, quebra, inventário" />
          </label>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const p = products.data?.find((x) => x.id === l.productId);
            const n = Number(l.qty.replace(",", "."));
            return (
              <div key={l.key} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <Select value={l.productId} onValueChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, productId: v } : x)))}>
                  <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Produto" /></SelectTrigger>
                  <SelectContent>{eligible.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}{x.sku ? ` · ${x.sku}` : ""}</SelectItem>)}</SelectContent>
                </Select>
                <Input
                  className="w-28"
                  inputMode="decimal"
                  placeholder={kind === "ajuste" ? "Novo saldo" : "Qtd."}
                  value={l.qty}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                />
                <Button size="icon" variant="ghost" aria-label="Remover linha" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                {p && (
                  <p className="w-full text-xs text-muted-foreground">
                    Saldo atual: {formatQty(bal(p.id), locale)} {p.unit}
                    {kind === "ajuste" && l.qty !== "" && Number.isFinite(n) && ` · variação ${n - bal(p.id) >= 0 ? "+" : ""}${formatQty(n - bal(p.id), locale)}`}
                  </p>
                )}
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={() => setLines([...lines, newLine()])}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar produto
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? "A registar…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function History() {
  const { currentCompanyId } = useAuth();
  const { locale } = useRetailCompany();
  const units = useRetailUnits();
  const products = useRetailProducts();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [productId, setProductId] = useState("all");
  const [kind, setKind] = useState("all");
  const [userId, setUserId] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const members = useQuery({
    queryKey: ["retail-members", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("company_member_options");
      if (error) return [] as { id: string; full_name: string | null }[];
      return ((data ?? []) as { id: string; full_name: string | null; company_id?: string }[]).filter((m) => !m.company_id || m.company_id === currentCompanyId);
    },
  });

  const moves = useQuery({
    queryKey: ["retail-movements", currentCompanyId, from, to, productId, kind, userId, page],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      let q = rdb("retail_stock_movements").select("*").eq("company_id", currentCompanyId!).order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59.999`).toISOString());
      if (productId !== "all") q = q.eq("product_id", productId);
      if (kind !== "all") q = kind === "transferencia" ? q.in("kind", ["transferencia_saida", "transferencia_entrada"]) : q.eq("kind", kind);
      if (userId !== "all") q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RetailMovement[];
    },
  });

  const unitName = (id: string | null) => units.data?.find((u) => u.id === id)?.name ?? "—";
  const prod = (id: string) => products.data?.find((p) => p.id === id);
  const userName = (id: string | null) => members.data?.find((m) => m.id === id)?.full_name ?? "—";
  const rows = (moves.data ?? []).slice(0, PAGE);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input type="date" className="w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} aria-label="De" />
        <Input type="date" className="w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} aria-label="Até" />
        <Select value={productId} onValueChange={(v) => { setProductId(v); setPage(0); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {(products.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => { setKind(v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="entrada">Entrada</SelectItem>
            <SelectItem value="saida">Saída</SelectItem>
            <SelectItem value="transferencia">Transferência</SelectItem>
            <SelectItem value="ajuste">Ajuste</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(0); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os utilizadores</SelectItem>
            {(members.data ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? "Utilizador"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {moves.isLoading ? (
        <StateBox kind="loading" />
      ) : moves.isError ? (
        <StateBox kind="error" text={retailErrorMessage(moves.error)} />
      ) : rows.length === 0 ? (
        <StateBox kind="empty" text="Sem movimentos para estes filtros." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((m) => {
            const p = prod(m.product_id);
            return (
              <li key={m.id} className="grid gap-1 px-4 py-2 text-sm sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:gap-3">
                <span className="text-xs text-muted-foreground">{fmt.format(new Date(m.created_at))}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${KIND_TONE[m.kind]}`}>{MOVEMENT_LABEL[m.kind]}</span>
                    <span className="font-medium">{p?.name ?? "Produto"}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {unitName(m.unit_id)}
                    {m.related_unit_id && (m.kind === "transferencia_saida" ? ` → ${unitName(m.related_unit_id)}` : ` ← ${unitName(m.related_unit_id)}`)}
                    {" · "}{m.reason}{" · "}{userName(m.user_id)}
                  </p>
                </div>
                <span className="text-right font-medium">
                  {m.kind === "ajuste" ? `= ${formatQty(m.balance_after, locale)}` : `${m.kind === "saida" || m.kind === "transferencia_saida" ? "−" : "+"}${formatQty(m.quantity, locale)}`} {p?.unit}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
        <Button size="sm" variant="outline" disabled={(moves.data ?? []).length <= PAGE} onClick={() => setPage(page + 1)}>Seguinte</Button>
      </div>
    </div>
  );
}
