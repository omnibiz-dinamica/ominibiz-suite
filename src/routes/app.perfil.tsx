import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SignatureVistoCard } from "@/components/perfil/SignatureVistoCard";

export const Route = createFileRoute("/app/perfil")({ component: ProfilePage });

function ProfilePage() {
  const { user, profile, effectiveRole, refresh } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState<string | null>(null);

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
            <dd className="mt-0.5 font-medium">{user?.email}</dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              Alterações de e-mail requerem autorização do Gestor.
            </dd>
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
    </div>
  );
}
