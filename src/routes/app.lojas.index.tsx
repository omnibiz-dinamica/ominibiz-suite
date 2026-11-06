import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Users, Trash2, Power } from "lucide-react";
import { RetailShell, StateBox } from "@/components/retail/RetailShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { normalizeSearch } from "@/lib/messages/format";
import { rdb, retailErrorMessage, useRetailCompany, useRetailHistoryRefs, useRetailUnits, type RetailUnit } from "@/lib/retail";

export const Route = createFileRoute("/app/lojas/")({
  head: () => ({
    meta: [
      { title: "Lojas · OmniBiz" },
      { name: "description", content: "Lojas da empresa e equipa de cada loja." },
      { property: "og:title", content: "Lojas · OmniBiz" },
      { property: "og:description", content: "Lojas da empresa e equipa de cada loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnitsPage,
});

const FIELDS: Array<{ key: keyof RetailUnit; label: string }> = [
  { key: "name", label: "Nome *" },
  { key: "code", label: "Código *" },
  { key: "legal_name", label: "Razão social" },
  { key: "tax_id", label: "NIF / CNPJ" },
  { key: "address", label: "Morada" },
  { key: "city", label: "Cidade" },
  { key: "postal_code", label: "Código postal" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
];

function UnitsPage() {
  const { currentCompanyId } = useAuth();
  const { country } = useRetailCompany();
  const qc = useQueryClient();
  const units = useRetailUnits();
  const refs = useRetailHistoryRefs();
  const [edit, setEdit] = useState<Partial<RetailUnit> | null>(null);
  const [team, setTeam] = useState<RetailUnit | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["retail-units"] });
    qc.invalidateQueries({ queryKey: ["retail-history-refs"] });
  };

  const save = useMutation({
    mutationFn: async (u: Partial<RetailUnit>) => {
      const name = (u.name ?? "").trim();
      const code = (u.code ?? "").trim().toUpperCase();
      if (!name || !code) throw new Error("Nome e código são obrigatórios.");
      const row: Record<string, unknown> = { name, code };
      for (const f of FIELDS) if (f.key !== "name" && f.key !== "code") row[f.key] = (u[f.key] as string | null)?.toString().trim() || null;
      row.country = (u.country ?? "").trim().toUpperCase() || country;
      if (u.max_discount_pct !== undefined && String(u.max_discount_pct).trim() !== "") {
        const pct = Number(String(u.max_discount_pct).replace(",", "."));
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("O desconto máximo deve estar entre 0 e 100%.");
        row.max_discount_pct = pct;
      }
      const q = u.id
        ? rdb("company_units").update(row).eq("id", u.id)
        : rdb("company_units").insert({ ...row, company_id: currentCompanyId });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loja gravada");
      setEdit(null);
      invalidate();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: async (u: RetailUnit) => {
      const { error } = await rdb("company_units").update({ active: !u.active }).eq("id", u.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rdb("company_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loja excluída");
      invalidate();
    },
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  return (
    <RetailShell
      title="Lojas"
      desc="Cadastre as lojas da empresa e defina a equipa de cada uma."
      actions={
        <Button onClick={() => setEdit({ active: true, country })}>
          <Plus className="mr-1 h-4 w-4" /> Nova loja
        </Button>
      }
    >
      {units.isLoading ? (
        <StateBox kind="loading" />
      ) : units.isError ? (
        <StateBox kind="error" text={retailErrorMessage(units.error)} />
      ) : (units.data ?? []).length === 0 ? (
        <StateBox kind="empty" text="Ainda não há lojas. Crie a primeira." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(units.data ?? []).map((u) => {
            const hasHistory = refs.data?.units.has(u.id) ?? true;
            return (
              <div key={u.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.code} · {[u.city, u.country].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <Badge variant={u.active ? "default" : "secondary"}>{u.active ? "Ativa" : "Inativa"}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEdit(u)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTeam(u)}>
                    <Users className="mr-1 h-3.5 w-3.5" /> Equipa
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggle.mutate(u)}>
                    <Power className="mr-1 h-3.5 w-3.5" /> {u.active ? "Desativar" : "Ativar"}
                  </Button>
                  {!hasHistory && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => confirm(`Excluir a loja "${u.name}"?`) && remove.mutate(u.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar loja" : "Nova loja"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="space-y-1 text-sm">
                <span className="text-muted-foreground">{f.label}</span>
                <Input value={(edit?.[f.key] as string) ?? ""} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
              </label>
            ))}
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">País</span>
              <Input maxLength={2} value={edit?.country ?? ""} onChange={(e) => setEdit({ ...edit, country: e.target.value.toUpperCase() })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Desconto máximo do funcionário no PDV (%)</span>
              <Input
                inputMode="decimal"
                placeholder="10"
                value={edit?.max_discount_pct ?? ""}
                onChange={(e) => setEdit({ ...edit, max_discount_pct: e.target.value as unknown as number })}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => edit && save.mutate(edit)}>Gravar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {team && <TeamDialog unit={team} onClose={() => setTeam(null)} />}
    </RetailShell>
  );
}

function TeamDialog({ unit, onClose }: { unit: RetailUnit; onClose: () => void }) {
  const { currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const members = useQuery({
    queryKey: ["retail-members", currentCompanyId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("company_active_member_options");
      if (error) throw error;
      return ((data ?? []) as { id: string; full_name: string | null; company_id: string }[]).filter((m) => m.company_id === currentCompanyId);
    },
  });
  const assigned = useQuery({
    queryKey: ["retail-assignments", unit.id],
    queryFn: async () => {
      const { data, error } = await rdb("user_unit_assignments").select("id, user_id, is_primary").eq("unit_id", unit.id);
      if (error) throw error;
      return (data ?? []) as { id: string; user_id: string; is_primary: boolean }[];
    },
  });

  const toggle = useMutation({
    mutationFn: async (userId: string) => {
      const row = assigned.data?.find((a) => a.user_id === userId);
      const { error } = row
        ? await rdb("user_unit_assignments").delete().eq("id", row.id)
        : await rdb("user_unit_assignments").insert({ company_id: currentCompanyId, unit_id: unit.id, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retail-assignments", unit.id] }),
    onError: (e) => toast.error(retailErrorMessage(e)),
  });

  const list = useMemo(() => {
    const s = normalizeSearch(search);
    return (members.data ?? []).filter((m) => !s || normalizeSearch(m.full_name ?? "").includes(s));
  }, [members.data, search]);
  const isIn = (id: string) => !!assigned.data?.some((a) => a.user_id === id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Equipa · {unit.name}</DialogTitle>
        </DialogHeader>
        <Input placeholder="Pesquisar por nome" value={search} onChange={(e) => setSearch(e.target.value)} />
        {members.isLoading || assigned.isLoading ? (
          <StateBox kind="loading" />
        ) : list.length === 0 ? (
          <StateBox kind="empty" text="Nenhum utilizador ativo encontrado." />
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {list.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{m.full_name ?? "Utilizador"}</span>
                <Button size="sm" variant={isIn(m.id) ? "secondary" : "outline"} disabled={toggle.isPending} onClick={() => toggle.mutate(m.id)}>
                  {isIn(m.id) ? "Remover" : "Vincular"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
