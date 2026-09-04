import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Trash2, Upload, ExternalLink, X } from "lucide-react";
import {
  formatTaskFileSize,
  mergeTaskFiles,
  TASK_DOCUMENT_ACCEPT,
  uploadTaskDocuments,
  type TaskDocument,
} from "@/lib/tasks/task-documents";

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["task-docs", taskId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("task_documents" as any) as any)
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskDocument[];
    },
  });

  const upload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    try {
      await uploadTaskDocuments({ taskId, companyId, files: selectedFiles });
      toast.success(`${selectedFiles.length} ${selectedFiles.length === 1 ? "documento enviado" : "documentos enviados"}`);
      setSelectedFiles([]);
      qc.invalidateQueries({ queryKey: ["task-docs", taskId] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar os documentos");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = useMutation({
    mutationFn: async (doc: TaskDocument) => {
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

  const openDoc = async (doc: TaskDocument) => {
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
              accept={TASK_DOCUMENT_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                const incoming = Array.from(e.target.files ?? []);
                setSelectedFiles((current) => mergeTaskFiles(current, incoming));
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              {uploading ? "Enviando..." : "Selecionar ficheiros"}
            </Button>
          </>
        )}
      </div>
      {canManage && selectedFiles.length > 0 && (
        <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/20 p-3">
          <p className="text-xs font-medium">Selecionados ({selectedFiles.length})</p>
          <ul className="space-y-1">
            {selectedFiles.map((file) => (
              <li key={`${file.name}-${file.lastModified}-${file.size}`} className="flex items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-muted-foreground">{formatTaskFileSize(file.size)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  title={`Remover ${file.name}`}
                  onClick={() => setSelectedFiles((current) => current.filter((item) => item !== file))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" disabled={uploading} onClick={() => void upload()}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Enviar {selectedFiles.length === 1 ? "documento" : "documentos"}
          </Button>
        </div>
      )}
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
        PDF, JPG ou PNG até 10 MB por ficheiro. É possível adicionar vários documentos.
      </p>
    </div>
  );
}
