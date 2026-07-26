import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type SuperAdmin = { id: string; full_name: string | null; whatsapp: string | null; is_active: boolean };

/**
 * Configuração global da plataforma (public.platform_settings, linha singleton id = 1).
 * Define o Super Admin de suporte padrão usado no fallback de destinatário único
 * das notificações WhatsApp de tickets.
 */
export function PlatformSupportSettingsCard() {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_settings")
        .select("id, default_support_super_admin_id")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: number; default_support_super_admin_id: string | null } | null;
    },
  });

  const { data: admins = [] } = useQuery({
    queryKey: ["super-admin-profiles"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [] as SuperAdmin[];
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, whatsapp, is_active")
        .in("id", ids);
      return (data ?? []) as SuperAdmin[];
    },
  });

  useEffect(() => {
    setValue(settings?.default_support_super_admin_id ?? "");
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("platform_settings")
        .update({ default_support_super_admin_id: value || null })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração global salva");
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = admins.find((a) => a.id === value);
  const warning =
    selected && (!selected.is_active || !selected.whatsapp)
      ? !selected.is_active
        ? "Este utilizador está inativo — as notificações serão ignoradas."
        : "Este utilizador não tem WhatsApp válido no perfil — as notificações serão ignoradas."
      : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-lg font-semibold">Configurações globais da plataforma</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Super Admin de suporte padrão: recebe as notificações de tickets técnicos sem
        responsável atribuído. Destinatário sempre único.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-2">
          <Label>Super Admin de suporte padrão</Label>
          <Select value={value || "none"} onValueChange={(v) => setValue(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Não definido" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não definido</SelectItem>
              {admins.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name ?? a.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          Salvar
        </Button>
      </div>
      {warning && <p className="mt-3 text-xs text-destructive">{warning}</p>}
    </div>
  );
}
