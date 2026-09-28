/**
 * Pré-visualização e impressão da Proposta Comercial de uma empresa.
 * Apenas leitura: usa o estado atual do painel de plano/módulos do Super Admin.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { buildProposalHtml, printProposal, type ProposalInput } from "@/lib/commercial-proposal";

type Props = {
  proposal: Omit<ProposalInput, "validityDays">;
};

export function CommercialProposalDialog({ proposal }: Props) {
  const [open, setOpen] = useState(false);
  const [validityDays, setValidityDays] = useState("15");

  const days = Number(validityDays);
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(Math.round(days), 180) : 15;

  const html = useMemo(
    () => buildProposalHtml({ ...proposal, validityDays: safeDays }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(proposal), safeDays, open],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4" />
        Gerar proposta (PDF)
      </Button>
      <DialogContent className="max-w-5xl">
        <ModalHeader title="Proposta comercial" description="Documento em A4 pronto para imprimir ou guardar em PDF." />
        <ModalBody>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Validade da proposta (dias)</Label>
              <Input
                className="w-32"
                inputMode="numeric"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Os valores refletem o plano, os módulos e o desconto configurados nesta empresa.
            </p>
          </div>
          <iframe
            title="Pré-visualização da proposta"
            srcDoc={html}
            className="h-[60vh] w-full rounded-lg border border-border bg-white"
          />
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          <Button
            type="button"
            onClick={() => {
              const ok = printProposal(html);
              if (!ok) toast.error("Permita janelas pop-up neste site para imprimir a proposta.");
            }}
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / Guardar PDF
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
