import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Send, Mail, RefreshCw, PencilLine, ShieldCheck } from "lucide-react";
import { sendInviteEmail } from "@/lib/invites/send-invite-email";

interface InviteRow {
  id: string;
  email: string;
  token: string;
  role: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  send_count: number;
  last_sent_at: string | null;
  expires_at: string;
  created_at: string;
  company_id: string;
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

function statusBadge(inv: InviteRow) {
  const now = Date.now();
  const isExpired = inv.status === "pending" && new Date(inv.expires_at).getTime() < now;
  if (inv.status === "accepted")
    return <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success"><ShieldCheck className="h-3 w-3" /> Aceito</span>;
  if (inv.status === "revoked")
    return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Revogado</span>;
  if (isExpired || inv.status === "expired")
    return <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Expirado</span>;
  return <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">Pendente</span>;
}

export function ManagerInviteCard({ companyId, companyName }: { companyId: string; companyName?: string | null }) {
  const { isSuperAdmin, isOwner } = useAuth() as { isSuperAdmin: boolean; isOwner?: boolean };
  const qc = useQueryClient();
  const [replaceOpen, setReplaceOpen] = useState<InviteRow | null>(null);
  const [newEmail, setNewEmail] = useState("");

  const canManage = isSuperAdmin || isOwner;

  const { data: invites = [] } = useQuery({
    queryKey: ["manager-invites", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, token, role, status, send_count, last_sent_at, expires_at, created_at, company_id")
        .eq("company_id", companyId)
        .in("role", ["manager", "owner"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
    enabled: canManage,
  });

  const resend = useMutation({
    mutationFn: async (inv: InviteRow) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("resend_invite", { _invite_id: inv.id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Resposta inválida do servidor");
      await sendInviteEmail({
        inviteId: row.id,
        token: row.token,
        email: row.email,
        role: row.role,
        companyId: row.company_id ?? companyId,
        companyName,
        sendCount: row.send_count,
        expiresAt: row.expires_at,
        kind: "resend",
      });
      return row;
    },
    onSuccess: () => {
      toast.success("Convite reenviado — email disparado.");
      qc.invalidateQueries({ queryKey: ["manager-invites", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao reenviar"),
  });

  const replace = useMutation({
    mutationFn: async (args: { inviteId: string; email: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("admin_replace_manager_invite", {
        _invite_id: args.inviteId,
        _new_email: args.email,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Resposta inválida do servidor");
      await sendInviteEmail({
        inviteId: row.id,
        token: row.token,
        email: row.email,
        role: row.role,
        companyId: row.company_id ?? companyId,
        companyName,
        sendCount: row.send_count ?? 1,
        expiresAt: row.expires_at,
        kind: "replace",
      });
      return row;
    },
    onSuccess: (row) => {
      toast.success(`Convite reemitido para ${row.email}.`);
      setReplaceOpen(null);
      setNewEmail("");
      qc.invalidateQueries({ queryKey: ["manager-invites", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao alterar email"),
  });

  if (!canManage) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Convite do Gestor</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reenviar ou trocar o email do gestor antes do aceite. Todos os envios são registados na auditoria.
          </p>
        </div>
      </div>

      {invites.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum convite de gestor emitido.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {invites.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">{inv.email}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {statusBadge(inv)}
                    <span>Envios: {inv.send_count}</span>
                    <span>Último envio: {fmtDate(inv.last_sent_at)}</span>
                    <span>Expira: {fmtDate(inv.expires_at)}</span>
                  </div>
                </div>
              </div>
              {inv.status !== "accepted" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resend.isPending}
                    onClick={() => resend.mutate(inv)}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Reenviar
                  </Button>
                  {inv.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReplaceOpen(inv);
                        setNewEmail("");
                      }}
                    >
                      <PencilLine className="mr-2 h-4 w-4" /> Alterar email
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!replaceOpen} onOpenChange={(v) => !v && setReplaceOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar email do gestor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O convite atual será revogado e um novo será enviado para o novo email.
          </p>
          <div className="space-y-2">
            <Label>Novo email do gestor</Label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="novo-gestor@empresa.com"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Anterior: {replaceOpen?.email}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceOpen(null)}>Cancelar</Button>
            <Button
              disabled={!newEmail || replace.isPending || newEmail.trim().toLowerCase() === replaceOpen?.email}
              onClick={() =>
                replaceOpen &&
                replace.mutate({ inviteId: replaceOpen.id, email: newEmail.trim().toLowerCase() })
              }
            >
              <Send className="mr-2 h-4 w-4" /> Revogar antigo e enviar novo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}