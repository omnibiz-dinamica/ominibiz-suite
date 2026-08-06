import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, ModalHeader, ModalBody } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Trash2, Pencil, Power, Send, UserCog } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { sendTransactionalEmail } from "@/lib/email/send";
import { buildAppUrl } from "@/lib/app-url";
import { EmployeeEditor } from "@/components/equipe/EmployeeEditor";

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
  } | null;
}

function getMemberDisplayName(member: MemberRow) {
  const fullName = member.profile?.full_name?.trim();
  if (fullName) return fullName;

  const email = member.profile?.email?.trim();
  if (email) return email;

  return "Sem identificação";
}

export const Route = createFileRoute("/app/equipe")({
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
        .select("id, full_name, phone, is_active, job_title, work_location, supervisor_id, team")
        .in("id", ids);

      let emailsById = new Map<string, string>();
      try {
        const { data: emailRows } = await (supabase.from("profiles" as never) as any).select("id, email").in("id", ids);
        emailsById = new Map(
          ((emailRows ?? []) as Array<{ id: string; email: string | null }>)
            .filter((p) => p.email?.trim())
            .map((p) => [p.id, p.email!.trim()]),
        );
      } catch {
        emailsById = new Map();
      }

      const profileRows = (profs ?? []) as NonNullable<MemberRow["profile"]>[];
      return (roles ?? []).map((r) => ({
        ...r,
        profile: profileRows.find((p) => p.id === r.user_id)
          ? {
              ...profileRows.find((p) => p.id === r.user_id)!,
              email: emailsById.get(r.user_id) ?? null,
            }
          : null,
      })) as MemberRow[];
    },
    enabled: !!currentCompanyId && isManager,
  });

  const [editing, setEditing] = useState<MemberRow | null>(null);

  const toggleActive = useMutation({
    mutationFn: async (m: MemberRow) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !(m.profile?.is_active ?? true) })
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
        description: `O funcionÃ¡rio receberÃ¡ instruÃ§Ãµes em ${recipient}.`,
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
          Use para funcionÃ¡rio que jÃ¡ existe, perdeu a senha ou precisa entrar em outro aparelho.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendAccessLink.mutate();
          }}
        >
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label>Email do funcionÃ¡rio</Label>
            <Input type="email" required value={accessEmail} onChange={(e) => setAccessEmail(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={sendAccessLink.isPending}>
            <Send className="mr-2 h-4 w-4" />
            {sendAccessLink.isPending ? "Enviando..." : "Enviar acesso"}
          </Button>
        </form>
      </div>

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
        <h2 className="font-display text-lg font-semibold">Usuários</h2>
        <ul className="mt-4 divide-y divide-border">
          {(members ?? []).map((m) => {
            const active = m.profile?.is_active ?? true;
            const isSelf = m.user_id === user?.id;
            const displayName = getMemberDisplayName(m);
            const email = m.profile?.email?.trim() || null;
            const shouldShowEmailAside = email && email !== displayName;
            return (
              <li key={m.user_id + m.role} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
                  {(m.profile?.job_title || m.profile?.work_location || m.profile?.team) && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[m.profile?.job_title, m.profile?.work_location, m.profile?.team].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                {m.role !== "super_admin" && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditing(m)}>
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
