import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_TEMPLATE_BODY } from "@/lib/contract-vars";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/comercial/templates")({
  component: TemplatesPage,
});

type Tpl = { id: string; name: string; body: string; version: number; is_active: boolean };

function TemplatesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Tpl | null>(null);

  const { data: tpls = [] } = useQuery({
    queryKey: ["contract_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_templates")
        .select("id,name,body,version,is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tpl[];
    },
  });

  const save = useMutation({
    mutationFn: async (t: Tpl) => {
      if (!t.name.trim()) throw new Error("Nome obrigatório");
      if (t.id) {
        const { error } = await supabase.from("contract_templates")
          .update({ name: t.name, body: t.body, is_active: t.is_active, version: t.version })
          .eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contract_templates")
          .insert({ name: t.name, body: t.body, is_active: t.is_active });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Template guardado");
      qc.invalidateQueries({ queryKey: ["contract_templates"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contract_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template removido");
      qc.invalidateQueries({ queryKey: ["contract_templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Templates</h2>
          <Button size="sm" onClick={() => setEditing({ id: "", name: "", body: DEFAULT_TEMPLATE_BODY, version: 1, is_active: true })}>
            <Plus className="mr-1 h-4 w-4" /> Novo
          </Button>
        </div>
        <div className="rounded-2xl border border-border bg-card">
          {tpls.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Sem templates ainda.</div>
          ) : (
            <ul className="divide-y divide-border">
              {tpls.map((t) => (
                <li key={t.id} className="flex items-center justify-between p-3">
                  <button className="flex-1 text-left" onClick={() => setEditing(t)}>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">v{t.version} · {t.is_active ? "ativo" : "inativo"}</div>
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm("Remover?")) remove.mutate(t.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        {!editing ? (
          <div className="text-sm text-muted-foreground">Selecione ou crie um template para editar.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-base font-medium">{editing.id ? "Editar template" : "Novo template"}</Label>
              <div className="flex items-center gap-2">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <span className="text-xs text-muted-foreground">Ativo</span>
              </div>
            </div>
            <div><Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div>
              <Label>Corpo (markdown — use {"{{company_name}} {{nif}} {{plan_name}} {{monthly_fee}} {{credits_limit}} {{services}}"})</Label>
              <Textarea rows={18} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={() => save.mutate(editing)} disabled={save.isPending}>{save.isPending ? "A guardar…" : "Guardar"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}