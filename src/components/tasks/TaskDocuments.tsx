import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Trash2, Upload, ExternalLink } from "lucide-react";

interface TaskDocRow {
  id: string;
  task_id: string;
  company_id: string;
  kind: "pdf" | "image" | "checklist" | "video";
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

const ACCEPT = "application/pdf,image/png,image/jpeg,image/jpg";
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg"]);

export function TaskDocuments({
  taskId,
  companyId,
  canManage,
}: {
  taskId: string;
  companyId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["task-docs", taskId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("task_documents" as any) as any)
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskDocRow[];
    },
  });

  const upload = async (file: File) => {
    if (file.size > MAX_SIZE) {
      toast.error("Arquivo maior que 10 MB");
      return;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      toast.error("Tipo de arquivo não permitido. Use PDF, PNG ou JPG.");
      return;
    }
    const kind: TaskDocRow["kind"] = file.type === "application/pdf" ? "pdf" : "image";
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${companyId}/${taskId}/${Date.now()}_${safe}`;
    setUploading(true);
    try {
      const up = await supabase.storage.from("task-docs").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("task_documents" as any) as any).insert({
        task_id: taskId,
        company_id: companyId,
        kind,
        title: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (error) throw error;
      toast.success("Documento enviado");
      qc.invalidateQueries({ queryKey: ["task-docs", taskId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = useMutation({
    mutationFn: async (doc: TaskDocRow) => {
      await supabase.storage.from("task-docs").remove([doc.storage_path]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("task_documents" as any) as any).delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento removido");
      qc.invalidateQueries({ queryKey: ["task-docs", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDoc = async (doc: TaskDocRow) => {
    const { data, error } = await supabase.storage.from("task-docs").createSignedUrl(doc.storage_path, 60 * 10);
    if (error || !data) {
      toast.error(error?.message ?? "Erro ao abrir");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Documentos operacionais</div>
        {canManage && (
          <>
            <Input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              {uploading ? "Enviando..." : "Adicionar"}
            </Button>
          </>
        )}
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Carregando...</div>
      ) : (docs ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Nenhum documento. {canManage && "Anexe instruções, ordens de trabalho ou procedimentos."}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {(docs ?? []).map((d) => {
            const Icon = d.kind === "pdf" ? FileText : ImageIcon;
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => openDoc(d)}
                  className="flex-1 truncate text-left text-sm hover:underline"
                >
                  {d.title}
                </button>
                <Button size="sm" variant="ghost" onClick={() => openDoc(d)} title="Abrir">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(d)} title="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        PDF, JPG ou PNG até 10 MB. Suporte futuro: checklist e vídeo.
      </p>
    </div>
  );
}