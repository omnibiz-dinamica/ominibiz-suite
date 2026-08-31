import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { toast } from "sonner";
import { SignatureVistoCard } from "@/components/perfil/SignatureVistoCard";
import { MailCheck } from "lucide-react";
import { submitEmailChangeRequest } from "@/lib/user-email";
import { isValidEmailChangeReason, isValidUserEmail, normalizeUserEmail } from "@/lib/user-email-security";

export const Route = createFileRoute("/app/perfil")({ component: ProfilePage });

function ProfilePage() {
  const { user, profile, effectiveRole, currentCompanyId, refresh } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [emailRequestOpen, setEmailRequestOpen] = useState(false);
  const [requestedEmail, setRequestedEmail] = useState("");
  const [emailChangeReason, setEmailChangeReason] = useState("");

  const { data: emailChangeRequests = [] } = useQuery({
    queryKey: ["my-email-change-requests", user?.id, currentCompanyId],
    enabled: !!user?.id && !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_email_change_requests")
        .select("id, status, requested_email, reason, requested_at, decision_reason")
        .eq("user_id", user!.id)
        .order("requested_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pendingEmailRequest = emailChangeRequests.find((request) => request.status === "pending");
  const latestEmailRequest = emailChangeRequests[0];

  const requestEmailChange = useMutation({
    mutationFn: () =>
      submitEmailChangeRequest({
        companyId: currentCompanyId!,
        email: requestedEmail,
        reason: emailChangeReason,
      }),
    onSuccess: async () => {
      toast.success("Pedido enviado ao Gestor para aprovação.");
      setEmailRequestOpen(false);
      setRequestedEmail("");
      setEmailChangeReason("");
      await qc.invalidateQueries({ queryKey: ["my-email-change-requests", user?.id, currentCompanyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: opData } = useQuery({
    queryKey: ["profile-operational", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("job_title, work_location, team, supervisor_id, whatsapp")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      let supervisorName: string | null = null;
      if (data?.supervisor_id) {
        const { data: sup } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.supervisor_id)
          .maybeSingle();
        supervisorName = sup?.full_name ?? null;
      }
      return { ...(data ?? {}), supervisorName };
    },
  });

  const whatsappValue = whatsapp ?? ((opData as { whatsapp?: string | null } | undefined)?.whatsapp ?? "");
  const whatsappValid = whatsappValue.trim() === "" || /^\+[1-9]\d{7,14}$/.test(whatsappValue.trim());

  const save = useMutation({
    mutationFn: async () => {
      if (!whatsappValid) {
        throw new Error("WhatsApp deve estar no formato internacional, ex.: +351912345678");
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          whatsapp: whatsappValue.trim() || null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Perfil atualizado");
      await refresh();
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleLabel =
    effectiveRole === "super_admin"
      ? "Super Admin"
      : effectiveRole === "manager"
        ? "Gestor"
        : "Funcionário";

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Meu Perfil</h1>
        <p className="mt-1 text-muted-foreground">Seus dados pessoais e acesso.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Email</dt>
            <dd className="mt-0.5 break-all font-medium">{user?.email ?? "—"}</dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              E-mail de cadastro, bloqueado para edição direta.
            </dd>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={!currentCompanyId || !!pendingEmailRequest}
              onClick={() => setEmailRequestOpen(true)}
            >
              <MailCheck className="mr-2 h-4 w-4" />
              {pendingEmailRequest ? "Pedido em análise" : "Solicitar alteração"}
            </Button>
            {latestEmailRequest && (
              <p className="mt-2 text-xs text-muted-foreground">
                Último pedido: {emailRequestStatusLabel(latestEmailRequest.status)} para {latestEmailRequest.requested_email}
              </p>
            )}
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Papel</dt>
            <dd className="mt-0.5 font-medium">{roleLabel}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Dados operacionais</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Definidos pelo gestor. Para alterar, fale com seu gestor.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Cargo</dt>
            <dd className="mt-0.5 font-medium">{opData?.job_title ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Local de trabalho</dt>
            <dd className="mt-0.5 font-medium">{opData?.work_location ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Equipa / Departamento</dt>
            <dd className="mt-0.5 font-medium">{opData?.team ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Supervisor</dt>
            <dd className="mt-0.5 font-medium">{opData?.supervisorName ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label>Nome completo</Label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={150}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp</Label>
          <Input
            value={whatsappValue}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+351912345678"
            maxLength={20}
          />
          <p className={`text-xs ${whatsappValid ? "text-muted-foreground" : "text-destructive"}`}>
            Formato internacional obrigatório (E.164), ex.: +351912345678. Usado nas
            notificações de tickets.
          </p>
        </div>
        <Button type="submit" disabled={save.isPending || !whatsappValid}>
          {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </form>

      <SignatureVistoCard />

      <Dialog open={emailRequestOpen} onOpenChange={setEmailRequestOpen}>
        <DialogContent size="sm">
          <ModalHeader
            icon={MailCheck}
            title="Solicitar alteração de e-mail"
            description="O Gestor ou Super Admin precisa aprovar antes da troca."
          />
          <ModalBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>E-mail atual</Label>
              <Input type="email" value={user?.email ?? ""} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="requested-email">Novo e-mail *</Label>
              <Input
                id="requested-email"
                type="email"
                value={requestedEmail}
                onChange={(event) => setRequestedEmail(event.target.value)}
                autoComplete="email"
                maxLength={254}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-change-reason">Motivo *</Label>
              <Textarea
                id="email-change-reason"
                value={emailChangeReason}
                onChange={(event) => setEmailChangeReason(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Explique por que precisa alterar o e-mail de acesso"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setEmailRequestOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                requestEmailChange.isPending ||
                !currentCompanyId ||
                !isValidUserEmail(requestedEmail) ||
                normalizeUserEmail(requestedEmail) === normalizeUserEmail(user?.email ?? "") ||
                !isValidEmailChangeReason(emailChangeReason)
              }
              onClick={() => requestEmailChange.mutate()}
            >
              {requestEmailChange.isPending ? "Enviando..." : "Enviar pedido"}
            </Button>
          </ModalFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function emailRequestStatusLabel(status: string) {
  if (status === "approved") return "aprovado";
  if (status === "rejected") return "recusado";
  return "em análise";
}
