import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { closeTicket } from "@/lib/support/tickets";
import { TICKET_STATUS_LABEL } from "@/lib/support/constants";

const DEFAULT_REASON = "Validado como resolvido";

export interface ArchiveTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: { id: string; ticket_number: string; title: string; status: string };
  onDone: () => void;
}

/**
 * Modal canónico de arquivamento (ADR-029 / SUP-2026-000070).
 * Nunca usa window.prompt: prompts nativos são suprimidos em PWA/mobile,
 * o que fazia o arquivamento falhar com "Motivo obrigatorio".
 */
export function ArchiveTicketDialog({ open, onOpenChange, ticket, onDone }: ArchiveTicketDialogProps) {
  const [reason, setReason] = useState(DEFAULT_REASON);

  useEffect(() => {
    if (open) setReason(DEFAULT_REASON);
  }, [open]);

  const mut = useMutation({
    mutationFn: async () => {
      await closeTicket(ticket.id, reason.trim());
    },
    onSuccess: () => {
      toast.success("Ticket arquivado.");
      onOpenChange(false);
      onDone();
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <ModalHeader
          icon={Archive}
          title="Arquivar ticket"
          description="O ticket sai da lista ativa e passa a constar como arquivado. A reabertura continua disponível."
        />
        <ModalBody className="space-y-3">
          <ModalSection title="Ticket">
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Número</dt>
                <dd className="font-mono font-medium">{ticket.ticket_number}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Título</dt>
                <dd className="truncate font-medium">{ticket.title}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Status atual</dt>
                <dd className="font-medium">
                  {TICKET_STATUS_LABEL[ticket.status as keyof typeof TICKET_STATUS_LABEL] ?? ticket.status}
                </dd>
              </div>
            </dl>
          </ModalSection>

          <ModalSection title="Motivo" description="Fica registado na timeline do ticket.">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex.: validado como resolvido pelo gestor"
              aria-label="Motivo do arquivamento"
            />
          </ModalSection>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!reason.trim() || mut.isPending}>
            {mut.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Arquivando
              </>
            ) : (
              "Arquivar ticket"
            )}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
