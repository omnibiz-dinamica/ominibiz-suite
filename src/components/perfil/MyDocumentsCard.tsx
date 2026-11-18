/**
 * OmniBiz · "Os meus documentos" no Perfil (18/11/2026).
 *
 * O funcionário vê os anexos que o gestor marcou como "Funcionário pode ver"
 * (a RLS só devolve os dele e visíveis; o bucket também só deixa baixar esses
 * e a cópia assinada). Pode baixar o original e a cópia assinada e reabrir os
 * pendentes para ler/assinar (mesma janela de quando entra no sistema).
 */
import { useQuery } from "@tanstack/react-query";
import { Download, FileSignature, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  attachmentBadgeClass,
  attachmentStatusLabel,
  labelForCategory,
  type EmployeeAttachment,
} from "@/lib/employee-attachments";
import { openPendingDocuments } from "@/lib/pending-documents-events";

export function MyDocumentsCard() {
  const { user, currentCompanyId } = useAuth();

  const docs = useQuery({
    queryKey: ["my-documents", user?.id, currentCompanyId],
    enabled: !!user?.id && !!currentCompanyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("employee_attachments")
        .select("*")
        .eq("profile_id", user!.id)
        .eq("company_id", currentCompanyId!)
        .eq("employee_visible", true)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmployeeAttachment[];
    },
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("employee-docs").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) toast.error("Não foi possível abrir o arquivo.");
    else window.open(data.signedUrl, "_blank");
  };

  if (!user?.id || !currentCompanyId) return null;
  const list = docs.data ?? [];

  return (
    <section className="rounded-2xl border border-border bg-card p-6" data-testid="my-documents">
      <h2 className="font-display text-lg font-semibold">Os meus documentos</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Documentos que a gestão partilhou consigo. Pode baixar o original e, quando assinou, a cópia
        assinada.
      </p>

      {docs.isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A carregar…
        </p>
      )}
      {docs.isError && (
        <p className="mt-4 text-sm text-destructive">Não foi possível carregar os documentos.</p>
      )}
      {docs.isSuccess && list.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Ainda não há documentos para si.</p>
      )}

      {list.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {list.map((d) => {
            const pending = (d.employee_status ?? "pending") === "pending";
            return (
              <li
                key={d.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-start gap-2 text-sm font-medium">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="break-words">{d.file_name}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 pl-6 text-xs">
                    <span className="text-muted-foreground">{labelForCategory(d.category)}</span>
                    <span className={`rounded-full px-2 py-0.5 ${attachmentBadgeClass(d)}`}>
                      {attachmentStatusLabel(d)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-6 sm:pl-0">
                  {pending && (
                    <Button size="sm" onClick={() => openPendingDocuments()}>
                      <FileSignature className="h-4 w-4" />
                      {d.employee_action === "sign" ? "Abrir para assinar" : "Abrir para ler"}
                    </Button>
                  )}
                  {d.signed_storage_path && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void download(d.signed_storage_path!)}
                    >
                      <Download className="h-4 w-4" /> Baixar assinado
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => void download(d.storage_path)}>
                    <Download className="h-4 w-4" /> {d.signed_storage_path ? "Original" : "Baixar"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
