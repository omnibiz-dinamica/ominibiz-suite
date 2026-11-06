import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { RetailShell, StateBox } from "@/components/retail/RetailShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { rdb, retailErrorMessage, useRetailCategories, useRetailProducts, type RetailCategory } from "@/lib/retail";

export const Route = createFileRoute("/app/lojas/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias · Lojas · OmniBiz" },
      { name: "description", content: "Categorias de produtos das lojas da empresa." },
      { property: "og:title", content: "Categorias · Lojas · OmniBiz" },
      { property: "og:description", content: "Categorias de produtos das lojas da empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const cats = useRetailCategories();
  const products = useRetailProducts();
  const [edit, setEdit] = useState<Partial<RetailCategory> | null>(null);

  const save = useMutation({
    mutationFn: async (c: Partial<RetailCategory>) => {
      const name = (c.name ?? "").trim();
      if (!name) throw new Error("Indique o nome.");
      const q = c.id
        ? rdb("retail_product_categories").update({ name, active: c.active ?? true }).eq("id", c.id)
        : rdb("retail_product_categories").insert({ company_id: currentCompanyId, name, active: c.active ?? true });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria gravada");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["retail-categories"] });
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rdb("retail_product_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria excluída");
      qc.invalidateQueries({ queryKey: ["retail-categories"] });
      qc.invalidateQueries({ queryKey: ["retail-products"] });
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const count = (id: string) => (products.data ?? []).filter((p) => p.category_id === id).length;

  return (
    <RetailShell
      title="Categorias"
      desc="Organize os produtos das suas lojas."
      actions={
        <Button onClick={() => setEdit({ active: true })}>
          <Plus className="mr-1 h-4 w-4" /> Nova categoria
        </Button>
      }
    >
      {cats.isLoading ? (
        <StateBox kind="loading" />
      ) : cats.isError ? (
        <StateBox kind="error" text={retailErrorMessage(cats.error)} />
      ) : (cats.data ?? []).length === 0 ? (
        <StateBox kind="empty" text="Ainda não há categorias." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {(cats.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{count(c.id)} produto(s)</p>
              </div>
              {!c.active && <Badge variant="secondary">Inativa</Badge>}
              <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEdit(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Excluir"
                onClick={() => {
                  if (confirm(`Excluir a categoria "${c.name}"? Os produtos ficam sem categoria.`)) remove.mutate(c.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome" value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={edit?.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /> Ativa
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
