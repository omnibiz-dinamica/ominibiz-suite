/**
 * SUP-2026-000242 — na tarefa, o funcionário vê os colegas que fazem a mesma
 * tarefa e abre os anexos que a gestão pôs (PDF/imagem, link temporário).
 */
import { useState } from "react";
import { FileText, Paperclip, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TaskDocument } from "@/lib/tasks/task-documents";
import { colleaguesLabel, type TaskColleague } from "@/lib/tasks/task-work-info";

export function TaskWorkInfo({
  colleagues,
  docs,
  compact = false,
}: {
  colleagues?: TaskColleague[];
  docs?: TaskDocument[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const people = colleagues ?? [];
  const files = docs ?? [];
  if (people.length === 0 && files.length === 0) return null;

  const openDoc = async (doc: TaskDocument) => {
    const { data, error } = await supabase.storage
      .from("task-docs")
      .createSignedUrl(doc.storage_path, 60 * 10);
    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível abrir o anexo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const text = compact ? "text-xs" : "text-sm";
  return (
    <div className={compact ? "mt-1.5 space-y-1.5" : "mt-2 space-y-2"}>
      {people.length > 0 && (
        <div
          className={`flex items-start gap-1.5 text-muted-foreground ${text}`}
          data-testid="task-colleagues"
        >
          <Users className={compact ? "mt-0.5 h-3 w-3 shrink-0" : "mt-0.5 h-3.5 w-3.5 shrink-0"} />
          <span>
            Com: <span className="font-medium text-foreground">{colleaguesLabel(people)}</span>
          </span>
        </div>
      )}
      {files.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 font-medium text-primary hover:bg-primary/10 ${text}`}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {files.length === 1 ? "1 anexo" : `${files.length} anexos`}
            <span className="text-muted-foreground">· {open ? "esconder" : "ver"}</span>
          </button>
          {open && (
            <ul className="mt-1.5 space-y-1">
              {files.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => void openDoc(d)}
                    className={`flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:bg-accent ${text}`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="shrink-0 text-xs text-primary">Abrir</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
