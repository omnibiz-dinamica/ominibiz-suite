import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, ModalHeader, ModalBody } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RecordHistoryMenu } from "@/components/history/RecordHistoryMenu";
import { Check, Copy, Landmark, MailCheck, Trash2, Pencil, Power, Send, UserCog, X } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { sendTransactionalEmail } from "@/lib/email/send";
import { buildAppUrl } from "@/lib/app-url";
import { EmployeeEditor } from "@/components/equipe/EmployeeEditor";
import { decideEmailChangeRequest } from "@/lib/user-email";
import { isEmployeeActive } from "@/lib/employee-status";
import { formatIban, type BankChangeRequest } from "@/lib/employee-history";

const FOCUS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aberto por aviso: ?bank=<pedido>&employee=<funcionário> (só UUIDs válidos). */
interface EquipeSearch {
  bank?: string;
  employee?: string;
}

interface MemberRow {
  user_id: string;
  role: "manager" | "employee" | "super_admin" | "owner";
  profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    is_active: boolean;
    job_title: string | null;
    work_location: string | null;
    supervisor_id: string | null;
    team: string | null;
    sector: string | null;
    status: string | null;
    termination_date: string | null;
  } | null;
}

type EmailChangeRequestRow = {
  id: string;
  user_id: string;
  current_email_redacted: string;
  requested_email: string;
  reason: string;
  requested_at: string;
};

const MEMBER_ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  manager: "Gestor",
  secretary: "Secretária",
  accountant: "Contabilidade",
  employee: "Funcionário",
  super_admin: "Super Admin",
};

function memberRoleLabel(role: string): string {
  return MEMBER_ROLE_LABEL[role] ?? role;
}

function getMemberDisplayName(member: MemberRow) {
  const fullName = member.profile?.full_name?.trim();
  if (fullName) return fullName;

  const email = member.profile?.email?.trim();
  if (email) return email;

  return "Sem identificação";
}

export const Route = createFileRoute("/app/equipe")({
  validateSearch: (raw: Record<string, unknown>): EquipeSearch => ({
    bank: typeof raw.bank === "string" && FOCUS_UUID.test(raw.bank) ? raw.bank : undefined,
    employee: typeof raw.employee === "string" && FOCUS_UUID.test(raw.employee) ? raw.employee : undefined,
  }),
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin"]}>
      <TeamPage />
    </RoleGuard>
  ),
});

