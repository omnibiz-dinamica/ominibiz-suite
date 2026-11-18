/**
 * SUP-160 (18/11/2026) — o gestor cria uma notificação "formal".
 * Para quem: pessoas da empresa (funcionários, gestores, contabilista…), todos
 * os ativos, e/ou "encaminhar para" alguém fora do programa (Contabilista, Léa,
 * Luc…), que fica nas notificações da gestão em "Em tratamento".
 * O envio é feito no banco (manager_send_notification valida gestão/empresa).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeeMultiPicker } from "@/components/common/EmployeePicker";
import { FORWARD_SUGGESTIONS } from "@/lib/notifications/forwarding";

export type ManagerNotificationInput = {
  companyId: string;
  userIds: string[];
  title: string;
  body: string;
  priority: "baixa" | "media" | "alta" | "urgente";
  forwardTo: string;
};

/** Valida no ecrã (o banco volta a validar). Devolve a mensagem de erro ou null. */
export function validateManagerNotification(v: ManagerNotificationInput): string | null {
  const title = v.title.trim();
  if (title.length < 3 || title.length > 120) return "O título deve ter entre 3 e 120 caracteres.";
  if (v.body.trim().length > 2000) return "A mensagem pode ter no máximo 2000 caracteres.";
  if (v.userIds.length === 0 && !v.forwardTo.trim())
    return "Escolha pelo menos uma pessoa ou para quem encaminhar.";
  if (v.userIds.length > 500) return "No máximo 500 pessoas por envio.";
  return null;
}

export async function sendManagerNotification(v: ManagerNotificationInput) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("manager_send_notification", {
    _company_id: v.companyId,
    _user_ids: v.userIds,
    _title: v.title.trim(),
    _body: v.body.trim() || null,
    _priority: v.priority,
    _forward_to: v.forwardTo.trim() || null,
  });
  if (error) throw error;
  return data as { enviadas: number; ignoradas: number; encaminhada_para: string | null };
}

export function NewManagerNotificationDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
}) {
  const qc = useQueryClient();
  const [userIds, setUserIds] = useState<string[]>([]);
  const [everyone, setEveryone] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<ManagerNotificationInput["priority"]>("media");
  const [forwardTo, setForwardTo] = useState("");
  const [busy, setBusy] = useState(false);

  const members = useQuery({
    queryKey: ["notification-recipients", companyId],
    enabled: open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("company_active_member_options");
      if (error) throw error;
      return ((data ?? []) as { id: string; full_name: string | null; company_id: string }[])
        .filter((m) => m.company_id === companyId)
        .map(({ id, full_name }) => ({ id, full_name }));
    },
  });
  const recipients = useMemo(
    () => (everyone ? (members.data ?? []).map((m) => m.id) : userIds),
    [everyone, members.data, userIds],
  );

  const reset = () => {
    setUserIds([]);
    setEveryone(false);
    setTitle("");
    setBody("");
    setPriority("media");
    setForwardTo("");
  };

  const submit = async () => {
    const input = { companyId, userIds: recipients, title, body, priority, forwardTo };
    const err = validateManagerNotification(input);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const r = await sendManagerNotification(input);
      const parts = [];
      if (r.enviadas) parts.push(`enviada a ${r.enviadas} pessoa(s)`);
      if (r.encaminhada_para) parts.push(`encaminhada para ${r.encaminhada_para}`);
      toast.success(`Notificação ${parts.join(" e ")}.`);
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent size="md">
        <ModalHeader
          icon={BellPlus}
          title="Nova notificação"
          description="Envie um aviso formal a pessoas da empresa e/ou registe para quem encaminhou o assunto."
        />
        <ModalBody className="space-y-4" data-testid="new-manager-notification">
          <div className="space-y-2">
            <Label>Para</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={everyone} onCheckedChange={(v) => setEveryone(v === true)} />
              Todos os ativos ({members.data?.length ?? "…"})
            </label>
            {!everyone && (
              <EmployeeMultiPicker
                employees={members.data ?? []}
                values={userIds}
                onValuesChange={setUserIds}
                placeholder="Escolher pessoas (funcionários, gestores, contabilista…)"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn-title">Título *</Label>
            <Input
              id="mn-title"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Atualizar o título de residência"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn-body">Mensagem</Label>
            <Textarea
              id="mn-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ex.: O seu título de residência expira a 30/11. Envie o novo até essa data, por favor."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mn-forward">Encaminhar também para (opcional)</Label>
              <Input
                id="mn-forward"
                maxLength={60}
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
                placeholder="Ex.: Contabilista, Léa, Luc…"
              />
              <div className="flex flex-wrap gap-1.5">
                {FORWARD_SUGGESTIONS.slice(0, 3).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setForwardTo(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellPlus className="h-4 w-4" />}
            Enviar
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
