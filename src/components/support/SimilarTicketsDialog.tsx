/**
 * Modal preventivo de tickets semelhantes (ADR-048).
 *
 * Aparece ANTES da confirmação final da abertura de um novo ticket, quando o
 * servidor deteta tickets com o mesmo problema (ou significado semelhante).
 * Nunca mostra dados de outras empresas — apenas uma contagem agregada.
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  CopyCheck,
  ExternalLink,
  Loader2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalSection,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_LABEL,
} from "@/lib/support/constants";
import {
  reportSameProblem,
  signatureLabel,
  type SimilarResult,
  type SimilarTicket,
} from "@/lib/support/similar";

export interface SimilarTicketsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: SimilarResult | null;
  /** Continuar e criar o novo ticket mesmo assim. */
  onCreateAnyway: () => void;
  creating?: boolean;
  /** Abrir o ticket existente. */
  onOpenTicket: (ticketId: string) => void;
  /** Chamado depois de registar "tenho o mesmo problema". */
  onReported?: () => void;
}

const LEVEL_TONE: Record<string, string> = {
  strong: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  related: "border-border bg-muted/40 text-muted-foreground",
};

export function SimilarTicketsDialog({
  open,
  onOpenChange,
  result,
  onCreateAnyway,
  creating = false,
  onOpenTicket,
  onReported,
}: SimilarTicketsDialogProps) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);

  const own = result?.own ?? [];
  const others = result?.others ?? { count: 0, resolved: 0 };
  const strong = own.filter((t) => t.level === "strong");
  const related = own.filter((t) => t.level === "related");

  async function handleSame(ticket: SimilarTicket) {
    setReporting(ticket.id);
    try {
      const res = await reportSameProblem(ticket.id, noteFor === ticket.id ? note : null);
      toast.success(
        `Registámos o seu relato no ticket ${res.ticket_number ?? ""}. Já são ${res.affected_count} pessoa(s) afetadas.`.trim(),
      );
      onReported?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        "Não foi possível registar o relato: " + (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setReporting(null);
    }
  }

  function renderTicket(t: SimilarTicket) {
    return (
      <div
        key={t.id}
        className={`space-y-2 rounded-xl border p-3 text-sm ${LEVEL_TONE[t.level] ?? LEVEL_TONE.related}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold">{t.ticket_number}</span>
          <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px]">
            {TICKET_STATUS_LABEL[t.status] ?? t.status}
          </span>
          <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px]">
            {TICKET_PRIORITY_LABEL[t.priority] ?? t.priority}
          </span>
          <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px]">
            {TICKET_TYPE_LABEL[t.type] ?? t.type}
          </span>
          {t.level === "strong" && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold">
              <AlertTriangle className="h-3 w-3" /> provável duplicado
            </span>
          )}
        </div>

        <p className="font-medium text-foreground">{t.title}</p>
        <p className="line-clamp-3 text-xs text-muted-foreground">{t.description}</p>
        <p className="text-[11px] text-muted-foreground">
          Aberto em {new Date(t.created_at).toLocaleString("pt-PT")}
          {t.resolved_at && ` · resolvido em ${new Date(t.resolved_at).toLocaleDateString("pt-PT")}`}
          {t.affected_count > 0 && ` · ${t.affected_count} relato(s) adicional(is)`}
        </p>

        {noteFor === t.id && (
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Opcional: acrescente detalhes do seu caso (quando aconteceu, o que estava a fazer)."
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenTicket(t.id)}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Ver ticket
          </Button>
          {noteFor === t.id ? (
            <Button type="button" size="sm" disabled={reporting === t.id} onClick={() => handleSame(t)}>
              {reporting === t.id ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Confirmar relato
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setNoteFor(t.id);
                setNote("");
              }}
            >
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Tenho o mesmo problema
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <ModalHeader
          icon={CopyCheck}
          title="Já existe algo parecido"
          description="Encontrámos tickets relacionados com o problema que descreveu. Verifique antes de abrir um novo."
        />

        <ModalBody className="space-y-4">
          {result?.signature && (result.signature.action || result.signature.entity) && (
            <p className="text-xs text-muted-foreground">
              Assinatura detetada:{" "}
              <span className="font-medium text-foreground">
                {signatureLabel(result.signature.action, result.signature.entity)}
              </span>
            </p>
          )}

          {strong.length > 0 && (
            <ModalSection
              title="Mesmo problema"
              description="Muito provável que seja exatamente o que já foi reportado."
            >
              <div className="space-y-3">{strong.map(renderTicket)}</div>
            </ModalSection>
          )}

          {related.length > 0 && (
            <ModalSection
              title="Problemas semelhantes"
              description="Contexto parecido — pode ajudar a acompanhar."
            >
              <div className="space-y-3">{related.map(renderTicket)}</div>
            </ModalSection>
          )}

          {others.count > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium">Já identificámos relatos semelhantes noutras contas.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {others.resolved > 0
                  ? "A equipa técnica já tem este tema em análise e parte dos casos foi resolvida. Pode abrir o seu ticket — será associado ao tema pela equipa."
                  : "A equipa técnica já está a acompanhar este tema. Pode abrir o seu ticket para o seu caso ser seguido."}
              </p>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Voltar e editar
          </Button>
          <Button type="button" onClick={onCreateAnyway} disabled={creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Abrir novo ticket mesmo assim
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
