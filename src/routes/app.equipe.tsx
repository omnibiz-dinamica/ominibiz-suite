import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/equipe")({
  component: TeamPage,
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
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (roles ?? []).map((r) => ({ ...r, profile: profs?.find((p) => p.id === r.user_id) }));
    },
    enabled: !!currentCompanyId && isManager,
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
        <h2 className="font-display text-lg font-semibold">Membros</h2>
        <ul className="mt-4 divide-y divide-border">
          {(members ?? []).map((m) => (
            <li key={m.user_id + m.role} className="flex items-center justify-between py-3">
              <span className="font-medium">{m.profile?.full_name ?? m.user_id.slice(0, 8)}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{m.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}