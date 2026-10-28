import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import {
  BANK_STATUS_LABEL,
  isValidIban,
  isValidSwift,
  maskIban,
  normalizeIban,
  type BankChangeRequest,
} from "@/lib/employee-history";

/**
 * Perfil → Dados bancários. O funcionário não edita o IBAN diretamente:
 * submete um pedido (fica registado quando pediu) e o gestor aprova ou rejeita.
 */
export function BankDetailsCard() {
  const { user, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [iban, setIban] = useState("");
  const [swift, setSwift] = useState("");
  const [note, setNote] = useState("");

  const { data: current } = useQuery({
    queryKey: ["my-bank-details", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("iban, swift")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { iban: null, swift: null }) as { iban: string | null; swift: string | null };
    },
  });

  const requestsKey = ["my-bank-change-requests", user?.id, currentCompanyId];
  const { data: requests = [] } = useQuery({
    queryKey: requestsKey,
    enabled: !!user?.id && !!currentCompanyId,
    queryFn: async () => {
      // Tabela nova: os tipos gerados podem ainda não a conhecer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("employee_bank_change_requests" as never) as any)
        .select(
          "id, company_id, user_id, iban, swift, note, status, created_at, decided_by, decided_at, decision_reason",
        )
        .eq("user_id", user!.id)
        .eq("company_id", currentCompanyId!)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as BankChangeRequest[];
    },
  });

  const pending = requests.find((r) => r.status === "pendente");

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["my-bank-change-requests"] }),
      qc.invalidateQueries({ queryKey: ["my-bank-details"] }),
    ]);

  const submit = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("employee_bank_change_submit", {
        _company_id: currentCompanyId,
        _iban: normalizeIban(iban),
        _swift: swift.trim() || null,
        _note: note.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Pedido enviado ao gestor para aprovação.");
      setOpen(false);
      setIban("");
      setSwift("");
      setNote("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (requestId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("employee_bank_change_cancel", {
        _request_id: requestId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Pedido cancelado.");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ibanOk = isValidIban(iban);
  const sameAsCurrent = ibanOk && normalizeIban(iban) === normalizeIban(current?.iban ?? "");
  const swiftOk = isValidSwift(swift);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Landmark className="h-4 w-4 text-primary" /> Dados bancários
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Para mudar o NIB/IBAN, envie um pedido. O gestor aprova e fica registado quando pediu e
        quando foi aprovado.
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">IBAN atual</dt>
          <dd className="mt-0.5 font-medium">{maskIban(current?.iban)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">SWIFT/BIC</dt>
          <dd className="mt-0.5 font-medium">{current?.swift || "—"}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!currentCompanyId || !!pending}
          onClick={() => setOpen(true)}
        >
          <Landmark className="mr-2 h-4 w-4" />
          {pending ? "Pedido em análise" : "Enviar novo NIB/IBAN"}
        </Button>
        {pending && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => {
              if (window.confirm("Cancelar o pedido de alteração do NIB/IBAN?"))
                cancel.mutate(pending.id);
            }}
          >
            Cancelar pedido
          </Button>
        )}
      </div>

      {requests.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm" aria-label="Os meus pedidos de NIB/IBAN">
          {requests.map((r) => (
            <li key={r.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{maskIban(r.iban)}</span>
                <span className="text-xs text-muted-foreground">
                  {BANK_STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Pedido em {new Date(r.created_at).toLocaleString("pt-PT")}
                {r.decided_at && r.status !== "pendente"
                  ? ` · ${BANK_STATUS_LABEL[r.status]?.toLowerCase() ?? r.status} em ${new Date(r.decided_at).toLocaleString("pt-PT")}`
                  : ""}
              </p>
              {r.status === "rejeitado" && r.decision_reason && (
                <p className="text-xs">Motivo: {r.decision_reason}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <ModalHeader
            icon={Landmark}
            title="Enviar novo NIB/IBAN"
            description="O gestor confere e aprova antes de mudar na sua ficha."
          />
          <ModalBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bank-iban">Novo IBAN *</Label>
              <Input
                id="bank-iban"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="PT50 0000 0000 0000 0000 0000 0"
                autoComplete="off"
                inputMode="text"
                maxLength={42}
              />
              {iban.trim() !== "" && !ibanOk && (
                <p className="text-xs text-destructive">IBAN inválido. Confira o número.</p>
              )}
              {sameAsCurrent && (
                <p className="text-xs text-destructive">Este IBAN já é o que está na sua ficha.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-swift">SWIFT/BIC (opcional)</Label>
              <Input
                id="bank-swift"
                value={swift}
                onChange={(e) => setSwift(e.target.value)}
                placeholder="Ex.: CGDIPTPL"
                autoComplete="off"
                maxLength={11}
              />
              {!swiftOk && (
                <p className="text-xs text-destructive">SWIFT/BIC inválido (8 ou 11 caracteres).</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-note">Observação (opcional)</Label>
              <Textarea
                id="bank-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ex.: mudei de banco"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                submit.isPending || !currentCompanyId || !ibanOk || sameAsCurrent || !swiftOk
              }
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Enviando..." : "Enviar pedido"}
            </Button>
          </ModalFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
