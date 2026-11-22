import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { EmployeePicker, type EmployeeOption } from "@/components/common/EmployeePicker";
import { reopenTicketWithMessage, requesterReopenTicket } from "@/lib/support/tickets";
import { tr } from "@/i18n";
import { TICKET_STATUS_LABEL } from "@/lib/support/constants";

export interface ReopenTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: { id: string; ticket_number: string; title: string; status: string };
  /** Solicitante é Funcionário → devolução informativa, sem escolha de destino. */
  requesterIsEmployee: boolean;
  requesterName?: string | null;
  employees: EmployeeOption[];
  onDone: () => void;
  /** 22/11/2026: quem abre é o próprio solicitante (funcionário) → volta à gestão. */
  asRequester?: boolean;
  /** Fila para onde o ticket volta (ex.: "Secretária"). */
  destinationName?: string | null;
}

/** Mensagens claras para os erros da reabertura pelo solicitante. */
export function requesterReopenErrorMessage(err: unknown): string {
  const raw = String((err as { message?: string })?.message ?? err ?? "");
  if (/not_authorized/.test(raw)) return tr("Só quem abriu o ticket pode reabri-lo.");
  if (/ticket_not_closed/.test(raw)) return tr("Este ticket já está aberto.");
  if (/message_required/.test(raw)) return tr("Escreva uma mensagem para reabrir o ticket.");
  if (/support_requester_reopen|function .* does not exist|PGRST202/i.test(raw))
    return tr("A reabertura pelo funcionário ainda não está ativa. Fale com a gestão.");
  return tr("Não foi possível reabrir o ticket.") + " " + raw;
}

/**
 * Modal canónico de reabertura (ADR-029).
 * Nunca usa window.prompt; toda a transição é atómica na RPC
 * public.reopen_support_ticket_with_message.
 */
export function ReopenTicketDialog({
  open,
  onOpenChange,
  ticket,
  requesterIsEmployee,
  requesterName,
  employees,
  onDone,
  asRequester = false,
  destinationName = null,
}: ReopenTicketDialogProps) {
  const [destination, setDestination] = useState<"employee" | "technical">("technical");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [impact, setImpact] = useState("");
  const [modulo, setModulo] = useState("");
  const [route, setRoute] = useState("");
  const [expected, setExpected] = useState("");
  const [found, setFound] = useState("");

  const effectiveDestination: "employee" | "technical" = requesterIsEmployee ? "employee" : destination;

  const technicalContext = useMemo(() => {
    if (effectiveDestination !== "technical") return null;
    const ctx: Record<string, string> = {};
    if (impact.trim()) ctx.impact = impact.trim();
    if (modulo.trim()) ctx.module = modulo.trim();
    if (route.trim()) ctx.route = route.trim();
    if (expected.trim()) ctx.expected_behavior = expected.trim();
    if (found.trim()) ctx.actual_behavior = found.trim();
    return Object.keys(ctx).length > 0 ? ctx : null;
  }, [effectiveDestination, impact, modulo, route, expected, found]);

  const canSubmit =
    (asRequester && message.trim().length > 0) ||
    message.trim().length > 0 &&
    (effectiveDestination === "technical" || requesterIsEmployee || !!assignee);

  const mut = useMutation({
    mutationFn: async () => {
      if (asRequester) {
        await requesterReopenTicket(ticket.id, message);
        return;
      }
      await reopenTicketWithMessage({
        ticketId: ticket.id,
        message,
        destinationType: effectiveDestination,
        assignedUserId: requesterIsEmployee ? null : effectiveDestination === "employee" ? assignee : null,
        technicalContext,
      });
    },
    onSuccess: () => {
      toast.success(
        asRequester
          ? tr("Ticket reaberto. A gestão foi avisada.")
          : effectiveDestination === "employee"
          ? "Ticket reaberto e enviado ao funcionário."
          : "Ticket reaberto e encaminhado ao Suporte Técnico.",
      );
      setMessage("");
      onOpenChange(false);
      onDone();
    },
    onError: (e) =>
      toast.error(asRequester ? requesterReopenErrorMessage(e) : "Erro: " + (e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <ModalHeader
          icon={RotateCcw}
          title={tr("Reabrir ticket")}
          description={tr("Este ticket está encerrado. Ao enviar uma nova mensagem, ele será reaberto.")}
        />
        <ModalBody className="space-y-3">
          <ModalSection title={tr("Ticket")}>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{tr("Número")}</dt>
                <dd className="font-mono font-medium">{ticket.ticket_number}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{tr("Título")}</dt>
                <dd className="truncate font-medium">{ticket.title}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{tr("Status atual")}</dt>
                <dd className="font-medium">
                  {tr(TICKET_STATUS_LABEL[ticket.status as keyof typeof TICKET_STATUS_LABEL] ?? ticket.status)}
                </dd>
              </div>
            </dl>
          </ModalSection>

          <ModalSection title={asRequester ? tr("Destino") : "Destino"}>
            {asRequester ? (
              <p className="text-sm text-muted-foreground" data-testid="requester-reopen-destination">
                {tr("O ticket volta para:")}{" "}
                <span className="font-medium text-foreground">{destinationName?.trim() || tr("Gestão")}</span>{" "}
                {tr("(Em análise pelo gestor)")}
              </p>
            ) : requesterIsEmployee ? (
              <p className="text-sm text-muted-foreground">
                Este ticket será devolvido para:{" "}
                <span className="font-medium text-foreground">{requesterName?.trim() || "Funcionário solicitante"}</span>
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Para quem deseja encaminhar este ticket?</p>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setDestination("employee")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${destination === "employee" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Funcionário
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestination("technical")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${destination === "technical" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Suporte Técnico
                  </button>
                </div>
                {destination === "employee" ? (
                  <EmployeePicker
                    employees={employees}
                    value={assignee}
                    onChange={setAssignee}
                    ariaLabel="Funcionário destino"
                    placeholder="Selecione o funcionário"
                  />
                ) : (
                  <p className="text-sm font-medium">Destino: Suporte Técnico OmniBiz</p>
                )}
              </div>
            )}
          </ModalSection>

          <ModalSection title={tr("Mensagem")} description={tr("Descreva a situação ou a orientação para quem vai continuar.")}>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder={tr("Escreva a mensagem…")} />
          </ModalSection>

          {!asRequester && effectiveDestination === "technical" && (
            <ModalSection title="Contexto técnico" description="Opcional, mas acelera a análise do Suporte Técnico.">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Impacto" />
                <Input value={modulo} onChange={(e) => setModulo(e.target.value)} placeholder="Módulo" />
                <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Rota / URL" />
                <Input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Comportamento esperado" />
                <Input
                  className="sm:col-span-2"
                  value={found}
                  onChange={(e) => setFound(e.target.value)}
                  placeholder="Comportamento encontrado"
                />
              </div>
            </ModalSection>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            {tr("Cancelar")}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
            {mut.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> {tr("Enviando")}
              </>
            ) : asRequester ? (
              tr("Reabrir ticket")
            ) : effectiveDestination === "employee" ? (
              "Reabrir e enviar ao Funcionário"
            ) : (
              "Reabrir e encaminhar ao Suporte Técnico"
            )}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}