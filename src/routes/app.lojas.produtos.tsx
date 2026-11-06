import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Power } from "lucide-react";
import { RetailShell, StateBox } from "@/components/retail/RetailShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { normalizeSearch } from "@/lib/messages/format";
import {
  PRODUCT_UNITS,
  formatMoney,
  formatQty,
  rdb,
  retailErrorMessage,
  useRetailBalances,
  useRetailCategories,
  useRetailCompany,
  useRetailHistoryRefs,
  useRetailProducts,
  useRetailUnits,
  type RetailProduct,
} from "@/lib/retail";

export const Route = createFileRoute("/app/lojas/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos · Lojas · OmniBiz" },
      { name: "description", content: "Catálogo de produtos com saldo por loja." },
      { property: "og:title", content: "Produtos · Lojas · OmniBiz" },
      { property: "og:description", content: "Catálogo de produtos com saldo por loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

type Form = Partial<Omit<RetailProduct, "price" | "cost">> & { price?: string; cost?: string };

function ProductsPage() {
  const { currentCompanyId } = useAuth();
  const { locale, currency } = useRetailCompany();
  const qc = useQueryClient();
  const products = useRetailProducts();
  const cats = useRetailCategories();
  const units = useRetailUnits();
  const balances = useRetailBalances();
  const refs = useRetailHistoryRefs();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("active");
  const [edit, setEdit] = useState<Form | null>(null);
  const [detail, setDetail] = useState<RetailProduct | null>(null);

  const catName = (id: string | null) => cats.data?.find((c) => c.id === id)?.name ?? "Sem categoria";
  const total = (pid: string) => (balances.data ?? []).filter((b) => b.product_id === pid).reduce((s, b) => s + b.quantity, 0);

  const list = useMemo(() => {
    const s = normalizeSearch(search);
    return (products.data ?? []).filter(
      (p) =>
        (cat === "all" || (cat === "none" ? !p.category_id : p.category_id === cat)) &&
        (status === "all" || (status === "active" ? p.active : !p.active)) &&
        (!s || [p.name, p.sku, p.barcode].some((v) => v && normalizeSearch(v).includes(s))),
    );
  }, [products.data, search, cat, status]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["retail-products"] });
    qc.invalidateQueries({ queryKey: ["retail-history-refs"] });
  };

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const name = (f.name ?? "").trim();
      if (!name) throw new Error("Indique o nome.");
      const price = Number((f.price ?? "0").replace(",", "."));
      const cost = f.cost?.trim() ? Number(f.cost.replace(",", ".")) : null;
      if (!Number.isFinite(price) || price < 0) throw new Error("Preço inválido.");
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new Error("Custo inválido.");
      const row = {
        name,
        sku: f.sku?.trim() || null,
        barcode: f.barcode?.trim() || null,
        unit: f.unit || "un",
        category_id: f.category_id || null,
        price,
        cost,
        active: f.active ?? true,
      };
      const q = f.id ? rdb("retail_products").update(row).eq("id", f.id) : rdb("retail_products").insert({ ...row, company_id: currentCompanyId });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto gravado");
      setEdit(null);
      invalidate();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: async (p: RetailProduct) => {
      const { error } = await rdb("retail_products").update({ active: !p.active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rdb("retail_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto excluído");
      invalidate();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const loading = products.isLoading || cats.isLoading;

  return (
    <RetailShell
      title="Produtos"
      desc="Catálogo de produtos e saldo em cada loja."
      actions={
        <Button onClick={() => setEdit({ active: true, unit: "un", price: "0" })}>
          <Plus className="mr-1 h-4 w-4" /> Novo produto
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Nome, SKU ou código de barras" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            <SelectItem value="none">Sem categoria</SelectItem>
            {(cats.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <StateBox kind="loading" />
      ) : products.isError ? (
        <StateBox kind="error" text={retailErrorMessage(products.error)} />
      ) : list.length === 0 ? (
        <StateBox kind="empty" text="Nenhum produto encontrado." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Produto</th>
                <th className="hidden px-3 py-2 md:table-cell">Categoria</th>
                <th className="px-3 py-2 text-right">Preço</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">Custo</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((p) => {
                const hasHistory = refs.data?.products.has(p.id) ?? true;
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <button className="text-left font-medium hover:underline" onClick={() => setDetail(p)}>{p.name}</button>
                      <div className="text-xs text-muted-foreground">{[p.sku, p.barcode].filter(Boolean).join(" · ") || "—"}</div>
                      {!p.active && <Badge variant="secondary" className="mt-1">Inativo</Badge>}
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">{catName(p.category_id)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(p.price, locale, currency)}</td>
                    <td className="hidden px-3 py-2 text-right sm:table-cell">{formatMoney(p.cost, locale, currency)}</td>
                    <td className="px-3 py-2 text-right">{formatQty(total(p.id), locale)} {p.unit}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEdit({ ...p, price: String(p.price), cost: p.cost == null ? "" : String(p.cost) })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {hasHistory ? (
                        <Button size="icon" variant="ghost" aria-label={p.active ? "Desativar" : "Ativar"} title={p.active ? "Desativar" : "Ativar"} onClick={() => toggle.mutate(p)}>
                          <Power className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => confirm(`Excluir "${p.name}"?`) && remove.mutate(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Saldo por loja · {detail?.name}</DialogTitle></DialogHeader>
          <ul className="divide-y divide-border rounded-md border border-border">
            {(units.data ?? []).map((u) => {
              const q = (balances.data ?? []).find((b) => b.unit_id === u.id && b.product_id === detail?.id)?.quantity ?? 0;
              return (
                <li key={u.id} className="flex justify-between px-3 py-2 text-sm">
                  <span>{u.name}</span>
                  <span className={q === 0 ? "text-muted-foreground" : "font-medium"}>{formatQty(q, locale)} {detail?.unit}</span>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Nome *</span>
              <Input value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">SKU</span>
              <Input value={edit?.sku ?? ""} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Código de barras</span>
              <Input value={edit?.barcode ?? ""} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Categoria</span>
              <Select value={edit?.category_id ?? "none"} onValueChange={(v) => setEdit({ ...edit, category_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {(cats.data ?? []).filter((c) => c.active || c.id === edit?.category_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Unidade</span>
              <Select value={edit?.unit ?? "un"} onValueChange={(v) => setEdit({ ...edit, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRODUCT_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Preço de venda ({currency})</span>
              <Input inputMode="decimal" value={edit?.price ?? ""} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Custo ({currency})</span>
              <Input inputMode="decimal" value={edit?.cost ?? ""} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={edit?.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /> Ativo
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => edit && save.mutate(edit)}>Gravar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
