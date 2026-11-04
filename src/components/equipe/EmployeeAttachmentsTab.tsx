/**
 * Aba "Anexos" da ficha do funcionário (gestor).
 * Ao anexar, o gestor escolhe se o funcionário pode ver e se é para
 * "Só visualizar" ou "Assinar" (assinar só em PDF). A lista mostra o estado
 * (só gestão, aguarda leitura/assinatura, lido/assinado em …) e a cópia assinada.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSignature, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ATTACH_CATEGORIES,
  attachmentBadgeClass,
  attachmentStatusLabel,
  isPdfAttachment,
  labelForCategory,
  type AttachmentAction,
  type EmployeeAttachment,
} from "@/lib/employee-attachments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attachmentsTable = () => (supabase as any).from("employee_attachments");

export function EmployeeAttachmentsTab({
  userId,
  companyId,
}: {
  userId: string;
  companyId: string;
}) {
  const qc = useQueryClient();
  const [category, setCategory] = useState("cc");
  const [visible, setVisible] = useState(false);
  const [action, setAction] = useState<AttachmentAction>("view");
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["employee-attachments", userId],
    queryFn: async () => {
      const { data, error } = await attachmentsTable()
        .select("*")
        .eq("profile_id", userId)
        .eq("company_id", companyId)
        .order("uploaded_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as EmployeeAttachment[];
    },
  });
  const items = list.data ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["employee-attachments", userId] });
    qc.invalidateQueries({ queryKey: ["employee-history"] });
  };

  const onPick = async (file: File) => {
    const pdf = isPdfAttachment({ mime_type: file.type, file_name: file.name });
    if (visible && action === "sign" && !pdf) {
      toast.error("Para assinar, o arquivo tem de ser PDF.");
      return;
    }
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${companyId}/${userId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from("employee-docs").upload(path, file);
      if (up.error) throw up.error;
      const { error } = await attachmentsTable().insert({
        profile_id: userId,
        company_id: companyId,
        category,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        employee_visible: visible,
        employee_action: visible ? action : "view",
      });
      if (error) {
        await supabase.storage.from("employee-docs").remove([path]);
        throw new Error(error.message);
      }
      toast.success(
        visible
          ? action === "sign"
            ? "Anexo enviado. O funcionário vai ser pedido para assinar."
            : "Anexo enviado. O funcionário vai ser pedido para ler."
          : "Anexo adicionado (só gestão).",
      );
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (it: EmployeeAttachment, patch: Partial<EmployeeAttachment>) => {
    setSavingId(it.id);
    try {
      const { error } = await attachmentsTable().update(patch).eq("id", it.id);
      if (error) throw new Error(error.message);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  const onDownload = async (path: string) => {
    const { data, error } = await supabase.storage.from("employee-docs").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) toast.error("Não foi possível abrir o arquivo.");
    else window.open(data.signedUrl, "_blank");
  };

  const onDelete = async (it: EmployeeAttachment) => {
    if (!confirm(`Remover "${it.file_name}"?`)) return;
    const paths = [it.storage_path, it.signed_storage_path].filter(Boolean) as string[];
    const { error } = await attachmentsTable().delete().eq("id", it.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.storage.from("employee-docs").remove(paths);
    toast.success("Removido");
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTACH_CATEGORIES.map((c) => (
                  <SelectItem key={c.v} value={c.v}>
                    {c.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="att-visible" checked={visible} onCheckedChange={setVisible} />
            <Label htmlFor="att-visible">Funcionário pode ver</Label>
          </div>
          {visible && (
            <div className="space-y-1.5">
              <Label>O funcionário deve</Label>
              <Select value={action} onValueChange={(v) => setAction(v as AttachmentAction)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Só visualizar</SelectItem>
                  <SelectItem value="sign">Assinar (só PDF)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">
            <Upload className="h-4 w-4" /> {busy ? "Enviando…" : "Enviar arquivo"}
            <input
              type="file"
              hidden
              disabled={busy}
              accept={visible && action === "sign" ? "application/pdf,.pdf" : undefined}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPick(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Com "Funcionário pode ver", o documento abre para ele ao entrar no sistema. Para assinar,
          a assinatura do perfil dele é colocada no local de "Assinatura" do PDF e os gestores são
          avisados.
        </p>
      </div>

      {list.isLoading && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A carregar anexos…
        </p>
      )}
      {list.isError && (
        <p className="py-6 text-center text-sm text-destructive">
          Não foi possível carregar os anexos.{" "}
          <button type="button" className="underline" onClick={() => void list.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}

      {!list.isLoading && !list.isError && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {items.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">Nenhum anexo.</li>
          )}
          {items.map((it) => {
            const pdf = isPdfAttachment(it);
            const signed = it.employee_status === "signed";
            const saving = savingId === it.id;
            return (
              <li key={it.id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {labelForCategory(it.category)} ·{" "}
                      {new Date(it.uploaded_at).toLocaleDateString("pt-PT")}
                    </div>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${attachmentBadgeClass(it)}`}
                    >
                      {attachmentStatusLabel(it)}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {it.signed_storage_path && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void onDownload(it.signed_storage_path!)}
                        title="Baixar cópia assinada"
                        aria-label="Baixar cópia assinada"
                      >
                        <FileSignature className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void onDownload(it.storage_path)}
                      title="Baixar"
                      aria-label="Baixar"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void onDelete(it)}
                      title="Remover"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`vis-${it.id}`}
                      checked={!!it.employee_visible}
                      disabled={saving}
                      onCheckedChange={(v) => void update(it, { employee_visible: v })}
                    />
                    <Label htmlFor={`vis-${it.id}`} className="text-xs font-normal">
                      Funcionário pode ver
                    </Label>
                  </div>
                  {it.employee_visible && (
                    <Select
                      value={it.employee_action ?? "view"}
                      disabled={saving || signed}
                      onValueChange={(v) =>
                        void update(it, { employee_action: v as AttachmentAction })
                      }
                    >
                      <SelectTrigger className="h-8 w-[180px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">Só visualizar</SelectItem>
                        <SelectItem value="sign" disabled={!pdf}>
                          Assinar{pdf ? "" : " (só PDF)"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