function TeamPage() {
  const { isManager, currentCompanyId, user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [role, setRole] = useState<"manager" | "employee">("employee");
  const [inviteFilter, setInviteFilter] = useState<"open" | "all" | "pending" | "expired" | "accepted" | "revoked">(
    "open",
  );

  const { data: invites } = useQuery({
    queryKey: ["invites", currentCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .eq("company_id", currentCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentCompanyId && isManager,
  });

  const { data: members } = useQuery({
    queryKey: ["team-members", currentCompanyId],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", currentCompanyId!);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      // Keep the primary profile query independent from newer optional
      // columns so older Cloud Database environments still show names.
      const { data: profs } = await (supabase.from("profiles" as never) as any)
        .select(
          "id, full_name, phone, is_active, status, termination_date, job_title, work_location, supervisor_id, team",
        )
        .in("id", ids);

      let emailsById = new Map<string, string>();
      try {
        const { data: emailRows, error: emailError } = await supabase.rpc("company_member_emails", {
          _company_id: currentCompanyId!,
        });
        if (emailError) throw emailError;
        emailsById = new Map(
          ((emailRows ?? []) as Array<{ user_id: string; email: string | null }>)
            .filter((p) => p.email?.trim())
            .map((p) => [p.user_id, p.email!.trim()]),
        );
      } catch {
        // Keep the team editor available while the secure email RPC is being deployed.
        emailsById = new Map();
      }

      let sectorsById = new Map<string, string>();
      try {
        const { data: sectorRows } = await (supabase.from("profiles" as never) as any)
          .select("id, sector")
          .in("id", ids);
        sectorsById = new Map(
          ((sectorRows ?? []) as Array<{ id: string; sector: string | null }>)
            .filter((p) => p.sector?.trim())
            .map((p) => [p.id, p.sector!.trim()]),
        );
      } catch {
        // The list remains usable while the optional sector migration is applied.
        sectorsById = new Map();
      }

      const profileRows = (profs ?? []) as NonNullable<MemberRow["profile"]>[];
      return (roles ?? []).map((r) => ({
        ...r,
        profile: profileRows.find((p) => p.id === r.user_id)
          ? {
              ...profileRows.find((p) => p.id === r.user_id)!,
              email: emailsById.get(r.user_id) ?? null,
              sector: sectorsById.get(r.user_id) ?? null,
            }
          : null,
      })) as MemberRow[];
    },
    enabled: !!currentCompanyId && isManager,
  });

  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [editingTab, setEditingTab] = useState<string | undefined>(undefined);
  const focusSearch = Route.useSearch();

  // Pedidos de alteração de NIB/IBAN feitos pelos funcionários (decididos pelo gestor).
  const { data: bankChangeRequests = [] } = useQuery({
    queryKey: ["bank-change-requests", currentCompanyId, "pending"],
    enabled: !!currentCompanyId && isManager,
    queryFn: async () => {
      // Tabela nova: os tipos gerados podem ainda não a conhecer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("employee_bank_change_requests" as never) as any)
        .select("id, company_id, user_id, iban, swift, note, status, created_at, decided_by, decided_at, decision_reason")
        .eq("company_id", currentCompanyId!)
        .eq("status", "pendente")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BankChangeRequest[];
    },
  });

  const decideBankRequest = useMutation({
    mutationFn: async (input: { requestId: string; approve: boolean; reason?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("employee_bank_change_decide", {
        _request_id: input.requestId,
        _approve: input.approve,
        _reason: input.reason ?? null,
      });
      if (error) throw new Error(error.message);
      return input;
    },
    onSuccess: async (input) => {
      toast.success(input.approve ? "Novo IBAN aprovado e gravado na ficha." : "Pedido rejeitado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bank-change-requests", currentCompanyId] }),
        qc.invalidateQueries({ queryKey: ["employee-history"] }),
        qc.invalidateQueries({ queryKey: ["employee-profile"] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Vindo de um aviso de pedido de NIB/IBAN: leva até à secção dos pedidos.
  useEffect(() => {
    if (!focusSearch.bank) return;
    const id = window.setTimeout(() => {
      document.getElementById("pedidos-nib")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => window.clearTimeout(id);
  }, [focusSearch.bank, bankChangeRequests.length]);
  const [showInactive, setShowInactive] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSort, setMemberSort] = useState<"az" | "za">("az");
  const [memberRoleFilter, setMemberRoleFilter] = useState<string>("all");

  const { data: emailChangeRequests = [] } = useQuery({
    queryKey: ["email-change-requests", currentCompanyId, "pending"],
    enabled: !!currentCompanyId && isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_email_change_requests")
        .select("id, user_id, current_email_redacted, requested_email, reason, requested_at")
        .eq("company_id", currentCompanyId!)
        .eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmailChangeRequestRow[];
    },
  });

  const decideEmailRequest = useMutation({
    mutationFn: async (input: { decision: "approve" | "reject"; decisionReason?: string; requestId: string }) =>
      decideEmailChangeRequest(input),
    onSuccess: async (result) => {
      toast.success(result.status === "approved" ? "Alteração de e-mail aprovada." : "Pedido recusado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["email-change-requests", currentCompanyId] }),
        qc.invalidateQueries({ queryKey: ["team-members", currentCompanyId] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sectorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (members ?? []).map((m) => m.profile?.sector?.trim()).filter((sector): sector is string => Boolean(sector)),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [members],
  );

  /** Normaliza o Cargo / Função (job_title) para agrupar "Limpeza" e " limpeza " juntos. */
  const jobKey = (value: string | null | undefined) =>
    (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

  /** Opções do seletor: valores preenchidos no campo Cargo / Função da ficha do usuário. */
  const memberJobOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const m of members ?? []) {
      const label = m.profile?.job_title?.trim().replace(/\s+/g, " ");
      if (label && !byKey.has(jobKey(label))) byKey.set(jobKey(label), label);
    }
    const hasEmpty = (members ?? []).some((m) => !jobKey(m.profile?.job_title));
    const options = Array.from(byKey, ([key, label]) => ({ key, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    );
    return { options, hasEmpty };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  /** Lista de usuários com pesquisa, filtro de cargo/função e ordem alfabética. */
  const visibleMembers = useMemo(() => {
    const term = memberSearch
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const norm = (value: string | null | undefined) =>
      (value ?? "")
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const rows = (members ?? []).filter((m) => {
      if (showInactive ? isEmployeeActive(m.profile) : !isEmployeeActive(m.profile)) return false;
      if (memberRoleFilter === "__sem_cargo__" && jobKey(m.profile?.job_title)) return false;
      if (
        memberRoleFilter.startsWith("job:") &&
        memberRoleFilter !== "__sem_cargo__" &&
        jobKey(m.profile?.job_title) !== memberRoleFilter.slice(4)
      ) {
        return false;
      }
      if (!term) return true;
      return [
        getMemberDisplayName(m),
        m.profile?.email,
        m.profile?.phone,
        m.profile?.job_title,
        m.profile?.team,
        m.profile?.sector,
        memberRoleLabel(String(m.role)),
      ].some((value) => norm(value).includes(term));
    });
    return rows.sort((a, b) => {
      const cmp = getMemberDisplayName(a).localeCompare(getMemberDisplayName(b), "pt-BR", { sensitivity: "base" });
      return memberSort === "az" ? cmp : -cmp;
    });
  }, [members, showInactive, memberSearch, memberRoleFilter, memberSort]);

  const toggleActive = useMutation({
    mutationFn: async (m: MemberRow) => {
      const activate = !isEmployeeActive(m.profile);
      const { error } = await supabase
        .from("profiles")
        .update({
          is_active: activate,
          status: activate ? "ativo" : "inativo",
          ...(activate ? { termination_date: null } : {}),
        })
        .eq("id", m.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (m: MemberRow) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("remove_member", {
        _user_id: m.user_id,
        _company_id: currentCompanyId!,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuário removido");
      qc.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createInvite = useMutation({
    mutationFn: async () => {
      const recipient = email.trim().toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("create_or_resend_invite", {
        _company_id: currentCompanyId!,
        _email: recipient,
        _role: role,
      });
      if (error) throw error;
      const inv = Array.isArray(data) ? data[0] : data;
      if (!inv) throw new Error("Resposta inválida do servidor");

      // Dispatch invite email (single source of truth; logged in email_send_log)
      try {
        const inviteUrl = buildAppUrl(`/aceitar-convite?token=${inv.token}`);
        await sendTransactionalEmail({
          templateName: "invite",
          recipientEmail: recipient,
          idempotencyKey: `invite-${inv.id}-${inv.send_count ?? 1}`,
          triggerSource: "invite",
          companyId: currentCompanyId,
          templateData: {
            inviteUrl,
            role: role === "manager" ? "Gestor" : "Funcionário",
            expiresAt: inv.expires_at ? new Date(inv.expires_at).toLocaleDateString("pt-PT") : undefined,
          },
        });
      } catch (e) {
        // Don't roll back the invite — email failures are visible in audit log
        console.warn("Invite email dispatch failed", e);
      }
      return inv as { action?: string };
    },
    onSuccess: (inv) => {
      const action = inv?.action;
      const msg =
        action === "resent"
          ? "Convite reenviado (já existia um pendente)."
          : action === "reactivated"
            ? "Convite reativado com novo token e email enviado."
            : "Convite criado e email enviado.";
      toast.success(msg);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invites").update({ status: "revoked" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });

  const resendInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("resend_invite", { _invite_id: inviteId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Resposta inválida do servidor");
      const inviteUrl = buildAppUrl(`/aceitar-convite?token=${row.token}`);
      await sendTransactionalEmail({
        templateName: "invite",
        recipientEmail: row.email,
        idempotencyKey: `invite-resend-${row.id}-${row.send_count}`,
        triggerSource: "invite",
        companyId: row.company_id ?? currentCompanyId,
        templateData: {
          inviteUrl,
          role: row.role === "manager" ? "Gestor" : "Funcionário",
          expiresAt: row.expires_at ? new Date(row.expires_at).toLocaleDateString("pt-PT") : undefined,
        },
      });
      return row;
    },
    onSuccess: (row) => {
      toast.success("Convite reenviado com sucesso.", {
        description: row?.was_expired ? "Novo token gerado (o anterior expirou)." : undefined,
      });
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao reenviar convite"),
  });

  const sendAccessLink = useMutation({
    mutationFn: async () => {
      const recipient = accessEmail.trim().toLowerCase();
      const { error } = await supabase.auth.resetPasswordForEmail(recipient, {
        redirectTo: buildAppUrl("/reset-password"),
      });
      if (error) throw error;
      return recipient;
    },
    onSuccess: (recipient) => {
      toast.success("Link de acesso enviado.", {
        description: `O funcionário receberá instruções em ${recipient}.`,
      });
      setAccessEmail("");
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao enviar link de acesso"),
  });

  if (!isManager) {
    return <div className="text-muted-foreground">Acesso restrito a gestores.</div>;
  }

  if (!currentCompanyId) {
    return (
      <div className="rounded-2xl border border-warning/40 bg-warning/10 p-6 text-warning-foreground">
        Sua empresa ainda está aguardando aprovação para liberar a equipe.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Equipe</h1>
        <p className="mt-1 text-muted-foreground">Convide funcionários e gestores para sua empresa.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Convidar pessoa</h2>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createInvite.mutate();
          }}
        >
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Funcionário</SelectItem>
                <SelectItem value="manager">Gestor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={createInvite.isPending}>
            Enviar convite
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Reenviar acesso</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use para funcionário que já existe, perdeu a senha ou precisa entrar em outro aparelho.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendAccessLink.mutate();
          }}
        >
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label>Email do funcionário</Label>
            <Input type="email" required value={accessEmail} onChange={(e) => setAccessEmail(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={sendAccessLink.isPending}>
            <Send className="mr-2 h-4 w-4" />
            {sendAccessLink.isPending ? "Enviando..." : "Enviar acesso"}
          </Button>
        </form>
      </div>

      <BankChangeRequestsSection
        members={members ?? []}
        requests={bankChangeRequests}
        highlightId={focusSearch.bank ?? null}
        savingId={decideBankRequest.isPending ? (decideBankRequest.variables?.requestId ?? null) : null}
        onApprove={(request) => {
          if (!window.confirm(`Aprovar e gravar na ficha o IBAN ${formatIban(request.iban)}?`)) return;
          decideBankRequest.mutate({ requestId: request.id, approve: true });
        }}
        onReject={(request) => {
          const reason = window.prompt("Motivo da rejeição (obrigatório):", "");
          if (reason === null) return;
          if (reason.trim().length < 3) {
            toast.error("Indique o motivo da rejeição.");
            return;
          }
          decideBankRequest.mutate({ requestId: request.id, approve: false, reason: reason.trim() });
        }}
        onOpenHistory={(member) => {
          setEditingTab("historico");
          setEditing(member);
        }}
      />

      <EmailChangeRequestsSection
        members={members ?? []}
        requests={emailChangeRequests}
        savingId={decideEmailRequest.isPending ? (decideEmailRequest.variables?.requestId ?? null) : null}
        onApprove={(request) => {
          if (!window.confirm(`Aprovar a troca para ${request.requested_email}?`)) return;
          decideEmailRequest.mutate({ decision: "approve", requestId: request.id });
        }}
        onReject={(request) => {
          const reason = window.prompt("Motivo da recusa (opcional):", "");
          if (reason === null) return;
          decideEmailRequest.mutate({
            decision: "reject",
            decisionReason: reason,
            requestId: request.id,
          });
        }}
      />

      <div className="rounded-2xl border border-border bg-card p-6">
        <InvitesSection
          invites={(invites ?? []) as unknown as InviteRow[]}
          filter={inviteFilter}
          setFilter={setInviteFilter}
          onCopy={(token) => {
            navigator.clipboard.writeText(buildAppUrl(`/aceitar-convite?token=${token}`));
            toast.success("Link copiado");
          }}
          onResend={(id) => resendInvite.mutate(id)}
          onRevoke={(id) => revoke.mutate(id)}
          resendingId={resendInvite.isPending ? (resendInvite.variables ?? null) : null}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Usuários</h2>
          <Button
            type="button"
            size="sm"
            variant={showInactive ? "default" : "outline"}
            aria-pressed={showInactive}
            onClick={() => setShowInactive((v) => !v)}
          >
            {showInactive ? "Lista Ativa" : "Lista Inativa"}
          </Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_220px]">
          <Input
            type="search"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Pesquisar por nome, email, telefone ou cargo..."
            aria-label="Pesquisar usuário"
          />
          <Select value={memberSort} onValueChange={(v) => setMemberSort(v as "az" | "za")}>
            <SelectTrigger aria-label="Ordem alfabética">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="az">Nome A → Z</SelectItem>
              <SelectItem value="za">Nome Z → A</SelectItem>
            </SelectContent>
          </Select>
          <Select value={memberRoleFilter} onValueChange={setMemberRoleFilter}>
            <SelectTrigger aria-label="Cargo ou função">
              <SelectValue placeholder="Cargo / função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cargos / funções</SelectItem>
              {memberJobOptions.options.map((job) => (
                <SelectItem key={`job:${job.key}`} value={`job:${job.key}`}>
                  {job.label}
                </SelectItem>
              ))}
              {memberJobOptions.hasEmpty && <SelectItem value="__sem_cargo__">Sem cargo / função</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {visibleMembers.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Nenhum usuário encontrado com estes filtros.
            </li>
          )}
          {visibleMembers.map((m) => {
            const active = isEmployeeActive(m.profile);
            const isSelf = m.user_id === user?.id;
            const displayName = getMemberDisplayName(m);
            const email = m.profile?.email?.trim() || null;
            const shouldShowEmailAside = email && email !== displayName;
            return (
              <RecordHistoryMenu key={m.user_id + m.role} entityType="employee" entityId={m.user_id} title={getMemberDisplayName(m)}>
              <li className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-medium">
                    <span className="truncate">{displayName}</span>
                    {shouldShowEmailAside && (
                      <span className="break-all text-sm font-normal text-muted-foreground">{email}</span>
                    )}
                    {!active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        inativo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.role} {m.profile?.phone ? `· ${m.profile.phone}` : ""}
                  </div>
                  {(m.profile?.job_title || m.profile?.work_location || m.profile?.team || m.profile?.sector) && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[m.profile?.job_title, m.profile?.work_location, m.profile?.team, m.profile?.sector]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>
                {m.role !== "super_admin" && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Editar"
                      onClick={() => {
                        setEditingTab(undefined);
                        setEditing(m);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={active ? "Desativar" : "Ativar"}
                      onClick={() => toggleActive.mutate(m)}
                      disabled={toggleActive.isPending}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    {!isSelf && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Remover"
                        onClick={() => {
                          if (confirm(`Remover "${m.profile?.full_name ?? "usuário"}" da empresa?`))
                            removeMember.mutate(m);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
              </RecordHistoryMenu>
            );
          })}
          {(members ?? []).length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">Nenhum usuário ainda.</li>
          )}
        </ul>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent size="xl">
          <ModalHeader
            icon={UserCog}
            title="Editar colaborador"
            description={editing ? getMemberDisplayName(editing) : undefined}
          />
          <ModalBody className="p-0">
            {editing && (
              <EmployeeEditor
                userId={editing.user_id}
                companyId={currentCompanyId!}
                currentRole={editing.role}
                currentEmail={editing.profile?.email ?? null}
                sectorOptions={sectorOptions}
                initialTab={editingTab}
                onDone={() => {
                  setEditing(null);
                  qc.invalidateQueries({ queryKey: ["team-members"] });
                }}
              />
            )}
          </ModalBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BankChangeRequestsSection({
  highlightId,
  members,
  onApprove,
  onOpenHistory,
  onReject,
  requests,
  savingId,
}: {
  highlightId: string | null;
  members: MemberRow[];
  onApprove: (request: BankChangeRequest) => void;
  onOpenHistory: (member: MemberRow) => void;
  onReject: (request: BankChangeRequest) => void;
  requests: BankChangeRequest[];
  savingId: string | null;
}) {
  return (
    <section id="pedidos-nib" className="scroll-mt-20 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-display text-lg font-semibold">Pedidos de alteração de NIB/IBAN</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enviados pelos funcionários no Perfil. Ao aprovar, o IBAN é gravado na ficha e tudo fica no histórico.
          </p>
        </div>
      </div>

      {requests.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Nenhum pedido pendente.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {requests.map((request) => {
            const member = members.find((item) => item.user_id === request.user_id);
            const displayName = member ? getMemberDisplayName(member) : "Funcionário";
            const highlighted = highlightId === request.id;
            return (
              <li
                key={request.id}
                className={`grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${highlighted ? "-mx-2 rounded-lg bg-primary/5 px-2" : ""}`}
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{displayName}</p>
                  <p className="break-all font-mono text-sm">{formatIban(request.iban)}</p>
                  {request.swift && <p className="text-sm text-muted-foreground">SWIFT/BIC: {request.swift}</p>}
                  {request.note && <p className="text-sm">Observação: {request.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    Pedido em {new Date(request.created_at).toLocaleString("pt-PT")}
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {member && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1 sm:flex-none"
                      onClick={() => onOpenHistory(member)}
                    >
                      Ver histórico
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    disabled={savingId === request.id}
                    onClick={() => onReject(request)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Rejeitar
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 sm:flex-none"
                    disabled={savingId === request.id}
                    onClick={() => onApprove(request)}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Aprovar
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

function EmailChangeRequestsSection({
  members,
  onApprove,
  onReject,
  requests,
  savingId,
}: {
  members: MemberRow[];
  onApprove: (request: EmailChangeRequestRow) => void;
  onReject: (request: EmailChangeRequestRow) => void;
  requests: EmailChangeRequestRow[];
  savingId: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-display text-lg font-semibold">Alterações de e-mail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pedidos enviados pelos titulares das contas e aguardando decisão.
          </p>
        </div>
      </div>

      {requests.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Nenhum pedido pendente.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {requests.map((request) => {
            const member = members.find((item) => item.user_id === request.user_id);
            const displayName = member ? getMemberDisplayName(member) : "Utilizador";
            return (
              <li key={request.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{displayName}</p>
                  <p className="break-all text-sm text-muted-foreground">
                    {request.current_email_redacted} → {request.requested_email}
                  </p>
                  <p className="text-sm">Motivo: {request.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Solicitado em {new Date(request.requested_at).toLocaleString("pt-PT")}
                  </p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    disabled={savingId === request.id}
                    onClick={() => onReject(request)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Recusar
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 sm:flex-none"
                    disabled={savingId === request.id}
                    onClick={() => onApprove(request)}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Aprovar
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

type InviteRow = {
  id: string;
  email: string;
  role: "manager" | "employee" | "owner" | "super_admin";
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string;
  created_at: string;
  expires_at: string;
  last_sent_at: string | null;
  send_count: number | null;
};

function isInviteExpired(i: InviteRow): boolean {
  return i.status === "expired" || (i.status === "pending" && new Date(i.expires_at) < new Date());
}

function effectiveStatus(i: InviteRow): "pending" | "accepted" | "revoked" | "expired" {
  if (i.status === "pending" && new Date(i.expires_at) < new Date()) return "expired";
  return i.status;
}

function StatusBadge({ status }: { status: "pending" | "accepted" | "revoked" | "expired" }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    accepted: { label: "Aceito", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    expired: { label: "Expirado", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
    revoked: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${m.cls}`}>{m.label}</span>;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-PT");
  } catch {
    return "—";
  }
}

function InvitesSection({
  invites,
  filter,
  setFilter,
  onCopy,
  onResend,
  onRevoke,
  resendingId,
}: {
  invites: InviteRow[];
  filter: "open" | "all" | "pending" | "expired" | "accepted" | "revoked";
  setFilter: (v: "open" | "all" | "pending" | "expired" | "accepted" | "revoked") => void;
  onCopy: (token: string) => void;
  onResend: (id: string) => void;
  onRevoke: (id: string) => void;
  resendingId: string | null;
}) {
  const stats = {
    pending: invites.filter((i) => effectiveStatus(i) === "pending").length,
    accepted: invites.filter((i) => effectiveStatus(i) === "accepted").length,
    expired: invites.filter((i) => effectiveStatus(i) === "expired").length,
    revoked: invites.filter((i) => effectiveStatus(i) === "revoked").length,
  };
  const filtered = invites.filter((i) => {
    const s = effectiveStatus(i);
    if (filter === "all") return true;
    if (filter === "open") return s === "pending" || s === "expired";
    return s === filter;
  });
  const FILTERS: { v: typeof filter; label: string }[] = [
    { v: "open", label: "Em aberto" },
    { v: "pending", label: "Pendentes" },
    { v: "expired", label: "Expirados" },
    { v: "accepted", label: "Aceitos" },
    { v: "revoked", label: "Cancelados" },
    { v: "all", label: "Todos" },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Convites</h2>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase text-muted-foreground">Pendentes</div>
          <div className="mt-1 font-display text-2xl font-semibold">{stats.pending}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase text-muted-foreground">Aceitos</div>
          <div className="mt-1 font-display text-2xl font-semibold">{stats.accepted}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase text-muted-foreground">Expirados</div>
          <div className="mt-1 font-display text-2xl font-semibold">{stats.expired}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFilter(f.v)}
            className={`rounded-full px-3 py-1 text-xs ${filter === f.v ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3 hidden sm:table-cell">Cargo</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3 hidden md:table-cell">Criado</th>
              <th className="py-2 pr-3 hidden md:table-cell">Último envio</th>
              <th className="py-2 pr-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const s = effectiveStatus(i);
              const canResend = s === "pending" || s === "expired";
              const sendCount = i.send_count ?? 1;
              const rateLimited =
                sendCount >= 5 &&
                i.last_sent_at !== null &&
                Date.now() - new Date(i.last_sent_at).getTime() < 24 * 60 * 60 * 1000;
              return (
                <tr key={i.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-medium break-all">{i.email}</td>
                  <td className="py-2 pr-3 text-muted-foreground hidden sm:table-cell">
                    {i.role === "manager" ? "Gestor" : i.role === "employee" ? "Funcionário" : i.role}
                  </td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={s} />
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground hidden md:table-cell">
                    {fmtDate(i.created_at)}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground hidden md:table-cell">
                    {fmtDate(i.last_sent_at)} <span className="ml-1 opacity-70">({sendCount}x)</span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => onCopy(i.token)} title="Copiar link">
                        <Copy className="h-3 w-3" />
                      </Button>
                      {canResend && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onResend(i.id)}
                          disabled={rateLimited || resendingId === i.id}
                          title={rateLimited ? "Limite de 5 reenvios por 24h atingido" : "Reenviar convite"}
                        >
                          <Send className="mr-1 h-3 w-3" /> Reenviar
                        </Button>
                      )}
                      {(s === "pending" || s === "expired") && (
                        <Button size="sm" variant="ghost" onClick={() => onRevoke(i.id)} title="Cancelar convite">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum convite neste filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
