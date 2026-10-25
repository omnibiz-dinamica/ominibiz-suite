import { AlertTriangle, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DraftNoticeProps {
  /** Epoch ms da gravação do rascunho. */
  savedAt: number;
  /** true = o registo foi alterado depois do rascunho: exige escolha do utilizador. */
  conflict: boolean;
  /** Só usado em conflito: aplicar o rascunho por cima do registo atual. */
  onUseDraft?: () => void;
  onDiscard: () => void;
}

function formatTime(savedAt: number): string {
  const d = new Date(savedAt);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Aviso discreto de rascunho recuperado. Em conflito não aplica nada
 * automaticamente: o utilizador escolhe "Usar o meu rascunho" ou "Descartar".
 */
export function DraftNotice({ savedAt, conflict, onUseDraft, onDiscard }: DraftNoticeProps) {
  if (conflict) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Este registo foi alterado depois do seu rascunho.</span>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onUseDraft}>
          Usar o meu rascunho
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onDiscard}>
          Descartar rascunho
        </Button>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">Rascunho recuperado (gravado às {formatTime(savedAt)})</span>
      <button
        type="button"
        onClick={onDiscard}
        className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs hover:bg-muted"
      >
        <X className="h-3 w-3" aria-hidden />
        Descartar rascunho
      </button>
    </div>
  );
}
