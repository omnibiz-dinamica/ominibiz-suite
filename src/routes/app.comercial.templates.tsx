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
import { Plus, Trash2, Upload, FileText } from "lucide-react";
import type { PlaceholderMap } from "@/lib/pdf-fill";

export const Route = createFileRoute("/app/comercial/templates")({
  component: TemplatesPage,
});

type Tpl = {
  id: string;
  name: string;
  body: string | null;
  version: number;
  is_active: boolean;
  pdf_path: string | null;
  placeholder_map: PlaceholderMap;
};

const PLACEHOLDER_KEYS = [
  "company_name",
  "nif",
  "address",
  "representative_name",
  "plan_name",
  "credits_limit",
  "setup_fee",
  "monthly_fee",
  "contract_date",
  "signature_image",
];

const DEFAULT_MAP: PlaceholderMap = {
  company_name: { page: 1, x: 120, y: 720, size: 11 },
  nif: { page: 1, x: 120, y: 700, size: 11 },
  address: { page: 1, x: 120, y: 680, size: 10, maxWidth: 400 },
  representative_name: { page: 1, x: 120, y: 660, size: 11 },
  plan_name: { page: 1, x: 120, y: 600, size: 11, bold: true },
  credits_limit: { page: 1, x: 120, y: 580, size: 11 },
  setup_fee: { page: 1, x: 120, y: 560, size: 11 },
  monthly_fee: { page: 1, x: 120, y: 540, size: 11 },
  contract_date: { page: 1, x: 120, y: 520, size: 11 },
  signature_image: { page: 1, x: 120, y: 120, type: "image", width: 180, height: 60 },
};

function TemplatesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Tpl | null>(null);

  const { data: tpls = [] } = useQuery({
    queryKey: ["contract_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_templates")
        .select("id,name,body,version,is_active,pdf_path,placeholder_map")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tpl[];
    },
  });

  const save = useMutation({
    mutationFn: async (t: Tpl) => {
      if (!t.name.trim()) throw new Error("Nome obrigatório");
      const payload = {
        name: t.name,
        body: t.body,
        is_active: t.is_active,
        pdf_path: t.pdf_path,
        placeholder_map: t.placeholder_map as never,
      };
      if (t.id) {
        const { error } = await supabase.from("contract_templates")
          .update({ ...payload, version: t.version })
          .eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contract_templates")
          .insert(payload);
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

  const uploadPdf = useMutation({
    mutationFn: async ({ file, tpl }: { file: File; tpl: Tpl }) => {
      const path = `templates/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from("contracts").upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (error) throw error;
      setEditing({ ...tpl, pdf_path: path });
      return path;
    },
    onSuccess: () => toast.success("PDF carregado — não esqueça de guardar"),
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
          <Button size="sm" onClick={() => setEditing({ id: "", name: "", body: DEFAULT_TEMPLATE_BODY, version: 1, is_active: true, pdf_path: null, placeholder_map: DEFAULT_MAP })}>
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

            <div className="rounded-xl border border-border bg-background p-3 space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4" /> PDF mestre</Label>
              {editing.pdf_path ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground">{editing.pdf_path}</span>
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, pdf_path: null })}>Remover</Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Faça upload do PDF original — os valores dinâmicos serão impressos sobre ele preservando o layout.</p>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-xs hover:bg-muted">
                <Upload className="h-4 w-4" />
                {editing.pdf_path ? "Substituir PDF" : "Carregar PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && editing) uploadPdf.mutate({ file: f, tpl: editing });
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            <div className="rounded-xl border border-border bg-background p-3 space-y-2">
              <Label className="text-sm font-medium">Posições dos placeholders</Label>
              <p className="text-xs text-muted-foreground">Coordenadas em pontos (0,0 = canto inferior esquerdo). Ajuste para casar com o layout do PDF.</p>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {PLACEHOLDER_KEYS.map((k) => {
                  const p = editing.placeholder_map[k] ?? { page: 1, x: 100, y: 700, size: 11 };
                  const update = (patch: Partial<typeof p>) =>
                    setEditing({ ...editing, placeholder_map: { ...editing.placeholder_map, [k]: { ...p, ...patch } } });
                  const isImage = k === "signature_image";
                  return (
                    <div key={k} className="grid grid-cols-[1fr_56px_56px_56px_56px] items-center gap-1.5 text-xs">
                      <code className="truncate">{`{{${k}}}`}</code>
                      <Input type="number" value={p.page} onChange={(e) => update({ page: Number(e.target.value) || 1 })} placeholder="pg" />
                      <Input type="number" value={p.x} onChange={(e) => update({ x: Number(e.target.value) || 0 })} placeholder="x" />
                      <Input type="number" value={p.y} onChange={(e) => update({ y: Number(e.target.value) || 0 })} placeholder="y" />
                      <Input type="number" value={isImage ? (p.width ?? 160) : (p.size ?? 11)}
                        onChange={(e) => update(isImage ? { width: Number(e.target.value) || 0, type: "image" } : { size: Number(e.target.value) || 11 })}
                        placeholder={isImage ? "w" : "sz"} />
                    </div>
                  );
                })}
              </div>
            </div>

            <details className="rounded-xl border border-border bg-background p-3">
              <summary className="cursor-pointer text-sm font-medium">Corpo fallback (markdown)</summary>
              <p className="mb-2 mt-2 text-xs text-muted-foreground">Usado apenas se nenhum PDF mestre for fornecido.</p>
              <Textarea rows={10} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} className="font-mono text-xs" />
            </details>

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