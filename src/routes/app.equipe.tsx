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

interface MemberRow {
  user_id: string;
  role: "manager" | "employee" | "super_admin";
  profile?: { id: string; full_name: string | null; phone: string | null; is_active: boolean } | null;
}

export const Route = createFileRoute("/app/equipe")({
  component: () => (
    <RoleGuard allow={["manager", "super_admin"]}>
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
        .select("id, full_name, phone, is_active")
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
      const { error } = await supabase.from("invites").insert({
        company_id: currentCompanyId!,
        email: email.trim().toLowerCase(),
        role,
        invited_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Convite criado");
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
  const [fullName, setFullName] = useState(member.profile?.full_name ?? "");
  const [phone, setPhone] = useState(member.profile?.phone ?? "");
  const [role, setRole] = useState<"manager" | "employee">(
    member.role === "manager" ? "manager" : "employee",
  );
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          const { error: pErr } = await supabase
            .from("profiles")
            .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
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
      <div className="space-y-1.5">
        <Label>Papel</Label>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">Funcionário</SelectItem>
            <SelectItem value="manager">Gestor</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}