import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Trash2, Pencil, Power } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { sendTransactionalEmail } from "@/lib/email/send";

interface MemberRow {
  user_id: string;
  role: "manager" | "employee" | "super_admin" | "owner";
  profile?: {
    id: string;
    full_name: string | null;
    phone: string | null;
    is_active: boolean;
    job_title: string | null;
    work_location: string | null;
    supervisor_id: string | null;
    team: string | null;
  } | null;
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
  const [role, setRole] = useState<"manager" | "employee">("employee");

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
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone, is_active, job_title, work_location, supervisor_id, team")
        .in("id", ids);
      return (roles ?? []).map((r) => ({
        ...r,
        profile: profs?.find((p) => p.id === r.user_id) ?? null,
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
      const { data: inv, error } = await supabase
        .from("invites")
        .insert({
          company_id: currentCompanyId!,
          email: recipient,
          role,
          invited_by: user!.id,
        })
        .select("id, token, expires_at")
        .single();
      if (error) throw error;

      // Dispatch invite email (single source of truth; logged in email_send_log)
      try {
        const inviteUrl = `${window.location.origin}/aceitar-convite?token=${inv.token}`;
        await sendTransactionalEmail({
          templateName: "invite",
          recipientEmail: recipient,
          idempotencyKey: `invite-${inv.id}`,
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
    },
    onSuccess: () => {
      toast.success("Convite criado e email enviado");
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
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Funcionário</SelectItem>
                <SelectItem value="manager">Gestor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={createInvite.isPending}>Enviar convite</Button>
        </form>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Convites pendentes</h2>
        <ul className="mt-4 divide-y divide-border">
          {(invites ?? []).map((i) => {
            const link = `${window.location.origin}/aceitar-convite?token=${i.token}`;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">{i.email}</div>
                  <div className="text-xs text-muted-foreground">{i.role} · {i.status}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}>
                    <Copy className="mr-1 h-3 w-3" /> Copiar link
                  </Button>
                  {i.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          {(invites ?? []).length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">Nenhum convite ainda.</li>
          )}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Usuários</h2>
        <ul className="mt-4 divide-y divide-border">
          {(members ?? []).map((m) => {
            const active = m.profile?.is_active ?? true;
            const isSelf = m.user_id === user?.id;
            return (
              <li key={m.user_id + m.role} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="truncate">{m.profile?.full_name ?? m.user_id.slice(0, 8)}</span>
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
                      {[m.profile?.job_title, m.profile?.work_location, m.profile?.team]
                        .filter(Boolean)
                        .join(" · ")}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          {editing && (
            <EditMemberForm
              member={editing}
              companyId={currentCompanyId!}
              onDone={() => {
                setEditing(null);
                qc.invalidateQueries({ queryKey: ["team-members"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditMemberForm({
  member,
  companyId,
  onDone,
}: {
  member: MemberRow;
  companyId: string;
  onDone: () => void;
}) {
  const { isOwner, isSuperAdmin } = useAuth();
  const [fullName, setFullName] = useState(member.profile?.full_name ?? "");
  const [phone, setPhone] = useState(member.profile?.phone ?? "");
  const [role, setRole] = useState<"manager" | "employee" | "owner">(
    member.role === "manager" || member.role === "owner" || member.role === "employee"
      ? (member.role as "manager" | "owner" | "employee")
      : "employee",
  );
  const [jobTitle, setJobTitle] = useState(member.profile?.job_title ?? "");
  const [workLocation, setWorkLocation] = useState(member.profile?.work_location ?? "");
  const [team, setTeam] = useState(member.profile?.team ?? "");
  const [supervisorId, setSupervisorId] = useState<string>(member.profile?.supervisor_id ?? "");
  const [loading, setLoading] = useState(false);

  const { data: peers = [] } = useQuery({
    queryKey: ["team-peers", companyId],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", companyId);
      const ids = (roles ?? []).map((r) => r.user_id).filter((id) => id !== member.user_id);
      if (ids.length === 0) return [] as { id: string; full_name: string | null }[];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return data ?? [];
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          const { error: pErr } = await supabase
            .from("profiles")
            .update({
              full_name: fullName.trim() || null,
              phone: phone.trim() || null,
              job_title: jobTitle.trim() || null,
              work_location: workLocation.trim() || null,
              team: team.trim() || null,
              supervisor_id: supervisorId || null,
            })
            .eq("id", member.user_id);
          if (pErr) throw pErr;
          if (role !== member.role) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: rErr } = await (supabase.rpc as any)("set_member_role", {
              _user_id: member.user_id,
              _company_id: companyId,
              _role: role,
            });
            if (rErr) throw rErr;
          }
          toast.success("Usuário atualizado");
          onDone();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label>Nome</Label>
        <Input maxLength={150} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Telefone</Label>
        <Input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cargo</Label>
          <Input maxLength={120} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Ex.: Motorista" />
        </div>
        <div className="space-y-1.5">
          <Label>Equipa / Departamento</Label>
          <Input maxLength={120} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Local de trabalho principal</Label>
        <Input
          maxLength={200}
          value={workLocation}
          onChange={(e) => setWorkLocation(e.target.value)}
          placeholder="Cliente, filial, posto..."
        />
      </div>
      <div className="space-y-1.5">
        <Label>Supervisor (opcional)</Label>
        <Select value={supervisorId || "none"} onValueChange={(v) => setSupervisorId(v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Sem supervisor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem supervisor</SelectItem>
            {peers.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Papel</Label>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">Funcionário</SelectItem>
            <SelectItem value="manager">Gestor</SelectItem>
            {(isOwner || isSuperAdmin) && (
              <SelectItem value="owner">Owner / Proprietário</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}