import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/app/perfil")({ component: ProfilePage });

function ProfilePage() {
  const { user, profile, effectiveRole, refresh } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
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
            <dd className="mt-0.5 font-medium">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Papel</dt>
            <dd className="mt-0.5 font-medium">{roleLabel}</dd>
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
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </div>
  );
}